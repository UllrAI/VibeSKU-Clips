"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Film, Loader2, Play, RefreshCw, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  actionMessageKey,
  jobFailureKey,
} from "@/components/ugc/action-message";
import { ReferenceStatusBadge } from "@/components/ugc/reference-status-badge";
import { useReferenceState } from "@/hooks/use-reference-state";
import { useTranslation } from "@/lib/i18n/translation/client";
import { retryReference } from "@/lib/ugc/reference-actions";
import type { ReferenceRow, ReferenceState } from "@/lib/ugc/queries";

const READING_STEPS: Record<string, string> = {
  fetching_video: "ugc_reference_step_fetching",
  sampling_frames: "ugc_reference_step_sampling",
  transcribing: "ugc_reference_step_transcribing",
  reading_structure: "ugc_reference_step_reading",
};

function seconds(value: number): string {
  return `${value.toFixed(1)}s`;
}

/**
 * The blueprint next to the piece it came from.
 *
 * A reading is only worth acting on if it can be checked, so every beat jumps
 * the player to the moment it was read from. Those seconds are evidence, not
 * instructions: the clip built from this blueprint has its own duration, and
 * the page says so rather than implying a timeline to copy.
 */
export function BlueprintReview({
  reference,
  initialState,
}: {
  reference: ReferenceRow;
  initialState: ReferenceState;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const state = useReferenceState(reference.id, initialState);
  const player = useRef<HTMLVideoElement>(null);
  const [activeBeat, setActiveBeat] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  const blueprint = reference.blueprint;
  const failed = state.status === "failed" || state.run.failed;
  const stalled = state.run.stalled;
  const reading = !blueprint && !failed && !stalled;
  const step = state.run.progress?.step;
  const stepKey = typeof step === "string" ? READING_STEPS[step] : undefined;

  const jumpTo = (index: number, atSeconds: number) => {
    setActiveBeat(index);
    const video = player.current;
    if (!video) return;
    video.currentTime = atSeconds;
    void video.play().catch(() => undefined);
  };

  const retry = () =>
    startTransition(async () => {
      const result = await retryReference(reference.id);
      if (!result.ok) {
        toast.error(t(actionMessageKey(result.code)));
        return;
      }
      toast.success(t("ugc_reference_reading_restarted"));
      router.refresh();
    });

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      <div className="lg:sticky lg:top-4 lg:self-start">
        <Card className="gap-3 py-3">
          <CardContent className="space-y-3 px-3">
            {reference.videoUrl ? (
              <video
                ref={player}
                src={reference.videoUrl}
                controls
                playsInline
                className="aspect-[9/16] w-full rounded-md bg-black object-contain"
              />
            ) : (
              <div className="bg-muted text-muted-foreground flex aspect-[9/16] items-center justify-center rounded-md text-sm">
                {t("ugc_reference_video_pending")}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <ReferenceStatusBadge status={state.status} />
              {reference.durationMs && (
                <span className="text-muted-foreground text-xs">
                  {seconds(reference.durationMs / 1000)}
                </span>
              )}
              {reference.aspectRatio && (
                <span className="text-muted-foreground text-xs" translate="no">
                  {reference.aspectRatio}
                </span>
              )}
            </div>
            {blueprint && (
              <Button asChild className="w-full">
                <Link href={`/dashboard/works/new?referenceId=${reference.id}`}>
                  <Film />
                  {t("ugc_reference_build_from_blueprint")}
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        {reading && (
          <Alert>
            <Loader2
              className="animate-spin motion-reduce:animate-none"
              aria-hidden
            />
            <AlertTitle>{t("ugc_reference_reading_title")}</AlertTitle>
            <AlertDescription>
              {t(stepKey ?? "ugc_reference_step_fetching")}
            </AlertDescription>
          </Alert>
        )}

        {(failed || stalled) && (
          <Alert variant="destructive">
            <TriangleAlert aria-hidden />
            <AlertTitle>{t("ugc_reference_read_failed_title")}</AlertTitle>
            <AlertDescription className="space-y-3">
              <p>
                {t(
                  stalled
                    ? "ugc_work_stalled_hint"
                    : jobFailureKey(state.run.failureCode),
                )}
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={retry}
                disabled={pending}
              >
                {pending ? (
                  <Loader2
                    className="animate-spin motion-reduce:animate-none"
                    aria-hidden
                  />
                ) : (
                  <RefreshCw aria-hidden />
                )}
                {t("ugc_reference_read_again")}
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {blueprint && (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                  {t(`ugc_blueprint_format_${blueprint.format}`)}
                  <Badge variant="outline">
                    {t("ugc_blueprint_beats_count", {
                      count: blueprint.beats.length,
                    })}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs font-medium uppercase">
                    {t("ugc_blueprint_hook")}
                  </p>
                  <p className="leading-relaxed">{blueprint.hook}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs font-medium uppercase">
                    {t("ugc_blueprint_why")}
                  </p>
                  <p className="leading-relaxed">{blueprint.whyItWorks}</p>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-2">
              <h2 className="text-sm font-medium">
                {t("ugc_blueprint_beats_title")}
              </h2>
              <p className="text-muted-foreground text-xs">
                {t("ugc_blueprint_beats_hint")}
              </p>
              <ul className="space-y-2">
                {blueprint.beats.map((beat, index) => (
                  <li key={index}>
                    <Card
                      className={
                        activeBeat === index
                          ? "border-primary gap-2 py-3"
                          : "gap-2 py-3"
                      }
                    >
                      <CardContent className="space-y-2 px-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="secondary">
                            {t(`ugc_blueprint_role_${beat.role}`)}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2"
                            onClick={() => jumpTo(index, beat.sourceStart)}
                            disabled={!reference.videoUrl}
                          >
                            <Play aria-hidden />
                            {seconds(beat.sourceStart)}
                          </Button>
                        </div>
                        <p className="text-sm leading-relaxed">
                          {beat.purpose}
                        </p>
                        {beat.spokenGist && (
                          <p className="text-muted-foreground text-xs leading-relaxed">
                            {t("ugc_blueprint_spoken_gist", {
                              gist: beat.spokenGist,
                            })}
                          </p>
                        )}
                        {beat.events.length > 0 && (
                          <ul className="space-y-1">
                            {beat.events.map((event, eventIndex) => (
                              <li
                                key={eventIndex}
                                className="text-muted-foreground flex flex-wrap items-baseline gap-1.5 text-xs leading-relaxed"
                              >
                                <Badge
                                  variant="outline"
                                  className="font-normal"
                                >
                                  {t(`ugc_blueprint_event_${event.kind}`)}
                                </Badge>
                                <span>
                                  {t("ugc_blueprint_event_line", {
                                    respondsTo: event.respondsTo,
                                    purpose: event.purpose,
                                  })}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </CardContent>
                    </Card>
                  </li>
                ))}
              </ul>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Card className="gap-2 py-3">
                <CardContent className="space-y-2 px-3">
                  <p className="text-sm font-medium">
                    {t("ugc_blueprint_preserve")}
                  </p>
                  <ul className="text-muted-foreground list-disc space-y-1 pl-4 text-xs leading-relaxed">
                    {blueprint.preserve.map((item, index) => (
                      <li key={index}>{item}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
              {blueprint.redesign.length > 0 && (
                <Card className="gap-2 py-3">
                  <CardContent className="space-y-2 px-3">
                    <p className="text-sm font-medium">
                      {t("ugc_blueprint_redesign")}
                    </p>
                    <ul className="text-muted-foreground list-disc space-y-1 pl-4 text-xs leading-relaxed">
                      {blueprint.redesign.map((item, index) => (
                        <li key={index}>{item}</li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
