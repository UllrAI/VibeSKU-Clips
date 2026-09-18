"use client";

import { useState, useTransition } from "react";
import { Loader2, Plus, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { actionMessageKey } from "@/components/ugc/action-message";
import { useTranslation } from "@/lib/i18n/translation/client";
import {
  BLUEPRINT_BEAT_ROLES,
  BLUEPRINT_FORMATS,
  type CloneBlueprint,
} from "@/lib/ugc/types";
import { saveReferenceBlueprint } from "@/lib/ugc/reference-actions";

/** Editing a list of short statements, which `preserve` and `redesign` both are. */
function StatementList({
  label,
  values,
  onChange,
  addLabel,
  removeLabel,
  max,
}: {
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
  addLabel: string;
  removeLabel: string;
  max: number;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{label}</p>
      {values.map((value, index) => (
        <div key={index} className="flex items-start gap-2">
          <Input
            value={value}
            onChange={(event) =>
              onChange(
                values.map((item, at) =>
                  at === index ? event.target.value : item,
                ),
              )
            }
          />
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            className="mt-0.5"
            onClick={() => onChange(values.filter((_, at) => at !== index))}
            aria-label={removeLabel}
          >
            <X />
          </Button>
        </div>
      ))}
      {values.length < max && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onChange([...values, ""])}
        >
          <Plus />
          {addLabel}
        </Button>
      )}
    </div>
  );
}

/**
 * Correcting a reading.
 *
 * Everything the model claimed can be reworded or dropped, because the video
 * is the evidence for it. Nothing can be added that the reading did not find:
 * a beat invented here would carry no moment to jump back to, and a clone
 * built on it would be built on nothing. What the operator wants *instead* of
 * the original's material belongs to the clip, not to this reading.
 */
export function BlueprintEditor({
  referenceId,
  blueprint,
  onDone,
}: {
  referenceId: string;
  blueprint: CloneBlueprint;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<CloneBlueprint>(blueprint);
  const [pending, startTransition] = useTransition();

  const updateBeat = (
    index: number,
    patch: Partial<CloneBlueprint["beats"][number]>,
  ) =>
    setDraft((current) => ({
      ...current,
      beats: current.beats.map((beat, at) =>
        at === index ? { ...beat, ...patch } : beat,
      ),
    }));

  const save = () =>
    startTransition(async () => {
      const result = await saveReferenceBlueprint(referenceId, {
        ...draft,
        preserve: draft.preserve.map((item) => item.trim()).filter(Boolean),
        redesign: draft.redesign.map((item) => item.trim()).filter(Boolean),
      });
      if (!result.ok) {
        toast.error(t(actionMessageKey(result.code)));
        return;
      }
      toast.success(t("ugc_blueprint_saved"));
      onDone();
    });

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-3 pt-6">
          <div className="space-y-2">
            <Label htmlFor="blueprint-format">
              {t("ugc_blueprint_format_label")}
            </Label>
            <Select
              value={draft.format}
              onValueChange={(value) =>
                setDraft({
                  ...draft,
                  format: value as CloneBlueprint["format"],
                })
              }
            >
              <SelectTrigger id="blueprint-format" className="w-full sm:w-72">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BLUEPRINT_FORMATS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {t(`ugc_blueprint_format_${option}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="blueprint-hook">{t("ugc_blueprint_hook")}</Label>
            <Textarea
              id="blueprint-hook"
              value={draft.hook}
              onChange={(event) =>
                setDraft({ ...draft, hook: event.target.value })
              }
              rows={2}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="blueprint-why">{t("ugc_blueprint_why")}</Label>
            <Textarea
              id="blueprint-why"
              value={draft.whyItWorks}
              onChange={(event) =>
                setDraft({ ...draft, whyItWorks: event.target.value })
              }
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      <div className="space-y-2">
        <h2 className="text-sm font-medium">
          {t("ugc_blueprint_beats_title")}
        </h2>
        <ul className="space-y-2">
          {draft.beats.map((beat, index) => (
            <li key={index}>
              <Card className="gap-2 py-3">
                <CardContent className="space-y-2 px-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Select
                      value={beat.role}
                      onValueChange={(value) =>
                        updateBeat(index, {
                          role: value as CloneBlueprint["beats"][number]["role"],
                        })
                      }
                    >
                      <SelectTrigger className="w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {BLUEPRINT_BEAT_ROLES.map((option) => (
                          <SelectItem key={option} value={option}>
                            {t(`ugc_blueprint_role_${option}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <span className="text-muted-foreground text-xs">
                      {beat.sourceStart.toFixed(1)}s
                    </span>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      className="ml-auto"
                      disabled={draft.beats.length <= 1}
                      onClick={() =>
                        setDraft({
                          ...draft,
                          beats: draft.beats.filter((_, at) => at !== index),
                        })
                      }
                      aria-label={t("ugc_blueprint_beat_remove")}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                  <Textarea
                    value={beat.purpose}
                    onChange={(event) =>
                      updateBeat(index, { purpose: event.target.value })
                    }
                    rows={2}
                    aria-label={t("ugc_blueprint_beat_purpose")}
                  />
                  <Input
                    value={beat.spokenGist}
                    onChange={(event) =>
                      updateBeat(index, { spokenGist: event.target.value })
                    }
                    placeholder={t("ugc_blueprint_beat_gist")}
                    aria-label={t("ugc_blueprint_beat_gist")}
                  />
                  {beat.events.map((event, eventIndex) => (
                    <div
                      key={eventIndex}
                      className="flex items-start gap-2 pl-4"
                    >
                      <Input
                        value={event.purpose}
                        onChange={(changed) =>
                          updateBeat(index, {
                            events: beat.events.map((item, at) =>
                              at === eventIndex
                                ? { ...item, purpose: changed.target.value }
                                : item,
                            ),
                          })
                        }
                        aria-label={t(`ugc_blueprint_event_${event.kind}`)}
                      />
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        className="mt-0.5"
                        onClick={() =>
                          updateBeat(index, {
                            events: beat.events.filter(
                              (_, at) => at !== eventIndex,
                            ),
                          })
                        }
                        aria-label={t("ugc_blueprint_event_remove")}
                      >
                        <X />
                      </Button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="gap-2 py-3">
          <CardContent className="px-3">
            <StatementList
              label={t("ugc_blueprint_preserve")}
              values={draft.preserve}
              onChange={(preserve) => setDraft({ ...draft, preserve })}
              addLabel={t("ugc_blueprint_add_line")}
              removeLabel={t("ugc_blueprint_remove_line")}
              max={8}
            />
          </CardContent>
        </Card>
        <Card className="gap-2 py-3">
          <CardContent className="px-3">
            <StatementList
              label={t("ugc_blueprint_redesign")}
              values={draft.redesign}
              onChange={(redesign) => setDraft({ ...draft, redesign })}
              addLabel={t("ugc_blueprint_add_line")}
              removeLabel={t("ugc_blueprint_remove_line")}
              max={8}
            />
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onDone} disabled={pending}>
          {t("ugc_common_cancel")}
        </Button>
        <Button onClick={save} disabled={pending}>
          {pending ? (
            <Loader2
              className="animate-spin motion-reduce:animate-none"
              aria-hidden
            />
          ) : (
            <Save aria-hidden />
          )}
          {t("ugc_blueprint_save")}
        </Button>
      </div>
    </div>
  );
}
