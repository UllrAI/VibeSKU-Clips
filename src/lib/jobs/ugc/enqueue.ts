import { eq } from "drizzle-orm";
import type { AppDatabase } from "@/database/client";
import { ugcClips } from "@/database/ugc";
import { renderScopeKey } from "@/lib/ugc/scope";
import type { JobQueue } from "@/lib/jobs/queue";
import { createBackgroundTask } from "@/lib/tasks/service";
import { clipRenderJob } from "./clip-render";

/**
 * Creates the render task for one clip and links it back to the clip row.
 * `queue` is passed from the Web process for immediate delivery and omitted
 * inside the worker, where the dispatch loop picks the outbox row up.
 */
export async function enqueueClipRender(
  db: AppDatabase,
  input: {
    userId: string;
    batchId: string;
    clipId: string;
    laneIndex: number;
    queue?: JobQueue;
    attempt?: number;
  },
): Promise<string> {
  const attempt = input.attempt ?? 1;
  const { taskRun } = await createBackgroundTask({
    db,
    queue: input.queue,
    definition: clipRenderJob,
    scopeKey: renderScopeKey(input.userId, input.batchId, input.laneIndex),
    payload: {
      clipId: input.clipId,
      userId: input.userId,
      stage: "cover",
      polls: 0,
    },
    idempotencyKey: `clip:${input.clipId}:${attempt}`,
  });

  await db
    .update(ugcClips)
    .set({ taskRunId: taskRun.id, status: "rendering", updatedAt: new Date() })
    .where(eq(ugcClips.id, input.clipId));

  return taskRun.id;
}
