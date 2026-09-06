import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/database";
import { taskRuns } from "@/database/schema";

/** How long a queued task may sit before the console calls the run stalled. */
export const STALL_AFTER_MS = 45_000;

export interface RunState {
  /** The background step gave up. Without this a console spins forever. */
  failed: boolean;
  /** Our own error code, resolved to copy at the boundary. */
  failureCode: string | null;
  /** Queued long past the point a worker should have taken it. */
  stalled: boolean;
}

const IDLE_RUN: RunState = {
  failed: false,
  failureCode: null,
  stalled: false,
};

function toRunState(run: {
  status: string;
  error: { code: string } | null;
  createdAt: Date;
}): RunState {
  return {
    failed: run.status === "failed" || run.status === "cancelled",
    failureCode: run.error?.code ?? null,
    stalled:
      run.status === "queued" &&
      run.createdAt.getTime() < Date.now() - STALL_AFTER_MS,
  };
}

/**
 * What became of a step's background task. The domain row records what the
 * operator asked for; the task run is the only place that knows whether
 * anything actually happened, so a step that died is read from here rather
 * than left spinning.
 */
export async function runStateFor(taskRunId: string | null): Promise<RunState> {
  if (!taskRunId) return IDLE_RUN;
  const [run] = await db
    .select({
      status: taskRuns.status,
      error: taskRuns.error,
      createdAt: taskRuns.createdAt,
    })
    .from(taskRuns)
    .where(eq(taskRuns.id, taskRunId));
  return run ? toRunState(run) : IDLE_RUN;
}

/**
 * The same answer for work that does not keep a task id of its own, such as
 * reading a product: the newest run in that scope is the one being watched.
 */
export async function latestRunStateForScope(
  scopeKey: string,
  kind: string,
): Promise<RunState> {
  const [run] = await db
    .select({
      status: taskRuns.status,
      error: taskRuns.error,
      createdAt: taskRuns.createdAt,
    })
    .from(taskRuns)
    .where(and(eq(taskRuns.scopeKey, scopeKey), eq(taskRuns.kind, kind)))
    .orderBy(desc(taskRuns.createdAt))
    .limit(1);
  return run ? toRunState(run) : IDLE_RUN;
}
