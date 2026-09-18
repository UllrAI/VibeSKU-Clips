"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/database";
import {
  ugcProducts,
  ugcTalents,
  ugcWorkFrames,
  ugcWorks,
} from "@/database/ugc";
import { taskRuns } from "@/database/schema";
import { exampleProcessJob } from "@/lib/jobs/example";
import { productIngestJob } from "@/lib/jobs/ugc/product-ingest";
import { talentGenerateJob } from "@/lib/jobs/ugc/talent-generate";
import { workScriptJob } from "@/lib/jobs/ugc/work-script";
import { workStoryboardJob } from "@/lib/jobs/ugc/work-storyboard";
import { workVideoJob } from "@/lib/jobs/ugc/work-video";
import { serverJobQueue } from "@/lib/jobs/server";
import { jobDefinitions } from "@/lib/jobs/catalog";
import {
  cancelOwnedBackgroundTask,
  createBackgroundTask,
} from "@/lib/tasks/service";

import { adminAction } from "./shared";

const taskRunSchema = z.object({ taskRunId: z.uuid() });

function revalidateOperations(workId?: string) {
  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard/admin/works");
  revalidatePath("/dashboard/admin/tasks");
  if (workId) revalidatePath(`/dashboard/admin/works/${workId}`);
}

async function findTask(taskRunId: string) {
  const [task] = await db
    .select()
    .from(taskRuns)
    .where(eq(taskRuns.id, taskRunId))
    .limit(1);
  return task ?? null;
}

async function scopeHasActiveTask(scopeKey: string): Promise<boolean> {
  const [active] = await db
    .select({ id: taskRuns.id })
    .from(taskRuns)
    .where(
      and(
        eq(taskRuns.scopeKey, scopeKey),
        inArray(taskRuns.status, ["queued", "running", "waiting"]),
      ),
    )
    .limit(1);
  return Boolean(active);
}

export const cancelAdminTaskAction = adminAction
  .schema(taskRunSchema)
  .action(async ({ parsedInput, ctx }) => {
    const task = await findTask(parsedInput.taskRunId);
    if (!task) throw new Error("Task not found");

    const cancelled = await cancelOwnedBackgroundTask({
      db,
      queue: serverJobQueue,
      taskRunId: task.id,
      scopeKey: task.scopeKey,
    });
    if (!cancelled || cancelled.status !== "cancelled") {
      return { success: false, code: "task_not_active" };
    }

    const [work] = await db
      .update(ugcWorks)
      .set({ stepStatus: "failed", updatedAt: new Date() })
      .where(eq(ugcWorks.taskRunId, task.id))
      .returning({ id: ugcWorks.id });

    if (task.kind === productIngestJob.name) {
      const payload = productIngestJob.schema.parse(task.input);
      await db
        .update(ugcProducts)
        .set({
          status: "failed",
          issue: null,
          updatedAt: new Date(),
        })
        .where(eq(ugcProducts.id, payload.productId));
    } else if (task.kind === talentGenerateJob.name) {
      const payload = talentGenerateJob.schema.parse(task.input);
      await db
        .update(ugcTalents)
        .set({ status: "failed", updatedAt: new Date() })
        .where(eq(ugcTalents.id, payload.talentId));
    } else if (task.kind === workStoryboardJob.name) {
      const payload = workStoryboardJob.schema.parse(task.input);
      await db
        .update(ugcWorkFrames)
        .set({
          status: "failed",
          failureReason: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(ugcWorkFrames.workId, payload.workId),
            eq(ugcWorkFrames.status, "generating"),
          ),
        );
    }

    console.info(
      JSON.stringify({
        component: "admin-audit",
        action: "task_cancelled",
        actorId: ctx.user.id,
        taskRunId: task.id,
        kind: task.kind,
      }),
    );
    revalidateOperations(work?.id);
    return { success: true, taskRunId: task.id };
  });

export const retryAdminTaskAction = adminAction
  .schema(taskRunSchema)
  .action(async ({ parsedInput, ctx }) => {
    const task = await findTask(parsedInput.taskRunId);
    if (!task) throw new Error("Task not found");
    if (task.status !== "failed" && task.status !== "cancelled") {
      return { success: false, code: "task_not_retryable" };
    }
    if (await scopeHasActiveTask(task.scopeKey)) {
      return { success: false, code: "task_scope_busy" };
    }

    const idempotencyKey = `admin-retry:${task.id}:${Date.now()}`;
    let newTaskRunId: string;
    let workId: string | undefined;

    switch (task.kind) {
      case productIngestJob.name: {
        const payload = productIngestJob.schema.parse(task.input);
        const { taskRun } = await createBackgroundTask({
          db,
          definition: productIngestJob,
          scopeKey: task.scopeKey,
          payload,
          idempotencyKey,
        });
        newTaskRunId = taskRun.id;
        await db
          .update(ugcProducts)
          .set({ status: "analyzing", issue: null, updatedAt: new Date() })
          .where(eq(ugcProducts.id, payload.productId));
        break;
      }
      case talentGenerateJob.name: {
        const payload = talentGenerateJob.schema.parse(task.input);
        const { taskRun } = await createBackgroundTask({
          db,
          definition: talentGenerateJob,
          scopeKey: task.scopeKey,
          payload: { ...payload, providerTaskId: undefined, polls: 0 },
          idempotencyKey,
        });
        newTaskRunId = taskRun.id;
        await db
          .update(ugcTalents)
          .set({ status: "generating", updatedAt: new Date() })
          .where(eq(ugcTalents.id, payload.talentId));
        break;
      }
      case workScriptJob.name: {
        const payload = workScriptJob.schema.parse(task.input);
        const { taskRun } = await createBackgroundTask({
          db,
          definition: workScriptJob,
          scopeKey: task.scopeKey,
          payload,
          idempotencyKey,
        });
        workId = payload.workId;
        newTaskRunId = taskRun.id;
        await db
          .update(ugcWorks)
          .set({
            step: "script",
            stepStatus: "running",
            taskRunId: newTaskRunId,
            updatedAt: new Date(),
          })
          .where(eq(ugcWorks.id, workId));
        break;
      }
      case workStoryboardJob.name: {
        const payload = workStoryboardJob.schema.parse(task.input);
        const frameCondition = payload.frameIds.length
          ? and(
              eq(ugcWorkFrames.workId, payload.workId),
              inArray(ugcWorkFrames.id, payload.frameIds),
            )
          : eq(ugcWorkFrames.workId, payload.workId);
        const { taskRun } = await createBackgroundTask({
          db,
          definition: workStoryboardJob,
          scopeKey: task.scopeKey,
          payload: { ...payload, polls: 0 },
          idempotencyKey,
        });
        workId = payload.workId;
        newTaskRunId = taskRun.id;
        await db
          .update(ugcWorkFrames)
          .set({
            status: "pending",
            providerTaskId: null,
            failureReason: null,
            updatedAt: new Date(),
          })
          .where(frameCondition);
        await db
          .update(ugcWorks)
          .set({
            step: "storyboard",
            stepStatus: "running",
            taskRunId: newTaskRunId,
            updatedAt: new Date(),
          })
          .where(eq(ugcWorks.id, workId));
        break;
      }
      case workVideoJob.name: {
        const payload = workVideoJob.schema.parse(task.input);
        const { taskRun } = await createBackgroundTask({
          db,
          definition: workVideoJob,
          scopeKey: task.scopeKey,
          payload: {
            ...payload,
            clipId: undefined,
            providerTaskId: undefined,
            polls: 0,
          },
          idempotencyKey,
        });
        workId = payload.workId;
        newTaskRunId = taskRun.id;
        await db
          .update(ugcWorks)
          .set({
            step: "video",
            stepStatus: "running",
            taskRunId: newTaskRunId,
            updatedAt: new Date(),
          })
          .where(eq(ugcWorks.id, workId));
        break;
      }
      case exampleProcessJob.name: {
        const payload = exampleProcessJob.schema.parse(task.input);
        const { taskRun } = await createBackgroundTask({
          db,
          definition: exampleProcessJob,
          scopeKey: task.scopeKey,
          payload,
          idempotencyKey,
        });
        newTaskRunId = taskRun.id;
        break;
      }
      default:
        return { success: false, code: "task_kind_unknown" };
    }

    const definition = jobDefinitions.find(
      (candidate) => candidate.name === task.kind,
    );
    if (definition) {
      await serverJobQueue.dispatchPending(db, definition).catch((error) => {
        console.error(
          "Admin retry accepted; queue delivery will retry:",
          error,
        );
      });
    }

    console.info(
      JSON.stringify({
        component: "admin-audit",
        action: "task_retried",
        actorId: ctx.user.id,
        previousTaskRunId: task.id,
        taskRunId: newTaskRunId,
        kind: task.kind,
      }),
    );
    revalidateOperations(workId);
    return { success: true, taskRunId: newTaskRunId };
  });
