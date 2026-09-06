"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export interface BatchProgressCounts {
  status: "draft" | "running" | "completed" | "cancelled";
  /** Why the run produced less than it planned; null when nothing was skipped. */
  note: string | null;
  /** Work is queued but nothing is consuming it — usually a worker that is not running. */
  stalled: boolean;
  total: number;
  ready: number;
  failed: number;
  running: number;
  pending: number;
}

const BASE_INTERVAL_MS = 4_000;
const MAX_INTERVAL_MS = 30_000;

/**
 * A batch is live until it is finished or cancelled, which is not the same as
 * having clips in flight: while its products are still being read there are no
 * clip rows at all, and the console must not report that as done.
 */
export function isBatchLive(counts: BatchProgressCounts): boolean {
  if (counts.status === "completed" || counts.status === "cancelled") {
    return false;
  }
  return counts.ready + counts.failed < counts.total;
}

/**
 * Keeps a batch console current without the operator reaching for reload.
 *
 * The counts endpoint is cheap, so it is polled on a short interval that backs
 * off while nothing changes; the expensive part — the rows themselves — is
 * only re-fetched (`router.refresh()`) when a count actually moves. Polling
 * stops for good once no clip can change any more.
 */
export function useBatchProgress(
  batchId: string,
  initial: BatchProgressCounts,
): BatchProgressCounts {
  const [counts, setCounts] = useState(initial);
  const router = useRouter();
  const signatureRef = useRef(JSON.stringify(initial));

  useEffect(() => {
    if (!isBatchLive(counts)) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let interval = BASE_INTERVAL_MS;

    const tick = async () => {
      try {
        const response = await fetch(`/api/ugc/batches/${batchId}/progress`, {
          cache: "no-store",
        });
        if (!response.ok) return;
        const next = (await response.json()) as BatchProgressCounts;
        if (cancelled) return;

        const signature = JSON.stringify(next);
        if (signature === signatureRef.current) {
          interval = Math.min(interval * 1.5, MAX_INTERVAL_MS);
        } else {
          signatureRef.current = signature;
          interval = BASE_INTERVAL_MS;
          setCounts(next);
          router.refresh();
        }
      } catch {
        // A dropped poll is not worth telling the operator about; the next
        // tick recovers, and the numbers on screen stay the last known truth.
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
  }, [batchId, counts, router]);

  return counts;
}
