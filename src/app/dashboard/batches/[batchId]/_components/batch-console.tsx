"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CircleStop, Loader2, PlayCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/ugc/status-badge";
import { actionMessageKey } from "@/components/ugc/action-message";
import {
  contentLocaleKey,
  marketKey,
  templateKey,
} from "@/components/ugc/labels";
import { ProgressOverlay } from "@/components/ugc/progress-overlay";
import { useBatchProgress } from "@/hooks/use-batch-progress";
import { useTranslation } from "@/lib/i18n/translation/client";
import {
  cancelBatch,
  releaseBatchForRendering,
  retryClip,
} from "@/lib/ugc/actions";
import type { BatchProgress, ClipDetail } from "@/lib/ugc/queries";

export function BatchConsole({
  progress,
  clips,
}: {
  progress: BatchProgress;
  clips: ClipDetail[];
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const counts = useBatchProgress(progress.batch.id, {
    status: progress.batch.status,
    total: Math.max(progress.total, progress.batch.plannedCount),
    ready: progress.ready,
    failed: progress.failed,
    running: progress.running,
    pending: progress.pending,
  });

  const run = (
    action: () => Promise<{ ok: boolean; code?: string }>,
    successKey: string,
  ) =>
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        toast.error(t(actionMessageKey(result.code)));
        return;
      }
      toast.success(t(successKey));
      router.refresh();
    });

  const inFlight = counts.running + counts.pending;
  const awaitingApproval =
    progress.batch.config.reviewScriptsFirst && counts.pending > 0;
  const cancellable = counts.status === "running" && inFlight > 0;

  return (
    <div className="space-y-4">
      <ProgressOverlay counts={counts} />

      {(awaitingApproval || cancellable) && (
        <div className="flex flex-wrap gap-2">
          {awaitingApproval && (
            <Button
              disabled={pending}
              onClick={() =>
                run(
                  () => releaseBatchForRendering(progress.batch.id),
                  "ugc_batch_released",
                )
              }
            >
              <PlayCircle />
              {t("ugc_batch_release_scripts")}
            </Button>
          )}
          {cancellable && (
            <Button
              variant="outline"
              disabled={pending}
              onClick={() =>
                run(() => cancelBatch(progress.batch.id), "ugc_batch_cancelled")
              }
            >
              <CircleStop />
              {t("ugc_batch_cancel_pending")}
            </Button>
          )}
        </div>
      )}

      {clips.length === 0 ? (
        <EmptyState
          spacing="compact"
          icon={
            <Loader2
              className="animate-spin motion-reduce:animate-none"
              aria-hidden
            />
          }
          title={t("ugc_batch_preparing_title")}
          description={t("ugc_batch_preparing_hint")}
        />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("ugc_clip_reference")}</TableHead>
                <TableHead>{t("ugc_plan_product")}</TableHead>
                <TableHead>{t("ugc_clip_configuration")}</TableHead>
                <TableHead>{t("ugc_clip_script")}</TableHead>
                <TableHead>{t("ugc_common_status")}</TableHead>
                <TableHead className="text-right">
                  {t("ugc_common_actions")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clips.map((detail) => (
                <TableRow key={detail.clip.id}>
                  <TableCell className="font-mono text-xs">
                    {detail.clip.reference}
                  </TableCell>
                  <TableCell>{detail.productName}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {[
                      t(contentLocaleKey(detail.clip.locale)),
                      t(marketKey(detail.clip.market)),
                      t(templateKey(detail.clip.template)),
                      detail.talentName,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </TableCell>
                  <TableCell className="max-w-xs">
                    <span className="line-clamp-2 text-sm">
                      {detail.scriptTitle ?? t("ugc_clip_script_pending")}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <StatusBadge kind="clip" status={detail.clip.status} />
                      {detail.clip.failureReason && (
                        <p className="text-destructive text-xs">
                          {detail.clip.failureReason}
                        </p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    {detail.clip.status === "failed" && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() =>
                          run(
                            () => retryClip(detail.clip.id),
                            "ugc_clip_retry_queued",
                          )
                        }
                      >
                        <RefreshCw />
                        {t("ugc_clip_retry")}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
