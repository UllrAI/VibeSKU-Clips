"use client";

import { useState, useTransition } from "react";
import { ArrowLeft, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { actionMessageKey } from "@/components/ugc/action-message";
import { useTranslation } from "@/lib/i18n/translation/client";
import {
  reopenWorkStep,
  saveWorkScript,
  startWorkStoryboard,
} from "@/lib/ugc/work-actions";
import type { ScriptRow } from "@/lib/ugc/queries";
import { StepCard } from "./step-card";

/**
 * The script the operator signs off on. Everything downstream is generated
 * from these words, so this is the cheapest place to change the clip — and it
 * is editable in place rather than behind a "request changes" round trip.
 */
export function ScriptStep({
  workId,
  script,
  onRefresh,
}: {
  workId: string;
  script: ScriptRow;
  onRefresh: () => void;
}) {
  const { t } = useTranslation();
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState(script.title);
  const [hook, setHook] = useState(script.hook);
  const [voiceover, setVoiceover] = useState(script.voiceover);
  const [captions, setCaptions] = useState(script.captions.join("\n"));

  const dirty =
    title !== script.title ||
    hook !== script.hook ||
    voiceover !== script.voiceover ||
    captions !== script.captions.join("\n");

  const persist = async () =>
    saveWorkScript(workId, {
      title: title.trim(),
      hook: hook.trim(),
      voiceover: voiceover.trim(),
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
      const started = await startWorkStoryboard(workId);
      if (!started.ok) {
        toast.error(t(actionMessageKey(started.code)));
        return;
      }
      toast.success(t("ugc_work_storyboard_started"));
      onRefresh();
    });

  return (
    <StepCard
      title={t("ugc_work_step_script")}
      description={t("ugc_work_script_hint")}
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
          {t("ugc_work_confirm_script")}
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

      <div className="space-y-2">
        <Label htmlFor="work-script-voiceover">
          {t("ugc_script_voiceover")}
        </Label>
        <Textarea
          id="work-script-voiceover"
          rows={4}
          value={voiceover}
          onChange={(event) => setVoiceover(event.target.value)}
        />
      </div>

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
          {t("ugc_work_beats_hint")}
        </p>
        <ol className="divide-border border-border divide-y rounded-lg border">
          {script.beats.map((beat) => (
            <li key={beat.start} className="flex gap-3 px-3 py-2.5 text-sm">
              <Badge
                variant="secondary"
                className="h-5 shrink-0 font-normal tabular-nums"
                translate="no"
              >
                {beat.start}–{beat.end}s
              </Badge>
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="text-muted-foreground text-xs">{beat.shot}</p>
                <p>{beat.action}</p>
                {beat.voiceover && (
                  <p className="text-muted-foreground italic">
                    “{beat.voiceover}”
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </StepCard>
  );
}
