"use client";

import { useTransition } from "react";
import Image from "next/image";
import { ArrowLeft, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  actionMessageKey,
  jobFailureKey,
} from "@/components/ugc/action-message";
import { useTranslation } from "@/lib/i18n/translation/client";
import {
  reopenWorkStep,
  startWorkScript,
  startWorkStoryboard,
  startWorkVideo,
} from "@/lib/ugc/work-actions";
import type { WorkFrameRow } from "@/lib/ugc/works";
import type { VideoAspectRatio, VideoMode } from "@/lib/ugc/constants";
import { cn } from "@/lib/utils";
import { StepCard } from "./step-card";

type RunningStep = "script" | "storyboard" | "video";

const COPY: Record<
  RunningStep,
  {
    title: string;
    running: string;
    wait: string;
    back: "product" | "script" | "storyboard";
  }
> = {
  script: {
    title: "ugc_work_step_script",
    running: "ugc_work_script_running",
    wait: "ugc_work_script_wait",
    back: "product",
  },
  storyboard: {
    title: "ugc_work_step_storyboard",
    running: "ugc_work_storyboard_running",
    wait: "ugc_work_storyboard_wait",
    back: "script",
  },
  video: {
    title: "ugc_work_step_video",
    running: "ugc_work_video_running",
    wait: "ugc_work_video_wait",
    back: "storyboard",
  },
};

const RESTART = {
  script: startWorkScript,
  storyboard: startWorkStoryboard,
  video: startWorkVideo,
};

/**
 * A step that is either working or has given up. Both states say which step
 * they belong to and how long it usually takes, because "generating…" on its
 * own is the thing the operator complained about.
 */
export function PendingStep({
  workId,
  step,
  failed,
  failureCode,
  stalled,
  frames,
  videoMode,
  aspectRatio,
  onRefresh,
}: {
  workId: string;
  step: RunningStep;
  failed: boolean;
  failureCode: string | null;
  stalled: boolean;
  frames: WorkFrameRow[];
  videoMode: VideoMode;
  aspectRatio: VideoAspectRatio;
  onRefresh: () => void;
}) {
  const { t } = useTranslation();
  const [pending, startTransition] = useTransition();
  const copy = COPY[step];
  const back =
    step === "video" && videoMode === "one_take" ? "script" : copy.back;
  const wait =
    step === "video" && videoMode === "one_take"
      ? "ugc_work_video_one_take_wait"
      : copy.wait;

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
      title={t(copy.title)}
      description={t(wait)}
      secondary={
        failed && (
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => run(() => reopenWorkStep(workId, back))}
          >
            <ArrowLeft />
            {t("ugc_work_back_a_step")}
          </Button>
        )
      }
      action={
        failed ? (
          <Button
            disabled={pending}
            onClick={() => run(() => RESTART[step](workId))}
          >
            <RefreshCw />
            {t("ugc_work_retry_step")}
          </Button>
        ) : (
          <Button disabled>
            <Loader2
              className="animate-spin motion-reduce:animate-none"
              aria-hidden
            />
            {t(copy.running)}
          </Button>
        )
      }
    >
      {failed ? (
        <Alert variant="destructive">
          <AlertTitle>{t("ugc_work_step_failed")}</AlertTitle>
          <AlertDescription>{t(jobFailureKey(failureCode))}</AlertDescription>
        </Alert>
      ) : stalled ? (
        <Alert variant="destructive">
          <AlertTitle>{t("ugc_work_stalled_title")}</AlertTitle>
          <AlertDescription>{t("ugc_work_stalled_hint")}</AlertDescription>
        </Alert>
      ) : (
        <p className="text-muted-foreground flex items-center gap-2 text-sm">
          <Loader2
            className="size-4 animate-spin motion-reduce:animate-none"
            aria-hidden
          />
          {t(copy.running)}
        </p>
      )}

      {frames.length > 0 && (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {frames.map((frame) => (
            <li
              key={frame.id}
              className={cn(
                "border-border bg-muted relative overflow-hidden rounded-md border",
                aspectRatio === "9:16" ? "aspect-9/16" : "aspect-video",
              )}
            >
              {frame.imageUrl && (
                <Image
                  src={frame.imageUrl}
                  alt=""
                  fill
                  sizes="15vw"
                  className="object-cover"
                  unoptimized
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </StepCard>
  );
}
