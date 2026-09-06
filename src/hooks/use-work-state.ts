"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { WorkState } from "@/lib/ugc/works";

const BASE_INTERVAL_MS = 3_000;
const MAX_INTERVAL_MS = 20_000;

/** A work is live while a step is working, or while its product is still being read. */
function isWorkLive(state: WorkState): boolean {
  if (state.run.failed) return false;
  return state.stepStatus === "running" || state.productState === "reading";
}

/**
 * Keeps the work console current while a step runs, without the operator
 * reaching for reload. Same shape as the batch console: poll a small state
 * endpoint, and only re-fetch the page itself when something actually moved.
 */
export function useWorkState(workId: string, initial: WorkState): WorkState {
  const [state, setState] = useState(initial);
  const router = useRouter();
  const revisionRef = useRef(initial.revision);

  useEffect(() => {
    if (!isWorkLive(state)) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let interval = BASE_INTERVAL_MS;

    const tick = async () => {
      try {
        const response = await fetch(`/api/ugc/works/${workId}/state`, {
          cache: "no-store",
        });
        if (!response.ok) return;
        const next = (await response.json()) as WorkState;
        if (cancelled) return;

        if (next.revision === revisionRef.current) {
          interval = Math.min(interval * 1.5, MAX_INTERVAL_MS);
        } else {
          revisionRef.current = next.revision;
          interval = BASE_INTERVAL_MS;
          setState(next);
          router.refresh();
        }
      } catch {
        // A dropped poll is not worth a toast; the next tick recovers.
        interval = Math.min(interval * 2, MAX_INTERVAL_MS);
      } finally {
        if (!cancelled) timer = setTimeout(tick, interval);
      }
    };

    timer = setTimeout(tick, interval);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [workId, state, router]);

  return state;
}
