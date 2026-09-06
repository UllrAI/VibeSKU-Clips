"use client";

import { useLiveState } from "@/hooks/use-live-state";
import type { WorkState } from "@/lib/ugc/works";

/** A work is live while a step is working, or its product is still being read. */
function isWorkLive(state: WorkState): boolean {
  if (state.run.failed) return false;
  return state.stepStatus === "running" || state.productState === "reading";
}

/** Keeps the work console current while a step runs. */
export function useWorkState(workId: string, initial: WorkState): WorkState {
  return useLiveState(`/api/ugc/works/${workId}/state`, initial, isWorkLive);
}
