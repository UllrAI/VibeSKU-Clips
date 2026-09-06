"use client";

import { useId, useState } from "react";
import { Check, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  isBatchLive,
  type BatchProgressCounts,
} from "@/hooks/use-batch-progress";
import { useTranslation } from "@/lib/i18n/translation/client";
import { cn } from "@/lib/utils";

type SegmentId = "ready" | "running" | "pending" | "failed";

const SEGMENT_STYLE: Record<SegmentId, string> = {
  ready: "bg-primary",
  running: "bg-primary/50",
  pending: "bg-border",
  failed: "bg-destructive",
};

const SEGMENT_LABEL: Record<SegmentId, string> = {
  ready: "ugc_batch_ready",
  running: "ugc_batch_running",
  pending: "ugc_batch_queued",
  failed: "ugc_batch_failed",
};

const SEGMENT_ORDER: readonly SegmentId[] = [
  "ready",
  "running",
  "pending",
  "failed",
];

/**
 * A compact status bar that sticks to the top of the work area instead of
 * pushing it down. Long-running work should never cost the operator the
 * surface they are working on, and the one-line summary already answers the
 * only question they have while it runs: how much is left.
 *
 * The coloured bar is decorative; the semantics live in the `<progress>`
 * element and the polite live region above it.
 */
export function ProgressOverlay({
  counts,
  meta,
}: {
  counts: BatchProgressCounts;
  /** Plan facts that belong with the detail, not with the running summary. */
  meta?: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const labelId = useId();

  const total = counts.total;
  const done = counts.ready + counts.failed;
  const live = isBatchLive(counts);
  const segments = SEGMENT_ORDER.map((id) => ({ id, count: counts[id] }));

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="bg-background/95 supports-[backdrop-filter]:bg-background/75 border-border sticky top-0 z-10 rounded-lg border backdrop-blur">
        <div className="flex flex-col gap-2 px-3 py-2">
          <output
            id={labelId}
            aria-live="polite"
            className="flex min-w-0 items-center gap-2"
          >
            {live ? (
              <Loader2
                className="text-primary size-3.5 shrink-0 animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
            ) : (
              <Check className="text-primary size-3.5 shrink-0" aria-hidden />
            )}
            <span className="min-w-0 truncate text-xs font-medium">
              {t("ugc_batch_progress_summary", {
                ready: counts.ready,
                total,
                failed: counts.failed,
              })}
            </span>
            <Badge
              variant="secondary"
              className="ml-auto h-5 shrink-0 px-1.5 text-[10px] tabular-nums"
            >
              {live
                ? t("ugc_batch_remaining", { count: Math.max(total - done, 0) })
                : t("ugc_batch_finished")}
            </Badge>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="icon" className="size-6 shrink-0">
                {open ? (
                  <ChevronUp className="size-3.5" aria-hidden="true" />
                ) : (
                  <ChevronDown className="size-3.5" aria-hidden="true" />
                )}
                <span className="sr-only">
                  {t(open ? "ugc_batch_collapse" : "ugc_batch_expand")}
                </span>
              </Button>
            </CollapsibleTrigger>
          </output>

          <progress
            value={done}
            max={total || 1}
            aria-labelledby={labelId}
            className="sr-only"
          />
          <div className="bg-border flex h-1 gap-px overflow-hidden rounded-full">
            {segments
              .filter((segment) => segment.count > 0)
              .map((segment) => (
                <div
                  key={segment.id}
                  aria-hidden="true"
                  style={{ flexGrow: segment.count }}
                  className={cn("h-full", SEGMENT_STYLE[segment.id])}
                />
              ))}
          </div>
        </div>

        <CollapsibleContent>
          <div className="border-border flex flex-col gap-2 border-t px-3 py-2.5">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
              {segments.map((segment) => (
                <div key={segment.id} className="flex items-baseline gap-2">
                  <dt className="text-muted-foreground text-xs">
                    {t(SEGMENT_LABEL[segment.id])}
                  </dt>
                  <dd className="text-sm font-medium tabular-nums">
                    {segment.count}
                  </dd>
                </div>
              ))}
            </dl>
            {meta && (
              <p className="text-muted-foreground text-xs tabular-nums">
                {meta}
              </p>
            )}
            {live && (
              <p className="text-muted-foreground/70 text-xs">
                {t("ugc_batch_can_leave")}
              </p>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
