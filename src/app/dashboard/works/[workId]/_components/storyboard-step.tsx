"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { ArrowLeft, Loader2, RefreshCw, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { actionMessageKey } from "@/components/ugc/action-message";
import { useTranslation } from "@/lib/i18n/translation/client";
import {
  regenerateWorkFrame,
  reopenWorkStep,
  startWorkStoryboard,
  startWorkVideo,
} from "@/lib/ugc/work-actions";
import type { WorkFrameRow } from "@/lib/ugc/works";
import { cn } from "@/lib/utils";
import { StepCard } from "./step-card";

/**
 * The last cheap step. Frames are generated from the script beats and handed
 * to the video model together, so a frame the operator is unhappy with is
 * worth redrawing here rather than after the render is paid for.
 */
export function StoryboardStep({
  workId,
  frames,
  onRefresh,
}: {
  workId: string;
  frames: WorkFrameRow[];
  onRefresh: () => void;
}) {
  const { t } = useTranslation();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<WorkFrameRow | null>(null);
  const [prompt, setPrompt] = useState("");

  const ready = frames.filter((frame) => frame.status === "ready");
  const working = frames.some(
    (frame) => frame.status === "pending" || frame.status === "generating",
  );

  const run = (task: () => Promise<{ ok: boolean; code?: string }>) =>
    startTransition(async () => {
      const result = await task();
      if (!result.ok) {
        toast.error(t(actionMessageKey(result.code)));
        return;
      }
      onRefresh();
    });

  const openEditor = (frame: WorkFrameRow) => {
    setEditing(frame);
    setPrompt(frame.prompt);
  };

  const redraw = () => {
    if (!editing) return;
    const frameId = editing.id;
    const next = prompt.trim();
    setEditing(null);
    run(async () => {
      const result = await regenerateWorkFrame(
        frameId,
        next === editing.prompt ? undefined : next,
      );
      if (result.ok) toast.success(t("ugc_work_frame_redrawing"));
      return result;
    });
  };

  return (
    <StepCard
      title={t("ugc_work_step_storyboard")}
      description={t("ugc_work_storyboard_hint")}
      secondary={
        <>
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => run(() => reopenWorkStep(workId, "script"))}
          >
            <ArrowLeft />
            {t("ugc_work_back_to_script")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={pending || working}
            onClick={() => run(() => startWorkStoryboard(workId))}
          >
            <RefreshCw />
            {t("ugc_work_redraw_all")}
          </Button>
        </>
      }
      action={
        <Button
          onClick={() => run(() => startWorkVideo(workId))}
          disabled={pending || working || ready.length === 0}
        >
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          {t("ugc_work_confirm_storyboard")}
        </Button>
      }
    >
      <ol className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {frames.map((frame) => (
          <li key={frame.id} className="space-y-2">
            <button
              type="button"
              onClick={() => openEditor(frame)}
              className={cn(
                "border-border bg-muted focus-visible:ring-ring relative block aspect-9/16 w-full overflow-hidden rounded-lg border",
                "hover:border-primary transition-colors focus-visible:ring-[3px] focus-visible:outline-none",
              )}
            >
              {frame.imageUrl ? (
                <Image
                  src={frame.imageUrl}
                  alt=""
                  fill
                  sizes="(min-width: 1024px) 20vw, 45vw"
                  className="object-cover"
                  unoptimized
                />
              ) : (
                <span className="text-muted-foreground absolute inset-0 flex items-center justify-center">
                  {frame.status === "failed" ? (
                    <TriangleAlert
                      className="text-destructive size-5"
                      aria-hidden
                    />
                  ) : (
                    <Loader2
                      className="size-5 animate-spin motion-reduce:animate-none"
                      aria-hidden
                    />
                  )}
                </span>
              )}
              <span className="bg-background/85 text-foreground absolute top-2 left-2 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums backdrop-blur">
                {frame.position + 1}
              </span>
            </button>
            <p className="text-muted-foreground line-clamp-2 text-xs">
              {frame.status === "failed"
                ? (frame.failureReason ?? t("ugc_work_frame_failed"))
                : frame.prompt}
            </p>
          </li>
        ))}
      </ol>

      <Dialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("ugc_work_frame_edit_title")}</DialogTitle>
            <DialogDescription>
              {t("ugc_work_frame_edit_hint")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="work-frame-prompt">
              {t("ugc_work_frame_prompt")}
            </Label>
            <Textarea
              id="work-frame-prompt"
              rows={6}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              {t("ugc_common_cancel")}
            </Button>
            <Button onClick={redraw} disabled={!prompt.trim()}>
              <RefreshCw />
              {t("ugc_work_frame_redraw")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </StepCard>
  );
}
