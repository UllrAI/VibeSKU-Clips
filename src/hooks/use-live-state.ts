"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const BASE_INTERVAL_MS = 3_000;
const MAX_INTERVAL_MS = 20_000;

export interface LiveState {
  /** Changes whenever the page behind this state would render differently. */
  revision: string;
}

/**
 * Keeps a page current while background work runs, without the operator
 * reaching for reload: poll a small state endpoint, and only re-fetch the page
 * itself when something actually moved. The interval backs off while nothing
 * changes, so an open tab left alone costs almost nothing.
 */
export function useLiveState<State extends LiveState>(
  url: string,
  initial: State,
  isLive: (state: State) => boolean,
): State {
  const [state, setState] = useState(initial);
  const router = useRouter();
  const revisionRef = useRef(initial.revision);

  useEffect(() => {
    if (!isLive(state)) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let interval = BASE_INTERVAL_MS;

    const tick = async () => {
      try {
        const response = await fetch(url, { cache: "no-store" });
        if (!response.ok) return;
        const next = (await response.json()) as State;
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
    // `isLive` is a predicate over `state`; re-running on either is enough.
  }, [url, state, isLive, router]);

  return state;
}
