/**
 * The stepped flow's shape, shared by the server pages and the client rail.
 * It lives outside both so a Server Component can read the array itself rather
 * than a client reference to it.
 */
export type WorkStep = "product" | "script" | "storyboard" | "video" | "done";
export type WorkStepStatus = "idle" | "running" | "review" | "failed";

export const WORK_STEPS: readonly Exclude<WorkStep, "done">[] = [
  "product",
  "script",
  "storyboard",
  "video",
];

export const WORK_STEP_LABEL: Record<WorkStep, string> = {
  product: "ugc_work_step_product",
  script: "ugc_work_step_script",
  storyboard: "ugc_work_step_storyboard",
  video: "ugc_work_step_video",
  done: "ugc_work_step_done",
};

/** How far along a work is, counted in rail positions. */
export function workStepPosition(step: WorkStep): number {
  return step === "done" ? WORK_STEPS.length : WORK_STEPS.indexOf(step);
}

const STATE_LABEL: Record<WorkStepStatus, string> = {
  idle: "ugc_work_state_idle",
  running: "ugc_work_state_running",
  review: "ugc_work_state_review",
  failed: "ugc_work_state_failed",
};

/**
 * What the work is waiting on, in one word: whether it is working, whether it
 * wants the operator, or whether it stopped. A step label alone does not say
 * which of those it is.
 */
export function workStateKey(step: WorkStep, status: WorkStepStatus): string {
  return step === "done" ? "ugc_work_state_done" : STATE_LABEL[status];
}
