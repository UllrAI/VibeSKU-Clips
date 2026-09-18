"use client";

import { useLiveState } from "@/hooks/use-live-state";
import type { ReferenceState } from "@/lib/ugc/queries";

/** Reading is live until the blueprint lands, the reader gives up, or nobody takes it. */
function isReferenceLive(state: ReferenceState): boolean {
  if (state.run.failed || state.run.stalled) return false;
  return (
    state.status === "pending" ||
    state.status === "ingesting" ||
    state.status === "analyzing"
  );
}

/** Keeps the reference page current while its video is being read. */
export function useReferenceState(
  referenceId: string,
  initial: ReferenceState,
): ReferenceState {
  return useLiveState(
    `/api/ugc/references/${referenceId}/state`,
    initial,
    isReferenceLive,
  );
}
