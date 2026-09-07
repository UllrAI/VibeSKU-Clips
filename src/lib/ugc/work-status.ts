import type { WorkSummary } from "./works";

export type WorkListStatus = "running" | "waiting" | "completed" | "failed";

type WorkStatusInput = Pick<
  WorkSummary,
  "failed" | "videoUrl" | "taskActive"
> & {
  work: Pick<WorkSummary["work"], "step" | "stepStatus">;
};

/** A usable current video keeps the work complete unless its successor is active. */
export function workListStatus(summary: WorkStatusInput): WorkListStatus {
  if (
    summary.videoUrl &&
    summary.work.step === "video" &&
    summary.work.stepStatus === "running" &&
    summary.taskActive &&
    !summary.failed
  ) {
    return "running";
  }
  if (summary.videoUrl) return "completed";
  if (summary.failed) return "failed";
  if (summary.work.step === "done") return "completed";
  if (summary.work.stepStatus === "running") return "running";
  return "waiting";
}
