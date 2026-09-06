/**
 * The stepped flow's shape, shared by the server pages and the client rail.
 * It lives outside both so a Server Component can read the array itself rather
 * than a client reference to it.
 */
export type WorkStep = "product" | "script" | "storyboard" | "video" | "done";

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
