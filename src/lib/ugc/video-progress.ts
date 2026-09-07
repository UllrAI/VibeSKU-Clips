import type { TaskRunStatus } from "@/lib/tasks/types";

export const VIDEO_PROGRESS_STEP = {
  preparing: "preparing_video",
  rendering: "rendering_video",
  archiving: "archiving_video",
} as const;

export type VideoGenerationPhase =
  | "queued"
  | "preparing"
  | "rendering"
  | "archiving";

/** Converts internal task progress into the small set of stages shown in UI. */
export function videoGenerationPhase(
  status: TaskRunStatus | "idle",
  progress: Record<string, unknown> | null,
): VideoGenerationPhase {
  const step = progress?.step;
  if (step === VIDEO_PROGRESS_STEP.archiving) return "archiving";
  if (step === VIDEO_PROGRESS_STEP.rendering) return "rendering";
  if (step === VIDEO_PROGRESS_STEP.preparing || status === "running") {
    return "preparing";
  }
  return "queued";
}
