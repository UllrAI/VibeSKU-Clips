"use client";

import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useTranslation } from "@/lib/i18n/translation/client";
import type { EditableScript, ScriptBeat } from "@/lib/ugc/types";

export function ScriptEditor({
  idPrefix,
  value,
  onChange,
  videoMode,
  compact = false,
}: {
  idPrefix: string;
  value: EditableScript;
  onChange: (value: EditableScript) => void;
  videoMode: "one_take" | "storyboard";
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const updateBeat = <Key extends keyof ScriptBeat>(
    index: number,
    key: Key,
    next: ScriptBeat[Key],
  ) =>
    onChange({
      ...value,
      beats: value.beats.map((beat, position) =>
        position === index ? { ...beat, [key]: next } : beat,
      ),
    });

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-title`}>{t("ugc_script_title")}</Label>
          <Input
            id={`${idPrefix}-title`}
            value={value.title}
            onChange={(event) =>
              onChange({ ...value, title: event.target.value })
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-hook`}>{t("ugc_script_hook")}</Label>
          <Input
            id={`${idPrefix}-hook`}
            value={value.hook}
            onChange={(event) =>
              onChange({ ...value, hook: event.target.value })
            }
          />
        </div>
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
          {value.beats.map((beat, index) => (
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
                  id={`${idPrefix}-beat-${index}-shot`}
                  label={t("ugc_script_beat_shot")}
                  value={beat.shot}
                  onChange={(next) => updateBeat(index, "shot", next)}
                />
                <BeatField
                  id={`${idPrefix}-beat-${index}-camera`}
                  label={t("ugc_script_beat_camera")}
                  value={beat.camera ?? ""}
                  onChange={(next) => updateBeat(index, "camera", next)}
                />
                <BeatField
                  id={`${idPrefix}-beat-${index}-action`}
                  label={t("ugc_script_beat_visual")}
                  value={beat.action}
                  onChange={(next) => updateBeat(index, "action", next)}
                  rows={compact ? 3 : 4}
                />
                <BeatField
                  id={`${idPrefix}-beat-${index}-voiceover`}
                  label={t("ugc_script_beat_dialogue")}
                  value={beat.voiceover}
                  onChange={(next) => updateBeat(index, "voiceover", next)}
                  rows={compact ? 3 : 4}
                />
              </div>
            </li>
          ))}
        </ol>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-captions`}>
          {t("ugc_script_captions")}
        </Label>
        <Textarea
          id={`${idPrefix}-captions`}
          rows={3}
          value={value.captions}
          onChange={(event) =>
            onChange({ ...value, captions: event.target.value })
          }
          placeholder={t("ugc_brief_one_per_line")}
        />
      </div>

      <Collapsible
        defaultOpen={!compact}
        className="border-border rounded-lg border"
      >
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
            id={`${idPrefix}-production-prompt`}
            rows={compact ? 12 : 18}
            value={value.productionPrompt}
            onChange={(event) =>
              onChange({ ...value, productionPrompt: event.target.value })
            }
          />
        </CollapsibleContent>
      </Collapsible>
    </div>
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
