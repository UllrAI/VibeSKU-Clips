import { memo, type KeyboardEvent, type MouseEvent } from "react";
import type { TimeRange } from "@/lib/transcript-editor";

interface EditTimelineProps {
  duration: number;
  currentTime: number;
  removedRanges: TimeRange[];
  silenceRanges: TimeRange[];
  onSeek: (time: number) => void;
  ariaLabel: string;
  removedLabel: string;
  silenceLabel: string;
  currentLabel: string;
}

function clock(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

function percentage(time: number, duration: number): number {
  return duration > 0 ? Math.min(100, Math.max(0, time / duration * 100)) : 0;
}

function EditTimelineComponent({
  duration,
  currentTime,
  removedRanges,
  silenceRanges,
  onSeek,
  ariaLabel,
  removedLabel,
  silenceLabel,
  currentLabel,
}: EditTimelineProps) {
  function seekFromPointer(event: MouseEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (!bounds.width || duration <= 0) return;
    onSeek(Math.min(duration, Math.max(0, (event.clientX - bounds.left) / bounds.width * duration)));
  }

  function seekFromKeyboard(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 5 : 1;
    let next: number | null = null;
    if (event.key === "ArrowLeft" || event.key === "ArrowDown") next = currentTime - step;
    else if (event.key === "ArrowRight" || event.key === "ArrowUp") next = currentTime + step;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = duration;
    if (next === null) return;
    event.preventDefault();
    onSeek(Math.min(duration, Math.max(0, next)));
  }

  return (
    <div>
      <div
        role="slider"
        tabIndex={0}
        aria-label={ariaLabel}
        aria-valuemin={0}
        aria-valuemax={Math.round(duration * 1000)}
        aria-valuenow={Math.round(currentTime * 1000)}
        aria-valuetext={`${currentLabel} ${clock(currentTime)}`}
        onClick={seekFromPointer}
        onKeyDown={seekFromKeyboard}
        className="relative h-14 cursor-pointer overflow-hidden rounded-xl border border-border/70 bg-muted/25 outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <div className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-primary/25" />
        {silenceRanges.map((range, index) => (
          <span
            key={`silence-${index}-${range.start}`}
            title={silenceLabel}
            className="absolute inset-y-2 rounded bg-warning/20"
            style={{
              left: `${percentage(range.start, duration)}%`,
              width: `${Math.max(0.2, percentage(range.end - range.start, duration))}%`,
            }}
          />
        ))}
        {removedRanges.map((range, index) => (
          <span
            key={`removed-${index}-${range.start}`}
            title={removedLabel}
            className="absolute inset-y-1 rounded bg-destructive/60"
            style={{
              left: `${percentage(range.start, duration)}%`,
              width: `${Math.max(0.25, percentage(range.end - range.start, duration))}%`,
            }}
          />
        ))}
        <span
          aria-hidden="true"
          className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-foreground shadow-[0_0_0_2px_hsl(var(--background)/0.7)]"
          style={{ left: `${percentage(currentTime, duration)}%` }}
        />
      </div>
      <div className="mt-1.5 flex items-center justify-between text-[11px] tabular-nums text-muted-foreground">
        <span>0:00</span>
        <span className="font-medium text-foreground">{clock(currentTime)}</span>
        <span>{clock(duration)}</span>
      </div>
    </div>
  );
}

export const EditTimeline = memo(EditTimelineComponent);
