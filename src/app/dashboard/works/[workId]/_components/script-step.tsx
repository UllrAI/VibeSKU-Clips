"use client";

import { useState, useTransition } from "react";
import { ArrowLeft, ChevronDown, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { actionMessageKey } from "@/components/ugc/action-message";
import { useTranslation } from "@/lib/i18n/translation/client";
import {
  reopenWorkStep,
  saveWorkScript,
  startWorkFromScript,
} from "@/lib/ugc/work-actions";
import type { ScriptRow } from "@/lib/ugc/queries";
import type { VideoMode } from "@/lib/ugc/constants";
import type { ScriptBeat } from "@/lib/ugc/types";
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
  const [title, setTitle] = useState(script.title);
  const [hook, setHook] = useState(script.hook);
  const [productionPrompt, setProductionPrompt] = useState(
    script.productionPrompt ?? "",
  );
  const [beats, setBeats] = useState<ScriptBeat[]>(() =>
    script.beats.map((beat) => ({
      ...beat,
      camera: beat.camera ?? t("ugc_script_camera_default"),
    })),
  );
  const [captions, setCaptions] = useState(script.captions.join("\n"));

  const currentSnapshot = JSON.stringify({
    title,
    hook,
    productionPrompt,
    beats,
    captions,
  });
  const [savedSnapshot, setSavedSnapshot] = useState(currentSnapshot);
  const dirty = currentSnapshot !== savedSnapshot;

  const updateBeat = <Key extends keyof ScriptBeat>(
    index: number,
    key: Key,
    value: ScriptBeat[Key],
  ) =>
    setBeats((current) =>
      current.map((beat, position) =>
        position === index ? { ...beat, [key]: value } : beat,
      ),
    );

  const persist = async () =>
    saveWorkScript(workId, {
      title: title.trim(),
      hook: hook.trim(),
      productionPrompt: productionPrompt.trim(),
      beats: beats.map((beat) => ({
        ...beat,
        shot: beat.shot.trim(),
        action: beat.action.trim(),
        camera: beat.camera?.trim() || t("ugc_script_camera_default"),
        voiceover: beat.voiceover.trim(),
      })),
      captions: captions
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
      publishCaption: script.publishCaption ?? undefined,
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
        <Button onClick={accept} disabled={pending || !title.trim()}>
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          {t(
            videoMode === "storyboard"
              ? "ugc_work_confirm_script"
              : "ugc_work_confirm_script_and_render",
          )}
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="work-script-title">{t("ugc_script_title")}</Label>
          <Input
            id="work-script-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="work-script-hook">{t("ugc_script_hook")}</Label>
          <Input
            id="work-script-hook"
            value={hook}
            onChange={(event) => setHook(event.target.value)}
          />
        </div>
      </div>

      <Collapsible defaultOpen className="border-border rounded-lg border">
        <CollapsibleTrigger className="hover:bg-accent/50 group flex w-full items-center justify-between gap-3 rounded-lg px-4 py-3 text-left transition-colors">
          <span>
            <span className="block text-sm font-medium">
              {t("ugc_script_production_prompt")}
            </span>
            <span className="text-muted-foreground block text-xs">
              {t("ugc_script_production_prompt_hint")}
            </span>
          </span>
          <ChevronDown
            className="text-muted-foreground size-4 shrink-0 transition-transform group-data-[state=open]:rotate-180"
            aria-hidden
          />
        </CollapsibleTrigger>
        <CollapsibleContent className="border-border border-t p-4">
          <Textarea
            id="work-script-production-prompt"
            rows={18}
            value={productionPrompt}
            onChange={(event) => setProductionPrompt(event.target.value)}
          />
        </CollapsibleContent>
      </Collapsible>

      <div className="space-y-2">
        <Label htmlFor="work-script-captions">{t("ugc_script_captions")}</Label>
        <Textarea
          id="work-script-captions"
          rows={3}
          value={captions}
          onChange={(event) => setCaptions(event.target.value)}
          placeholder={t("ugc_brief_one_per_line")}
        />
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">{t("ugc_work_beats")}</p>
        <p className="text-muted-foreground text-xs">
          {t(
            videoMode === "storyboard"
              ? "ugc_work_beats_hint"
              : "ugc_work_beats_one_take_hint",
          )}
        </p>
        <ol className="divide-border border-border divide-y rounded-lg border">
          {beats.map((beat, index) => (
            <li key={beat.start} className="flex gap-3 p-4 text-sm">
              <Badge
                variant="secondary"
                className="h-5 shrink-0 font-normal tabular-nums"
                translate="no"
              >
                {beat.start}–{beat.end}s
              </Badge>
              <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2">
                <BeatField
                  id={`beat-${index}-shot`}
                  label={t("ugc_script_beat_shot")}
                  value={beat.shot}
                  onChange={(value) => updateBeat(index, "shot", value)}
                />
                <BeatField
                  id={`beat-${index}-camera`}
                  label={t("ugc_script_beat_camera")}
                  value={beat.camera ?? ""}
                  onChange={(value) => updateBeat(index, "camera", value)}
                />
                <BeatField
                  id={`beat-${index}-action`}
                  label={t("ugc_script_beat_visual")}
                  value={beat.action}
                  onChange={(value) => updateBeat(index, "action", value)}
                  rows={4}
                />
                <BeatField
                  id={`beat-${index}-voiceover`}
                  label={t("ugc_script_beat_dialogue")}
                  value={beat.voiceover}
                  onChange={(value) => updateBeat(index, "voiceover", value)}
                  rows={4}
                />
              </div>
            </li>
          ))}
        </ol>
      </div>
    </StepCard>
  );
}

function BeatField({
  id,
  label,
  value,
  onChange,
  rows = 2,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Textarea
        id={id}
        rows={rows}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
