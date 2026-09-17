import { and, asc, eq, max } from "drizzle-orm";
import { z } from "zod";
import {
  ugcClips,
  ugcCompositions,
  ugcScripts,
  ugcWorkSegments,
  ugcWorkTakes,
  ugcWorks,
} from "@/database/ugc";
import { taskRuns } from "@/database/schema";
import {
  VIDEO_MODELS,
  VIDEO_RESOLUTIONS,
  beatsCoverDuration,
  shotDurationSeconds,
} from "@/lib/ugc/constants";
import { workScopeKey } from "@/lib/ugc/scope";
import { VIDEO_PROGRESS_STEP } from "@/lib/ugc/video-progress";
import { createBackgroundTask } from "@/lib/tasks/service";
import { defineJob, PermanentJobError } from "../definition";
import { workComposeJob } from "./work-compose";
import { workSegmentJob } from "./work-segment";

const POLL_SECONDS = 15;
const MAX_POLLS = 480;

const payloadSchema = z
  .object({
    workId: z.uuid(),
    userId: z.string().min(1),
    scriptId: z.uuid().optional(),
    clipId: z.uuid().optional(),
    providerTaskId: z.string().optional(),
    version: z.number().int().positive().optional(),
    videoModel: z.enum(VIDEO_MODELS).optional(),
    resolution: z.enum(VIDEO_RESOLUTIONS).optional(),
    polls: z.number().int().nonnegative().default(0),
  })
  .strict();

/** Coordinates independent shot tasks and an immutable FFmpeg composition. */
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
    if (!work || !scriptId || !work.productId)
      throw new PermanentJobError(
        "UGC_WORK_INCOMPLETE",
        "The work is missing its script or product.",
      );
    const [script] = await db
      .select()
      .from(ugcScripts)
      .where(
        and(eq(ugcScripts.id, scriptId), eq(ugcScripts.userId, work.userId)),
      );
    if (!script || !beatsCoverDuration(script.beats, work.durationSeconds))
      throw new PermanentJobError(
        "UGC_SCRIPT_TIMING_INVALID",
        "Script beats do not cover the work duration with supported shot lengths.",
      );
    if (payload.polls >= MAX_POLLS)
      throw new PermanentJobError(
        "UGC_RENDER_TIMEOUT",
        "The shot or composition tasks did not finish in time.",
      );

    const [latestClip] = await db
      .select({ value: max(ugcClips.version) })
      .from(ugcClips)
      .where(eq(ugcClips.workId, work.id));
    const [latestComposition] = await db
      .select({ value: max(ugcCompositions.version) })
      .from(ugcCompositions)
      .where(eq(ugcCompositions.workId, work.id));
    const version =
      payload.version ??
      Math.max(latestClip?.value ?? 0, latestComposition?.value ?? 0) + 1;

    for (const [position, beat] of script.beats.entries()) {
      const [found] = await db
        .select()
        .from(ugcWorkSegments)
        .where(
          and(
            eq(ugcWorkSegments.workId, work.id),
            eq(ugcWorkSegments.scriptId, script.id),
            eq(ugcWorkSegments.position, position),
          ),
        );
      const segment =
        found ??
        (
          await db
            .insert(ugcWorkSegments)
            .values({
              workId: work.id,
              scriptId: script.id,
              position,
              startMs: Math.round(beat.start) * 1000,
              endMs:
                (Math.round(beat.start) + shotDurationSeconds(beat)) * 1000,
            })
            .onConflictDoNothing()
            .returning()
        )[0];
      if (!segment) continue;
      if (!segment.activeTakeId) {
        const [take] = await db
          .insert(ugcWorkTakes)
          .values({ segmentId: segment.id, version: 1 })
          .onConflictDoNothing()
          .returning();
        const [existing] = take
          ? [take]
          : await db
              .select()
              .from(ugcWorkTakes)
              .where(
                and(
                  eq(ugcWorkTakes.segmentId, segment.id),
                  eq(ugcWorkTakes.version, 1),
                ),
              );
        if (!existing) throw new Error("Shot take could not be initialized.");
        await db
          .update(ugcWorkSegments)
          .set({ activeTakeId: existing.id })
          .where(eq(ugcWorkSegments.id, segment.id));
      }
    }

    const segments = await db
      .select()
      .from(ugcWorkSegments)
      .where(
        and(
          eq(ugcWorkSegments.workId, work.id),
          eq(ugcWorkSegments.scriptId, script.id),
        ),
      )
      .orderBy(asc(ugcWorkSegments.position));
    if (
      segments.length !== script.beats.length ||
      segments.some((segment) => !segment.activeTakeId)
    ) {
      await context.scheduleContinuation(
        { ...payload, version, polls: payload.polls + 1 },
        POLL_SECONDS,
      );
      return { initializing: true };
    }
    const takes = await Promise.all(
      segments.map(async (segment) => {
        const [take] = await db
          .select()
          .from(ugcWorkTakes)
          .where(eq(ugcWorkTakes.id, segment.activeTakeId!));
        if (!take)
          throw new PermanentJobError(
            "SEGMENT_MISSING",
            "A selected shot take is missing.",
          );
        return take;
      }),
    );

    for (const take of takes) {
      if (take.status === "ready") continue;
      if (take.taskRunId) {
        const [run] = await db
          .select({ status: taskRuns.status, error: taskRuns.error })
          .from(taskRuns)
          .where(eq(taskRuns.id, take.taskRunId));
        if (run?.status === "failed" || run?.status === "cancelled") {
          await db
            .update(ugcWorkTakes)
            .set({
              status: "failed",
              failureReason: run.error?.message ?? "Shot task failed.",
              updatedAt: new Date(),
            })
            .where(eq(ugcWorkTakes.id, take.id));
          throw new PermanentJobError(
            "SEGMENT_FAILED",
            `Shot ${segments.findIndex((segment) => segment.id === take.segmentId) + 1} failed: ${run.error?.message ?? "unknown error"}`,
          );
        }
        if (run?.status === "completed") {
          throw new PermanentJobError(
            "SEGMENT_INCOMPLETE",
            "A shot task completed without an archived take.",
          );
        }
        continue;
      }
      const { taskRun } = await createBackgroundTask({
        db,
        definition: workSegmentJob,
        scopeKey: `${workScopeKey(work.userId, work.id)}:segment:${take.segmentId}`,
        payload: { takeId: take.id, userId: work.userId, polls: 0 },
        idempotencyKey: `${take.id}:generate`,
      });
      await db
        .update(ugcWorkTakes)
        .set({ taskRunId: taskRun.id, updatedAt: new Date() })
        .where(eq(ugcWorkTakes.id, take.id));
    }

    const ready = takes.filter((take) => take.status === "ready").length;
    await context.updateProgress({
      step: VIDEO_PROGRESS_STEP.rendering,
      version,
      ready,
      total: takes.length,
    });
    if (ready < takes.length) {
      await context.scheduleContinuation(
        { ...payload, version, polls: payload.polls + 1 },
        POLL_SECONDS,
      );
      return { ready, total: takes.length };
    }

    let [composition] = await db
      .select()
      .from(ugcCompositions)
      .where(
        and(
          eq(ugcCompositions.workId, work.id),
          eq(ugcCompositions.version, version),
        ),
      );
    if (!composition) {
      [composition] = await db
        .insert(ugcCompositions)
        .values({
          workId: work.id,
          scriptId: script.id,
          version,
          takeIds: takes.map((take) => take.id),
        })
        .onConflictDoNothing()
        .returning();
      if (!composition)
        [composition] = await db
          .select()
          .from(ugcCompositions)
          .where(
            and(
              eq(ugcCompositions.workId, work.id),
              eq(ugcCompositions.version, version),
            ),
          );
    }
    if (!composition) throw new Error("Composition could not be initialized.");
    if (composition.clipId) return { clipId: composition.clipId, version };
    if (composition.taskRunId) {
      const [run] = await db
        .select({ status: taskRuns.status, error: taskRuns.error })
        .from(taskRuns)
        .where(eq(taskRuns.id, composition.taskRunId));
      if (run?.status === "failed" || run?.status === "cancelled") {
        throw new PermanentJobError(
          "UGC_COMPOSITION_FAILED",
          run.error?.message ??
            composition.failureReason ??
            "Composition failed.",
        );
      }
      if (run?.status === "completed") {
        throw new PermanentJobError(
          "UGC_COMPOSITION_INCOMPLETE",
          "Composition completed without a finished clip.",
        );
      }
    } else {
      const { taskRun } = await createBackgroundTask({
        db,
        definition: workComposeJob,
        scopeKey: `${workScopeKey(work.userId, work.id)}:composition:${composition.id}`,
        payload: { compositionId: composition.id, userId: work.userId },
        idempotencyKey: `${composition.id}:compose`,
      });
      await db
        .update(ugcCompositions)
        .set({ taskRunId: taskRun.id, updatedAt: new Date() })
        .where(eq(ugcCompositions.id, composition.id));
    }
    await context.updateProgress({
      step: VIDEO_PROGRESS_STEP.archiving,
      version,
      ready,
      total: takes.length,
    });
    await context.scheduleContinuation(
      { ...payload, version, polls: payload.polls + 1 },
      POLL_SECONDS,
    );
    return { composing: true, version };
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
