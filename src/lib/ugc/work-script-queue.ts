import { and, eq, isNull } from "drizzle-orm";
import type { AppDatabase } from "@/database/client";
import { ugcWorks } from "@/database/ugc";
import type { JobQueue } from "@/lib/jobs/queue";
import { workScriptJob } from "@/lib/jobs/ugc/work-script";
import { createBackgroundTask } from "@/lib/tasks/service";
import { workScopeKey } from "./scope";

export async function enqueueWorkScript(input: {
  db: AppDatabase;
  queue?: JobQueue;
  workId: string;
  userId: string;
  idempotencyKey: string;
}): Promise<void> {
  const { taskRun } = await createBackgroundTask({
    db: input.db,
    queue: input.queue,
    definition: workScriptJob,
    scopeKey: workScopeKey(input.userId, input.workId),
    payload: { workId: input.workId, userId: input.userId },
    idempotencyKey: input.idempotencyKey,
  });

  await input.db
    .update(ugcWorks)
    .set({
      step: "script",
      stepStatus: "running",
      scriptId: null,
      taskRunId: taskRun.id,
      autoStartScript: false,
      updatedAt: new Date(),
    })
    .where(
      and(eq(ugcWorks.id, input.workId), eq(ugcWorks.userId, input.userId)),
    );
}

/** Continue only works whose create action explicitly asked for a script. */
export async function startWorksWaitingForProduct(
  db: AppDatabase,
  productId: string,
  userId: string,
): Promise<void> {
  const waiting = await db
    .select({ id: ugcWorks.id })
    .from(ugcWorks)
    .where(
      and(
        eq(ugcWorks.productId, productId),
        eq(ugcWorks.userId, userId),
        eq(ugcWorks.step, "product"),
        eq(ugcWorks.autoStartScript, true),
        isNull(ugcWorks.scriptId),
        isNull(ugcWorks.clipId),
      ),
    );

  for (const work of waiting) {
    await enqueueWorkScript({
      db,
      workId: work.id,
      userId,
      idempotencyKey: `${work.id}:script:product-ready`,
    });
  }
}
