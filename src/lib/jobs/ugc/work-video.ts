import { and, asc, eq, max } from "drizzle-orm";
import { z } from "zod";
import type { AppDatabase } from "@/database/client";
import {
  ugcClips,
  ugcProducts,
  ugcScenes,
  ugcScripts,
  ugcTalents,
  ugcWorkFrames,
  ugcWorks,
} from "@/database/ugc";
import {
  CLIP_SPEC,
  CREDIT_COST,
  MAX_PRODUCT_IMAGES,
  VIDEO_MODELS,
  VIDEO_RESOLUTIONS,
} from "@/lib/ugc/constants";
import {
  getVideoTask,
  submitVideo,
  videoPromptLimit,
  videoTaskProvider,
} from "@/lib/ugc/media/video-provider";
import { mediaTaskLog } from "@/lib/ugc/media/task-log";
import { evaluateClipQuality } from "@/lib/ugc/qc";
import {
  createPrismRequestId,
  getTask as getImageTask,
  submitImage,
} from "@/lib/ugc/media/prism";
import {
  archiveRemoteAsset,
  archiveSubtitleTrack,
  buildCoverPrompt,
  buildSubtitleTrack,
  buildVideoPrompt,
  productReferenceUrls,
  videoProductBudget,
  renderSubjectFor,
  type RenderSubject,
} from "@/lib/ugc/render";
import {
  createClipStorage,
  resolveReferenceUrls,
  StorageUnavailableError,
  type ClipStorage,
} from "@/lib/ugc/storage";
import { recordUsage } from "@/lib/ugc/usage";
import type { ScriptBeat } from "@/lib/ugc/types";
import { VIDEO_PROGRESS_STEP } from "@/lib/ugc/video-progress";
import {
  defineJob,
  type JobHandlerContext,
  PermanentJobError,
} from "../definition";

const POLL_SECONDS = 20;

/**
 * How long each provider step is given before the work gives up.
 *
 * Video is the generous one. A 1080p or 2K render waits in the provider's
 * queue for as long as it takes to render, and a job abandoned while it is
 * still queued has already been paid for, so the deadline is set past the
 * worst queue a person is willing to sit through rather than past the render.
 * The opening frame is a single image and needs nothing like it.
 */
const VIDEO_MAX_POLLS = Math.ceil((45 * 60) / POLL_SECONDS);
const COVER_MAX_POLLS = Math.ceil((10 * 60) / POLL_SECONDS);

const payloadSchema = z
  .object({
    workId: z.uuid(),
    userId: z.string().min(1),
    clipId: z.uuid().optional(),
    scriptId: z.uuid().optional(),
    version: z.number().int().positive().optional(),
    videoModel: z.enum(VIDEO_MODELS).optional(),
    resolution: z.enum(VIDEO_RESOLUTIONS).optional(),
    providerTaskId: z.string().optional(),
    polls: z.number().int().nonnegative().default(0),
  })
  .strict();

function storage(db: AppDatabase): ClipStorage {
  try {
    return createClipStorage(db);
  } catch (error) {
    if (error instanceof StorageUnavailableError) {
      throw new PermanentJobError("UGC_STORAGE_UNAVAILABLE", error.message);
    }
    throw error;
  }
}

/**
 * The opening frame for a one-take clip.
 *
 * A storyboard gives the video model a drawn anchor for every beat. One take
 * has none, and what it is handed instead are the product's own listing
 * photos — studio backdrops, unrelated props, text printed into the image —
 * which it reads as scene references and rebuilds. Drawing one controlled
 * frame first costs a single image against a far more expensive video, and it
 * is what the finished clip's cover is taken from either way.
 *
 * Returns null while the frame is still being drawn; the caller polls.
 */
async function ensureCoverFrame(input: {
  db: AppDatabase;
  context: JobHandlerContext;
  work: typeof ugcWorks.$inferSelect;
  product: typeof ugcProducts.$inferSelect;
  talent: typeof ugcTalents.$inferSelect | undefined;
  scene: typeof ugcScenes.$inferSelect | undefined;
  subject: RenderSubject;
  beats: ScriptBeat[];
  productionPrompt: string | null;
}): Promise<typeof ugcWorkFrames.$inferSelect | null> {
  const { db, context, work } = input;
  const [existing] = await db
    .select()
    .from(ugcWorkFrames)
    .where(
      and(eq(ugcWorkFrames.workId, work.id), eq(ugcWorkFrames.position, 0)),
    );

  const frame =
    existing ??
    (
      await db
        .insert(ugcWorkFrames)
        .values({
          workId: work.id,
          position: 0,
          prompt: buildCoverPrompt(
            input.subject,
            input.beats[0],
            input.productionPrompt,
            work.aspectRatio,
          ),
        })
        .returning()
    )[0];
  if (!frame) throw new Error("The opening frame could not be initialized.");
  if (frame.status === "ready" && frame.imageUrl) return frame;

  if (!frame.providerTaskId) {
    const references = await resolveReferenceUrls(
      db,
      work.userId,
      [
        ...productReferenceUrls(input.product, MAX_PRODUCT_IMAGES),
        input.talent?.sheetUrl,
        input.scene?.sheetUrl,
      ].filter((url): url is string => Boolean(url)),
    );
    const providerTaskId = await submitImage({
      prompt: frame.prompt,
      referenceUrls: references,
      aspectRatio: work.aspectRatio,
      requestId: createPrismRequestId(context.taskRunId, frame.id),
    });
    await db
      .update(ugcWorkFrames)
      .set({ providerTaskId, status: "generating", updatedAt: new Date() })
      .where(eq(ugcWorkFrames.id, frame.id));
    await context.recordProviderJob(providerTaskId);
    context.log("work_cover_submitted", {
      workId: work.id,
      ...mediaTaskLog("prism", providerTaskId),
    });
    return null;
  }

  const task = await getImageTask(frame.providerTaskId);
  if (task.status === "pending") {
    context.log("work_cover_pending", {
      workId: work.id,
      ...mediaTaskLog("prism", frame.providerTaskId, task),
    });
    return null;
  }
  if (task.status === "failed" || !task.outputUrl) {
    await db
      .update(ugcWorkFrames)
      .set({
        status: "failed",
        failureReason: task.errorMessage ?? "The opening frame failed.",
        updatedAt: new Date(),
      })
      .where(eq(ugcWorkFrames.id, frame.id));
    context.log("work_cover_failed", {
      workId: work.id,
      ...mediaTaskLog("prism", frame.providerTaskId, task),
    });
    throw new PermanentJobError(
      "UGC_COVER_FRAME_FAILED",
      task.errorMessage ?? "The provider could not draw the opening frame.",
    );
  }

  const imageUrl = await archiveRemoteAsset({
    storeFile: storage(db),
    userId: work.userId,
    reference: `VW-${work.id.slice(0, 8)}-cover`,
    kind: "cover",
    sourceUrl: task.outputUrl,
  });
  const [ready] = await db
    .update(ugcWorkFrames)
    .set({ imageUrl, status: "ready", updatedAt: new Date() })
    .where(eq(ugcWorkFrames.id, frame.id))
    .returning();
  await recordUsage(db, {
    userId: work.userId,
    kind: "render",
    credits: CREDIT_COST.analysis,
    note: `cover ${work.id.slice(0, 8)}`,
  });
  context.log("work_cover_finished", {
    workId: work.id,
    ...mediaTaskLog("prism", frame.providerTaskId, task),
    imageUrl,
  });
  return ready ?? null;
}

/**
 * Renders the selected workflow into the finished clip.
 *
 * The frames go to the video model as a reference set alongside the product
 * and talent shots — H3 reads them together rather than treating one as a
 * strict first frame, which is what holds the face and the object steady for
 * the full fifteen seconds. The result lands in `ugc_clips`, where the work
 * list can preview and download it directly.
 */
export const workVideoJob = defineJob(
  "ugc.work.video",
  payloadSchema,
  async (payload, context) => {
    const db = context.db;
    const [work] = await db
      .select()
      .from(ugcWorks)
      .where(
        and(
          eq(ugcWorks.id, payload.workId),
          eq(ugcWorks.userId, payload.userId),
        ),
      );
    const scriptId = payload.scriptId ?? work?.scriptId;
    if (!work || !scriptId || !work.productId) {
      throw new PermanentJobError(
        "UGC_WORK_INCOMPLETE",
        "The work is missing its script or product.",
      );
    }

    const [script] = await db
      .select()
      .from(ugcScripts)
      .where(eq(ugcScripts.id, scriptId));
    const [product] = await db
      .select()
      .from(ugcProducts)
      .where(eq(ugcProducts.id, work.productId));
    const [talent] = work.talentId
      ? await db
          .select()
          .from(ugcTalents)
          .where(eq(ugcTalents.id, work.talentId))
      : [];
    const [scene] = work.sceneId
      ? await db.select().from(ugcScenes).where(eq(ugcScenes.id, work.sceneId))
      : [];
    if (!script || !product) {
      throw new PermanentJobError(
        "UGC_WORK_INCOMPLETE",
        "The work is missing its script or product.",
      );
    }

    const frames = await db
      .select()
      .from(ugcWorkFrames)
      .where(
        and(
          eq(ugcWorkFrames.workId, work.id),
          eq(ugcWorkFrames.status, "ready"),
        ),
      )
      .orderBy(asc(ugcWorkFrames.position));
    if (work.videoMode === "storyboard" && frames.length === 0) {
      throw new PermanentJobError(
        "UGC_WORK_NO_FRAMES",
        "Draw and accept a storyboard before rendering.",
      );
    }

    const beats = script.beats as ScriptBeat[];
    const [latestVersion] = await db
      .select({ value: max(ugcClips.version) })
      .from(ugcClips)
      .where(eq(ugcClips.workId, work.id));
    const version = payload.version ?? (latestVersion?.value ?? 0) + 1;
    const videoModel = payload.videoModel ?? work.videoModel;
    const resolution = payload.resolution ?? work.resolution;
    await context.updateProgress({
      step: VIDEO_PROGRESS_STEP.preparing,
      version,
    });
    const subject = renderSubjectFor({ product, work, talent, scene });

    // One take has nothing drawn to anchor it, so its opening frame is drawn
    // here before any video is paid for.
    if (work.videoMode === "one_take" && frames.length === 0) {
      const cover = await ensureCoverFrame({
        db,
        context,
        work,
        product,
        talent,
        scene,
        subject,
        beats,
        productionPrompt: script.productionPrompt,
      });
      if (!cover) {
        if (payload.polls >= COVER_MAX_POLLS) {
          throw new PermanentJobError(
            "UGC_RENDER_TIMEOUT",
            "The provider did not finish the opening frame in time.",
          );
        }
        await context.scheduleContinuation(
          { ...payload, version, polls: payload.polls + 1 },
          POLL_SECONDS,
        );
        return { drawingCover: true, polls: payload.polls + 1 };
      }
      frames.push(cover);
    }

    if (!payload.providerTaskId) {
      const references = await resolveReferenceUrls(
        db,
        work.userId,
        [
          // The approved key frames come first: they are this clip. The
          // product follows, ahead of the performer sheet, because its colour
          // and label text are what a viewer checks against the listing --
          // but only as far as the nine references reach.
          ...frames.map((frame) => frame.imageUrl),
          ...productReferenceUrls(
            product,
            videoProductBudget(frames.length, Boolean(talent?.sheetUrl)),
          ),
          talent?.sheetUrl,
        ].filter((url): url is string => Boolean(url)),
      );
      const providerTaskId = await submitVideo({
        model: videoModel,
        prompt: buildVideoPrompt(
          subject,
          beats,
          script.productionPrompt,
          { videoMode: work.videoMode, aspectRatio: work.aspectRatio },
          videoPromptLimit(),
        ),
        referenceUrls: references,
        durationSeconds: CLIP_SPEC.durationSeconds,
        aspectRatio: work.aspectRatio,
        resolution,
        // Deterministic: the provider dedupes a resubmission of the same run.
        requestId: context.taskRunId,
      });
      await context.recordProviderJob(providerTaskId);
      await context.updateProgress({
        step: VIDEO_PROGRESS_STEP.rendering,
        version,
      });
      await context.scheduleContinuation(
        { ...payload, providerTaskId, version, polls: 0 },
        POLL_SECONDS,
      );
      context.log("work_video_submitted", {
        workId: work.id,
        ...mediaTaskLog(videoTaskProvider(providerTaskId), providerTaskId),
        videoModel,
        resolution,
        references: references.length,
      });
      return { providerTaskId, submitted: true };
    }

    const provider = videoTaskProvider(payload.providerTaskId);
    const task = await getVideoTask(payload.providerTaskId);
    const taskLog = mediaTaskLog(provider, payload.providerTaskId, task);
    if (task.status === "pending") {
      if (payload.polls >= VIDEO_MAX_POLLS) {
        throw new PermanentJobError(
          "UGC_RENDER_TIMEOUT",
          "The provider did not finish the video in time.",
        );
      }
      await context.updateProgress({
        step: VIDEO_PROGRESS_STEP.rendering,
        version,
      });
      await context.scheduleContinuation(
        { ...payload, version, polls: payload.polls + 1 },
        POLL_SECONDS,
      );
      context.log("work_video_pending", {
        workId: work.id,
        ...taskLog,
        polls: payload.polls + 1,
      });
      return { waiting: true, polls: payload.polls + 1 };
    }
    if (task.status === "failed" || !task.outputUrl) {
      context.log("work_video_failed", { workId: work.id, ...taskLog });
      throw new PermanentJobError(
        "UGC_RENDER_FAILED",
        task.errorMessage ?? "The provider could not produce the video.",
      );
    }

    // Logged before archiving: the provider's link is the only copy until R2
    // holds one, and archiving is the step most likely to lose it.
    context.log("work_video_rendered", { workId: work.id, ...taskLog });
    await context.updateProgress({
      step: VIDEO_PROGRESS_STEP.archiving,
      version,
    });

    const storeFile = storage(db);
    const reference = `VW-${work.id.slice(0, 8)}-V${version}`;
    const videoUrl = await archiveRemoteAsset({
      storeFile,
      userId: work.userId,
      reference,
      kind: "video",
      sourceUrl: task.outputUrl,
    });
    const subtitleUrl = await archiveSubtitleTrack({
      storeFile,
      userId: work.userId,
      reference,
      content: buildSubtitleTrack(beats),
    });

    const durationMs = CLIP_SPEC.durationSeconds * 1000;
    const quality = evaluateClipQuality({
      locale: work.locale,
      durationMs,
      script: { voiceover: script.voiceover, captions: script.captions },
      hasTalentReference: Boolean(talent?.sheetUrl),
    });

    const [clip] = await db
      .insert(ugcClips)
      .values({
        userId: work.userId,
        productId: product.id,
        scriptId: script.id,
        talentId: talent?.id ?? null,
        sceneId: scene?.id ?? null,
        workId: work.id,
        version,
        reference,
        locale: work.locale,
        market: work.market,
        template: work.template,
        videoModel,
        aspectRatio: work.aspectRatio,
        resolution,
        status: quality.passed ? "ready" : "failed",
        failureReason: quality.passed
          ? null
          : quality.checks
              .filter((check) => !check.passed)
              .map((check) => check.detail)
              .join(" "),
        videoUrl,
        coverUrl: frames[0]?.imageUrl ?? product.images[0] ?? null,
        subtitleUrl,
        publishCaption: script.publishCaption,
        durationMs,
        quality,
      })
      .returning();

    await recordUsage(db, {
      userId: work.userId,
      kind: "render",
      credits: CREDIT_COST.render,
      clipId: clip.id,
      note: reference,
    });

    await db
      .update(ugcWorks)
      .set({
        clipId: clip.id,
        scriptId: script.id,
        videoModel,
        resolution,
        step: "done",
        // A clip that trips a check is still a clip: the findings belong on
        // the finished step, not in a failure state with nothing to look at.
        stepStatus: "review",
        updatedAt: new Date(),
      })
      .where(eq(ugcWorks.id, work.id));

    context.log("work_video_finished", {
      workId: work.id,
      clipId: clip.id,
      version,
      passed: quality.passed,
      ...taskLog,
      videoUrl,
    });
    return { clipId: clip.id, version, passed: quality.passed };
  },
  {
    queue: {
      retryLimit: 2,
      retryDelay: 20,
      retryBackoff: true,
      expireInSeconds: 60 * 60,
    },
    localConcurrency: 2,
    groupConcurrency: 1,
  },
);
