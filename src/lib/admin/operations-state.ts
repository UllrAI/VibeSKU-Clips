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
