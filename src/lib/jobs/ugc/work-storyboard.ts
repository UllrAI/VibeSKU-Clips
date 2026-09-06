import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { AppDatabase } from "@/database/client";
import {
  ugcProducts,
  ugcScripts,
  ugcTalents,
  ugcWorkFrames,
  ugcWorks,
} from "@/database/ugc";
import { CLIP_SPEC, CREDIT_COST } from "@/lib/ugc/constants";
import { getTask, submitImage } from "@/lib/ugc/media/prism";
import { archiveRemoteAsset, buildFramePrompt } from "@/lib/ugc/render";
import {
  createClipStorage,
  StorageUnavailableError,
  type ClipStorage,
} from "@/lib/ugc/storage";
import { recordUsage } from "@/lib/ugc/usage";
import type { ScriptBeat } from "@/lib/ugc/types";
import { defineJob, PermanentJobError } from "../definition";

const POLL_SECONDS = 8;
const MAX_POLLS = 45;

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
 * Frames are submitted together and polled together: a storyboard is three to
 * six images and the person is waiting on all of them, so serialising would
 * multiply the wait for no benefit. Regenerating one frame reuses this same
 * job with that frame's id.
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

    const subject = {
      productName: product.name,
      appearance: product.facts?.appearance ?? "",
      market: work.market,
      locale: work.locale,
      template: work.template,
      talentPrompt: talent ? (talent.prompt ?? talent.name) : null,
    };

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
              prompt: buildFramePrompt(subject, beat, position),
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

    const frames = await db
      .select()
      .from(ugcWorkFrames)
      .where(
        and(
          eq(ugcWorkFrames.workId, work.id),
          inArray(ugcWorkFrames.id, frameIds),
        ),
      );

    const references = [talent?.imageUrl, ...product.images.slice(0, 2)].filter(
      (url): url is string => Boolean(url),
    );

    // Submit anything that has not been handed to the provider yet.
    for (const frame of frames) {
      if (frame.providerTaskId) continue;
      const providerTaskId = await submitImage({
        prompt: frame.prompt,
        referenceUrls: references,
        aspectRatio: CLIP_SPEC.aspectRatio,
        requestId: `${context.taskRunId}:${frame.id}`,
      });
      await db
        .update(ugcWorkFrames)
        .set({
          providerTaskId,
          status: "generating",
          failureReason: null,
          updatedAt: new Date(),
        })
        .where(eq(ugcWorkFrames.id, frame.id));
      context.log("storyboard_frame_submitted", {
        workId: work.id,
        frameId: frame.id,
        position: frame.position,
        providerTaskId,
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

    let waiting = 0;
    for (const frame of inFlight) {
      if (!frame.providerTaskId) continue;
      const task = await getTask(frame.providerTaskId);

      if (task.status === "pending") {
        waiting += 1;
        continue;
      }
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
    }

    if (waiting > 0) {
      if (payload.polls >= MAX_POLLS) {
        throw new PermanentJobError(
          "UGC_STORYBOARD_TIMEOUT",
          "The provider did not finish the storyboard in time.",
        );
      }
      await context.scheduleContinuation(
        { ...payload, frameIds, polls: payload.polls + 1 },
        POLL_SECONDS,
      );
      return { waiting, polls: payload.polls + 1 };
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
