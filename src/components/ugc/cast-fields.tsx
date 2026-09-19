"use client";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTranslation } from "@/lib/i18n/translation/client";
import type { SceneRow, TalentRow } from "@/lib/ugc/queries";

/** Sentinel values, because a Radix select item cannot carry an empty value. */
export const NO_TALENT = "none";
export const RANDOM_TALENT = "random";
export const NO_SCENE = "none";

/**
 * Who performs and where it is filmed. Both questions are asked in the
 * composer and again on the product step, so they live here rather than in two
 * copies that drift apart.
 */
export function TalentField({
  id,
  value,
  onChange,
  talents,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  talents: TalentRow[];
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{t("ugc_plan_talents")}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_TALENT}>{t("ugc_work_no_talent")}</SelectItem>
          <SelectItem value={RANDOM_TALENT}>
            {t("ugc_work_random_talent")}
          </SelectItem>
          {talents.map((talent) => (
            <SelectItem key={talent.id} value={talent.id}>
              {talent.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {value === RANDOM_TALENT && (
        <p className="text-muted-foreground text-xs">
          {t("ugc_work_random_talent_hint")}
        </p>
      )}
    </div>
  );
}

export function SceneField({
  id,
  value,
  onChange,
  scenes,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  scenes: SceneRow[];
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{t("ugc_plan_scene")}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_SCENE}>{t("ugc_work_no_scene")}</SelectItem>
          {scenes.map((scene) => (
            <SelectItem key={scene.id} value={scene.id}>
              {scene.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-muted-foreground text-xs">
        {t(
          value === NO_SCENE ? "ugc_work_no_scene_hint" : "ugc_work_scene_hint",
        )}
      </p>
    </div>
  );
}

/** Only a finished talent or scene can anchor a clip. */
export function selectableTalents(talents: TalentRow[]): TalentRow[] {
  return talents.filter(
    (talent) => talent.status === "ready" && talent.imageUrl,
  );
}

export function selectableScenes(scenes: SceneRow[]): SceneRow[] {
  return scenes.filter(
    (scene) => scene.status === "ready" && scene.views.length > 0,
  );
}
