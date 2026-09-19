import type { TaskRunStatus } from "@/lib/tasks/types";

export type AdminWorkState = "active" | "attention" | "completed" | "failed";

export function taskPayloadReferences(input: unknown): {
  userId: string | null;
  workId: string | null;
} {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { userId: null, workId: null };
  }
  const record = input as Record<string, unknown>;
  return {
    userId: typeof record.userId === "string" ? record.userId : null,
    workId: typeof record.workId === "string" ? record.workId : null,
  };
}

export function deriveAdminWorkState(input: {
  step: "product" | "script" | "storyboard" | "video" | "done";
  stepStatus: "idle" | "running" | "review" | "failed";
  taskStatus: TaskRunStatus | null;
}): AdminWorkState {
  if (
    input.stepStatus === "failed" ||
    input.taskStatus === "failed" ||
    input.taskStatus === "cancelled"
  ) {
    return "failed";
  }
  if (
    input.taskStatus === "queued" ||
    input.taskStatus === "running" ||
    input.taskStatus === "waiting"
  ) {
    return "active";
  }
  if (input.step === "done") return "completed";
  return "attention";
}

export function progressStep(
  progress: Record<string, unknown> | null,
): string | null {
  return typeof progress?.step === "string" ? progress.step : null;
}

/**
 * The provider job to show for a run.
 *
 * `providerJobId` records the one submission that defines a run's cost and is
 * what a retry resumes, so it is the durable answer. But a run that calls the
 * provider several times — a storyboard draws a frame per beat — cannot fit
 * them in one column, and a video render spends its first minutes on an
 * opening frame that is not the video job at all. Those report whichever job
 * they are waiting on through their progress, which is live and therefore
 * preferred while it is there.
 */
export function resolveProviderTaskId(
  progress: Record<string, unknown> | null,
  providerJobId: string | null,
): string | null {
  return typeof progress?.providerTaskId === "string"
    ? progress.providerTaskId
    : providerJobId;
}
