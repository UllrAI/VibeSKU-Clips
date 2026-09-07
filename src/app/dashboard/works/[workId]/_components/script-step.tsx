"use client";

import { useState, useTransition } from "react";
import { ArrowLeft, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { actionMessageKey } from "@/components/ugc/action-message";
import { ScriptEditor } from "@/components/ugc/script-editor";
import { useTranslation } from "@/lib/i18n/translation/client";
import {
  reopenWorkStep,
  saveWorkScript,
  startWorkFromScript,
} from "@/lib/ugc/work-actions";
import type { ScriptRow } from "@/lib/ugc/queries";
import type { VideoMode } from "@/lib/ugc/constants";
import type { EditableScript } from "@/lib/ugc/types";
import { StepCard } from "./step-card";

/**
 * The script the operator signs off on. Everything downstream is generated
 * from these words, so this is the cheapest place to change the clip — and it
 * is editable in place rather than behind a "request changes" round trip.
 */
export function ScriptStep({
  workId,
  script,
  videoMode,
  onRefresh,
}: {
  workId: string;
  script: ScriptRow;
  videoMode: VideoMode;
  onRefresh: () => void;
}) {
  const { t } = useTranslation();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState<EditableScript>(() => ({
    title: script.title,
    hook: script.hook,
    productionPrompt: script.productionPrompt ?? "",
    beats: script.beats.map((beat) => ({
      ...beat,
      camera: beat.camera ?? t("ugc_script_camera_default"),
    })),
    captions: script.captions.join("\n"),
    publishCaption: script.publishCaption ?? undefined,
  }));

  const currentSnapshot = JSON.stringify(value);
  const [savedSnapshot, setSavedSnapshot] = useState(currentSnapshot);
  const dirty = currentSnapshot !== savedSnapshot;

  const persist = async () =>
    saveWorkScript(workId, {
      title: value.title.trim(),
      hook: value.hook.trim(),
      productionPrompt: value.productionPrompt.trim(),
      beats: value.beats.map((beat) => ({
        ...beat,
        shot: beat.shot.trim(),
        action: beat.action.trim(),
        camera: beat.camera?.trim() || t("ugc_script_camera_default"),
        voiceover: beat.voiceover.trim(),
      })),
      captions: value.captions
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
      publishCaption: value.publishCaption,
    });

  const save = () =>
    startTransition(async () => {
      const result = await persist();
      if (!result.ok) {
        toast.error(t(actionMessageKey(result.code)));
        return;
      }
      setSavedSnapshot(currentSnapshot);
      toast.success(t("ugc_work_script_saved"));
      onRefresh();
    });

  const accept = () =>
    startTransition(async () => {
      if (dirty) {
        const saved = await persist();
        if (!saved.ok) {
          toast.error(t(actionMessageKey(saved.code)));
          return;
        }
      }
      const started = await startWorkFromScript(workId);
      if (!started.ok) {
        toast.error(t(actionMessageKey(started.code)));
        return;
      }
      toast.success(
        t(
          videoMode === "storyboard"
            ? "ugc_work_storyboard_started"
            : "ugc_work_video_started",
        ),
      );
      onRefresh();
    });

  return (
    <StepCard
      title={t("ugc_work_step_script")}
      description={t(
        videoMode === "storyboard"
          ? "ugc_work_script_hint"
          : "ugc_work_script_one_take_hint",
      )}
      secondary={
        <>
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await reopenWorkStep(workId, "product");
                onRefresh();
              })
            }
          >
            <ArrowLeft />
            {t("ugc_work_back_to_product")}
          </Button>
          {dirty && (
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={save}
            >
              <Save />
              {t("ugc_common_save")}
            </Button>
          )}
        </>
      }
      action={
        <Button onClick={accept} disabled={pending || !value.title.trim()}>
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          {t(
            videoMode === "storyboard"
              ? "ugc_work_confirm_script"
              : "ugc_work_confirm_script_and_render",
          )}
        </Button>
      }
    >
      <ScriptEditor
        idPrefix="work-script"
        value={value}
        onChange={setValue}
        videoMode={videoMode}
      />
    </StepCard>
  );
}
