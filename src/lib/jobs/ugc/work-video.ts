import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import type { AppDatabase } from "@/database/client";
import {
  ugcClips,
  ugcProducts,
  ugcScripts,
  ugcTalents,
  ugcWorkFrames,
  ugcWorks,
} from "@/database/ugc";
import { CLIP_SPEC, CREDIT_COST } from "@/lib/ugc/constants";
import { getTask, submitVideo } from "@/lib/ugc/media/prism";
import { evaluateClipQuality } from "@/lib/ugc/qc";
import {
  archiveRemoteAsset,
  archiveSubtitleTrack,
  buildSubtitleTrack,
  buildVideoPrompt,
} from "@/lib/ugc/render";
import {
  createClipStorage,
  resolveReferenceUrls,
  StorageUnavailableError,
  type ClipStorage,
} from "@/lib/ugc/storage";
import { recordUsage } from "@/lib/ugc/usage";
import type { ScriptBeat } from "@/lib/ugc/types";
import { defineJob, PermanentJobError } from "../definition";

const POLL_SECONDS = 15;
const MAX_POLLS = 80;

const payloadSchema = z
  .object({
    workId: z.uuid(),
    userId: z.string().min(1),
    clipId: z.uuid().optional(),
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
    if (!work?.scriptId || !work.productId) {
      throw new PermanentJobError(
        "UGC_WORK_INCOMPLETE",
        "The work is missing its script or product.",
      );
    }

    const [script] = await db
      .select()
      .from(ugcScripts)
      .where(eq(ugcScripts.id, work.scriptId));
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
    const subject = {
      productName: product.name,
      appearance: product.facts?.appearance ?? "",
      market: work.market,
      locale: work.locale,
      template: work.template,
      talentPrompt: talent
        ? (talent.prompt ?? talent.description ?? talent.name)
        : null,
    };

    if (!payload.providerTaskId) {
      const references = await resolveReferenceUrls(
        db,
        work.userId,
        [
          ...frames.map((frame) => frame.imageUrl),
          talent?.imageUrl,
          ...product.images.slice(0, work.videoMode === "one_take" ? 8 : 2),
        ].filter((url): url is string => Boolean(url)),
      );
      const providerTaskId = await submitVideo({
        prompt: buildVideoPrompt(
          subject,
          beats,
          script.productionPrompt,
          work.videoMode,
        ),
        referenceUrls: references,
        durationSeconds: CLIP_SPEC.durationSeconds,
        aspectRatio: CLIP_SPEC.aspectRatio,
        requestId: context.taskRunId,
      });
      await context.updateProgress({ step: "video" });
      await context.scheduleContinuation(
        { ...payload, providerTaskId, polls: 0 },
        POLL_SECONDS,
      );
      context.log("work_video_submitted", {
        workId: work.id,
        providerTaskId,
        references: references.length,
      });
      return { providerTaskId, submitted: true };
    }

    const task = await getTask(payload.providerTaskId);
    if (task.status === "pending") {
      if (payload.polls >= MAX_POLLS) {
        throw new PermanentJobError(
          "UGC_RENDER_TIMEOUT",
          "The provider did not finish the video in time.",
        );
      }
      await context.scheduleContinuation(
        { ...payload, polls: payload.polls + 1 },
        POLL_SECONDS,
      );
      return { waiting: true, polls: payload.polls + 1 };
    }
    if (task.status === "failed" || !task.outputUrl) {
      throw new PermanentJobError(
        "UGC_RENDER_FAILED",
        task.errorMessage ?? "The provider could not produce the video.",
      );
    }

    const storeFile = storage(db);
    const reference = `VW-${work.id.slice(0, 8)}`;
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
      hasTalentReference: Boolean(talent?.imageUrl),
    });

    const [clip] = await db
      .insert(ugcClips)
      .values({
        userId: work.userId,
        productId: product.id,
        scriptId: script.id,
        talentId: talent?.id ?? null,
        reference,
        locale: work.locale,
        market: work.market,
        template: work.template,
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
      passed: quality.passed,
    });
    return { clipId: clip.id, passed: quality.passed };
  },
  {
    queue: {
      retryLimit: 2,
      retryDelay: 20,
      retryBackoff: true,
      expireInSeconds: 30 * 60,
    },
    localConcurrency: 2,
    groupConcurrency: 1,
  },
);
