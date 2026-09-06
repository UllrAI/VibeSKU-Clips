"use client";

import { useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, Check, LayoutGrid, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { actionMessageKey } from "@/components/ugc/action-message";
import { useTranslation } from "@/lib/i18n/translation/client";
import { reopenWorkStep } from "@/lib/ugc/work-actions";
import type { ClipRow } from "@/lib/ugc/works";
import type { VideoMode } from "@/lib/ugc/constants";
import { cn } from "@/lib/utils";
import { StepCard } from "./step-card";

/** The finished clip, with its quality findings spelled out rather than scored. */
export function DoneStep({
  workId,
  clip,
  videoMode,
  onRefresh,
}: {
  workId: string;
  clip: ClipRow;
  videoMode: VideoMode;
  onRefresh: () => void;
}) {
  const { t } = useTranslation();
  const [pending, startTransition] = useTransition();
  const checks = clip.quality?.checks ?? [];

  return (
    <StepCard
      title={t("ugc_work_step_done")}
      description={t("ugc_work_done_hint")}
      secondary={
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await reopenWorkStep(
                workId,
                videoMode === "storyboard" ? "storyboard" : "script",
              );
              if (!result.ok) {
                toast.error(t(actionMessageKey(result.code)));
                return;
              }
              onRefresh();
            })
          }
        >
          <ArrowLeft />
          {t(
            videoMode === "storyboard"
              ? "ugc_work_back_to_storyboard"
              : "ugc_work_back_to_script",
          )}
        </Button>
      }
      action={
        <Button asChild>
          <Link href="/dashboard/works">
            <LayoutGrid />
            {t("ugc_work_open_review")}
          </Link>
        </Button>
      }
    >
      <div className="flex flex-col gap-5 sm:flex-row">
        <div
          className={cn(
            "border-border bg-muted relative w-full shrink-0 overflow-hidden rounded-lg border",
            clip.aspectRatio === "9:16"
              ? "aspect-9/16 max-w-56"
              : "aspect-video sm:max-w-96",
          )}
        >
          {clip.videoUrl ? (
            <video
              className="size-full object-cover"
              src={clip.videoUrl}
              poster={clip.coverUrl ?? undefined}
              controls
              preload="none"
            />
          ) : (
            <p className="text-muted-foreground p-4 text-sm">
              {clip.failureReason ?? t("ugc_clip_no_preview")}
            </p>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs" translate="no">
              {clip.reference}
            </span>
            <Badge variant={clip.quality?.passed ? "secondary" : "outline"}>
              {t(
                clip.quality?.passed
                  ? "ugc_work_quality_passed"
                  : "ugc_work_quality_flagged",
              )}
            </Badge>
          </div>

          <ul className="space-y-1.5 text-sm">
            {checks.map((check) => (
              <li key={check.id} className="flex items-start gap-2">
                {check.passed ? (
                  <Check
                    className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
                    aria-hidden
                  />
                ) : (
                  <TriangleAlert
                    className="text-destructive mt-0.5 size-4 shrink-0"
                    aria-hidden
                  />
                )}
                <span
                  className={check.passed ? "text-muted-foreground" : undefined}
                >
                  {check.detail}
                </span>
              </li>
            ))}
          </ul>

          {clip.publishCaption && (
            <div className="space-y-1">
              <p className="text-muted-foreground text-xs">
                {t("ugc_script_publish_caption")}
              </p>
              <p className="text-sm">{clip.publishCaption}</p>
            </div>
          )}
        </div>
      </div>
    </StepCard>
  );
}
