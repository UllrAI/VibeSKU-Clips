import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { AppDatabase } from "@/database/client";
import {
  ugcProducts,
  ugcScenes,
  ugcScripts,
  ugcTalents,
  ugcWorkFrames,
  ugcWorks,
} from "@/database/ugc";
import { CREDIT_COST, MAX_PRODUCT_IMAGES } from "@/lib/ugc/constants";
import {
  createPrismRequestId,
  getTask,
  submitImage,
} from "@/lib/ugc/media/prism";
import { mediaTaskLog } from "@/lib/ugc/media/task-log";
import {
  archiveRemoteAsset,
  buildFramePrompt,
  CONTINUES_FROM_PREVIOUS,
  productReferenceUrls,
  renderSubjectFor,
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

const POLL_SECONDS = 8;

/**
 * Frames are drawn one after another, so this budget guards a stalled frame
 * rather than the length of the storyboard: it resets every time one lands.
 */
const MAX_STALLED_POLLS = Math.ceil((10 * 60) / POLL_SECONDS);

const payloadSchema = z
  .object({
    workId: z.uuid(),
    userId: z.string().min(1),
    /** Empty on the first pass; set when regenerating single frames. */
    frameIds: z.array(z.uuid()).default([]),
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
 * Draws every key frame of a storyboard, then stops for the operator.
 *
 * Frames are drawn in order, one at a time, and each one is shown the frame
 * before it. Drawn all at once they were each right and collectively wrong:
 * the room rearranged itself between shots, the garment changed weave, the
 * light moved. Continuity of that kind comes from a photograph, not from a
 * longer prompt, and the only photograph that can supply it is the previous
 * frame — which means waiting for it. A storyboard of three to six images
 * therefore costs a few minutes rather than one image's wait.
 *
 * Regenerating one frame reuses this same job with that frame's id; it still
 * sees the finished frame before it.
 */
export const workStoryboardJob = defineJob(
  "ugc.work.storyboard",
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
    if (!work?.scriptId) {
      throw new PermanentJobError(
        "UGC_WORK_NO_SCRIPT",
        "Accept a script before drawing the storyboard.",
      );
    }

    const [script] = await db
      .select()
      .from(ugcScripts)
      .where(eq(ugcScripts.id, work.scriptId));
    const [product] = work.productId
      ? await db
          .select()
          .from(ugcProducts)
          .where(eq(ugcProducts.id, work.productId))
      : [];
    if (!script || !product) {
      throw new PermanentJobError(
        "UGC_WORK_INCOMPLETE",
        "The work is missing its script or product.",
      );
    }
    const [talent] = work.talentId
      ? await db
          .select()
          .from(ugcTalents)
          .where(eq(ugcTalents.id, work.talentId))
      : [];
    const [scene] = work.sceneId
      ? await db.select().from(ugcScenes).where(eq(ugcScenes.id, work.sceneId))
      : [];

    const subject = renderSubjectFor({ product, work, talent, scene });

    // First pass: create the frame rows from the accepted beats.
    let frameIds = payload.frameIds;
    if (frameIds.length === 0) {
      const existing = await db
        .select({ id: ugcWorkFrames.id })
        .from(ugcWorkFrames)
        .where(eq(ugcWorkFrames.workId, work.id));
      if (existing.length === 0) {
        const beats = script.beats as ScriptBeat[];
        const created = await db
          .insert(ugcWorkFrames)
          .values(
            beats.map((beat, position) => ({
              workId: work.id,
              position,
              prompt: buildFramePrompt(
                subject,
                beat,
                position,
                script.productionPrompt,
                work.aspectRatio,
              ),
            })),
          )
          .returning({ id: ugcWorkFrames.id });
        frameIds = created.map((row) => row.id);
        context.log("storyboard_frames_created", {
          workId: work.id,
          frames: frameIds.length,
        });
      } else {
        frameIds = existing.map((row) => row.id);
      }
    }

    // Every frame of the work, in order, not only the ones being drawn: a
    // single-frame redraw still needs the finished frame before it.
    const allFrames = await db
      .select()
      .from(ugcWorkFrames)
      .where(eq(ugcWorkFrames.workId, work.id))
      .orderBy(asc(ugcWorkFrames.position));
    const targets = allFrames.filter((frame) => frameIds.includes(frame.id));

    // One submission per pass, lowest position first. A frame that failed is
    // left alone for the operator to retry, and does not hold up the rest.
    const next = targets.find((frame) => frame.status === "pending");
    const previous = next
      ? allFrames.find((frame) => frame.position === next.position - 1)
      : undefined;

    if (next && previous?.status !== "generating") {
      const previousImageUrl =
        previous?.status === "ready" ? previous.imageUrl : null;
      const references = await resolveReferenceUrls(
        db,
        work.userId,
        [
          // The frame before leads: it is already this performer, in this
          // room, under this light, so it settles more continuity than any
          // sheet can. The product follows, because its colour, finish and
          // label text are what must survive most intact.
          previousImageUrl,
          ...productReferenceUrls(product, MAX_PRODUCT_IMAGES),
          talent?.sheetUrl,
          scene?.sheetUrl,
        ].filter((url): url is string => Boolean(url)),
      );
      const providerTaskId = await submitImage({
        prompt: previousImageUrl
          ? `${next.prompt}\n${CONTINUES_FROM_PREVIOUS}`
          : next.prompt,
        referenceUrls: references,
        aspectRatio: work.aspectRatio,
        requestId: createPrismRequestId(context.taskRunId, next.id),
      });
      await db
        .update(ugcWorkFrames)
        .set({
          providerTaskId,
          status: "generating",
          failureReason: null,
          updatedAt: new Date(),
        })
        .where(eq(ugcWorkFrames.id, next.id));
      context.log("storyboard_frame_submitted", {
        workId: work.id,
        frameId: next.id,
        position: next.position,
        ...mediaTaskLog("prism", providerTaskId),
        continuesFrom: previousImageUrl ? previous?.position : null,
      });
    }

    // Then collect whatever the provider has finished since the last poll.
    const inFlight = await db
      .select()
      .from(ugcWorkFrames)
      .where(
        and(
          eq(ugcWorkFrames.workId, work.id),
          inArray(ugcWorkFrames.id, frameIds),
          eq(ugcWorkFrames.status, "generating"),
        ),
      );

    let progressed = false;
    for (const frame of inFlight) {
      if (!frame.providerTaskId) continue;
      const task = await getTask(frame.providerTaskId);
      const taskLog = mediaTaskLog("prism", frame.providerTaskId, task);

      if (task.status === "pending") continue;
      progressed = true;
      if (task.status === "failed" || !task.outputUrl) {
        await db
          .update(ugcWorkFrames)
          .set({
            status: "failed",
            failureReason:
              task.errorMessage ?? "The provider could not draw this frame.",
            providerTaskId: null,
            updatedAt: new Date(),
          })
          .where(eq(ugcWorkFrames.id, frame.id));
        context.log("storyboard_frame_failed", {
          workId: work.id,
          frameId: frame.id,
          position: frame.position,
          ...taskLog,
        });
        continue;
      }

      const archived = await archiveRemoteAsset({
        storeFile: storage(db),
        userId: work.userId,
        reference: `${work.id}-f${frame.position}`,
        kind: "cover",
        sourceUrl: task.outputUrl,
      });
      await db
        .update(ugcWorkFrames)
        .set({
          status: "ready",
          imageUrl: archived,
          failureReason: null,
          updatedAt: new Date(),
        })
        .where(eq(ugcWorkFrames.id, frame.id));
      await recordUsage(db, {
        userId: work.userId,
        kind: "render",
        credits: CREDIT_COST.analysis,
        note: `frame ${frame.position + 1}`,
      });
      context.log("storyboard_frame_finished", {
        workId: work.id,
        frameId: frame.id,
        position: frame.position,
        ...taskLog,
        imageUrl: archived,
      });
    }

    // A pass that finished a frame leaves the next one still to submit, so
    // what decides whether to come back is the work left, not the poll result.
    const outstanding = await db
      .select({ id: ugcWorkFrames.id })
      .from(ugcWorkFrames)
      .where(
        and(
          eq(ugcWorkFrames.workId, work.id),
          inArray(ugcWorkFrames.id, frameIds),
          inArray(ugcWorkFrames.status, ["pending", "generating"]),
        ),
      );

    if (outstanding.length > 0) {
      if (!progressed && payload.polls >= MAX_STALLED_POLLS) {
        throw new PermanentJobError(
          "UGC_STORYBOARD_TIMEOUT",
          "The provider did not finish the storyboard in time.",
        );
      }
      const polls = progressed ? 0 : payload.polls + 1;
      await context.scheduleContinuation(
        { ...payload, frameIds, polls },
        POLL_SECONDS,
      );
      return { outstanding: outstanding.length, polls };
    }

    await db
      .update(ugcWorks)
      .set({
        step: "storyboard",
        stepStatus: "review",
        updatedAt: new Date(),
      })
      .where(eq(ugcWorks.id, work.id));

    context.log("storyboard_finished", {
      workId: work.id,
      frames: frameIds.length,
    });
    return { frames: frameIds.length };
  },
  {
    queue: {
      retryLimit: 2,
      retryDelay: 15,
      retryBackoff: true,
      expireInSeconds: 15 * 60,
    },
    localConcurrency: 2,
    groupConcurrency: 1,
  },
);
