"use client";

import { Check, Loader2 } from "lucide-react";
import { useTranslation } from "@/lib/i18n/translation/client";
import {
  WORK_STEP_LABEL,
  workStepsFor,
  workStepPosition,
  type WorkStep,
  type WorkVideoMode,
} from "@/lib/ugc/work-steps";
import { cn } from "@/lib/utils";

/**
 * Where the work is, and what it has already been through.
 *
 * A stepped flow only pays for itself if the operator can see the whole path
 * at once — how many steps there are, which one is theirs now, and which are
 * already signed off. A bare spinner tells them none of that.
 */
export function StepRail({
  step,
  busy,
  videoMode,
}: {
  step: WorkStep;
  busy: boolean;
  videoMode: WorkVideoMode;
}) {
  const { t } = useTranslation();
  const steps = workStepsFor(videoMode);
  const current = workStepPosition(step, videoMode);

  return (
    <ol className="flex flex-wrap items-center gap-x-1 gap-y-2">
      {steps.map((entry, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <li key={entry} className="flex items-center gap-1">
            <span
              aria-current={active ? "step" : undefined}
              className={cn(
                "flex items-center gap-2 rounded-full px-3 py-1.5 text-sm transition-colors",
                active && "bg-primary/10 text-foreground font-medium",
                done && "text-muted-foreground",
                !active && !done && "text-muted-foreground/60",
              )}
            >
              <span
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-full border text-xs tabular-nums",
                  done && "border-primary bg-primary text-primary-foreground",
                  active && "border-primary text-primary",
                  !active && !done && "border-border",
                )}
              >
                {done ? (
                  <Check className="size-3" aria-hidden />
                ) : active && busy ? (
                  <Loader2
                    className="size-3 animate-spin motion-reduce:animate-none"
                    aria-hidden
                  />
                ) : (
                  index + 1
                )}
              </span>
              {t(WORK_STEP_LABEL[entry])}
            </span>
            {index < steps.length - 1 && (
              <span
                aria-hidden
                className={cn(
                  "h-px w-4 sm:w-8",
                  done ? "bg-primary" : "bg-border",
                )}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
