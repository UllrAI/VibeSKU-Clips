"use client";

import { useTransition } from "react";
import { ArrowLeft, Check, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { actionMessageKey } from "@/components/ugc/action-message";
import { useTranslation } from "@/lib/i18n/translation/client";
import { CREDIT_COST } from "@/lib/ugc/constants";
import { displayText } from "@/lib/ugc/script-notation";
import {
  acceptWorkTake,
  regenerateWorkSegment,
  reopenWorkStep,
} from "@/lib/ugc/work-actions";
import type { ScriptBeat } from "@/lib/ugc/types";
import type { WorkDetail } from "@/lib/ugc/works";
import { cn } from "@/lib/utils";
import { StepCard } from "./step-card";

function shotCredits(startMs: number, endMs: number): number {
  return Math.max(
    1,
    Math.ceil((CREDIT_COST.render * (endMs - startMs)) / 15000),
  );
}

/**
 * Shots that were generated and billed but whose audio does not carry the
 * approved line. They are shown, not discarded: the operator watches the take
 * and decides, one shot at a time, instead of losing the whole work to one of
 * them.
 */
export function ShotReviewStep({
  workId,
  segments,
  beats,
  aspectRatio,
  onRefresh,
}: {
  workId: string;
  segments: WorkDetail["segments"];
  beats: ScriptBeat[];
  aspectRatio: "9:16" | "16:9";
  onRefresh: () => void;
}) {
  const { t } = useTranslation();
  const [pending, startTransition] = useTransition();
  const undecided = segments.filter(
    ({ take }) => take?.status === "review",
  ).length;

  const run = (task: () => Promise<{ ok: boolean; code?: string }>) =>
    startTransition(async () => {
      const result = await task();
      if (!result.ok) {
        toast.error(t(actionMessageKey(result.code)));
        return;
      }
      onRefresh();
    });

  return (
    <StepCard
      title={t("ugc_work_shot_review_title")}
      description={t("ugc_work_shot_review_description")}
      secondary={
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => run(() => reopenWorkStep(workId, "script"))}
        >
          <ArrowLeft />
          {t("ugc_work_shot_review_rewrite")}
        </Button>
      }
      action={
        <Button disabled>
          {t("ugc_work_shot_review_pending", { count: undecided })}
        </Button>
      }
    >
      <ol className="grid gap-3 sm:grid-cols-2">
        {segments.map(({ segment, take }) => {
          const reviewing = take?.status === "review";
          const line = displayText(beats[segment.position]?.voiceover ?? "");
          return (
            <li
              key={segment.id}
              className={cn(
                "space-y-2 rounded-lg border p-3",
                reviewing ? "border-amber-500/60" : "border-border opacity-60",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">
                  {t("ugc_work_segment_label", {
                    position: segment.position + 1,
                  })}{" "}
                  · {segment.startMs / 1000}–{segment.endMs / 1000}s
                </span>
                <Badge variant={reviewing ? "secondary" : "outline"}>
                  {t(`ugc_work_segment_status_${take?.status ?? "pending"}`)}
                </Badge>
              </div>

              {take?.videoUrl && (
                <video
                  src={take.videoUrl}
                  controls
                  preload="none"
                  className={cn(
                    "w-full rounded-md bg-black",
                    aspectRatio === "9:16" ? "max-h-72" : "max-h-48",
                  )}
                />
              )}

              {reviewing && (
                <>
                  <dl className="space-y-1 text-xs">
                    <div>
                      <dt className="text-muted-foreground">
                        {t("ugc_work_shot_review_script")}
                      </dt>
                      <dd>{line}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">
                        {t("ugc_work_shot_review_heard")}
                      </dt>
                      <dd
                        className={cn(!take.transcript && "text-destructive")}
                      >
                        {take.transcript ||
                          t(
                            take.transcript === null
                              ? "ugc_work_shot_review_unchecked"
                              : "ugc_work_shot_review_silent",
                          )}
                      </dd>
                    </div>
                  </dl>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => run(() => acceptWorkTake(take.id))}
                    >
                      <Check />
                      {t("ugc_work_shot_keep")}
                    </Button>
                    <Button
                      size="sm"
                      disabled={pending}
                      onClick={() =>
                        run(() => regenerateWorkSegment(segment.id))
                      }
                    >
                      <RefreshCw />
                      {t("ugc_work_regenerate_segment", {
                        credits: shotCredits(segment.startMs, segment.endMs),
                      })}
                    </Button>
                  </div>
                  <p className="text-muted-foreground text-xs">
                    {t("ugc_work_shot_keep_hint")}
                  </p>
                </>
              )}
            </li>
          );
        })}
      </ol>
    </StepCard>
  );
}
