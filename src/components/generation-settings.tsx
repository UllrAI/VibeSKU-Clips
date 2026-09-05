"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useT } from "@/lib/i18n";
import { useSettingsStore } from "@/lib/stores/settings-store";
import { ASPECT_RATIO_OPTIONS, RESOLUTION_OPTIONS } from "@/lib/gen-params";

const labelOf = (options: { value: string; label: string }[], value: string) =>
  options.find((option) => option.value === value)?.label ?? value;

/** Numeric input where empty means "unset" rather than zero. */
function NumberField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        aria-label={label}
        type="number"
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value === "" ? undefined : Number(event.target.value))}
        placeholder={placeholder}
        className="font-mono text-xs"
      />
    </div>
  );
}

/**
 * Global generation defaults.
 *
 * Every field here is one Prism actually reads. The card used to also let users mount an
 * arbitrary model id on an arbitrary platform; with a single gateway and a closed catalog that
 * only produced a 422 at generation time, so model choice now lives in the model picker where
 * the options are real.
 */
export function GenerationSettings() {
  const t = useT("generationSettings");
  const { imageParams, videoParams, setImageParams, setVideoParams } = useSettingsStore();

  const aspectKey: Record<string, string> = { "9:16": "aspect916", "16:9": "aspect169", "1:1": "aspect11" };
  const aspectOptions = ASPECT_RATIO_OPTIONS.map((option) => ({
    value: option.value,
    label: t(aspectKey[option.value] ?? option.value),
  }));

  return (
    <Card className="surface-panel">
      <CardContent className="space-y-5 p-5">
        <div>
          <h3 className="text-sm font-semibold">{t("genParamsTitle")}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{t("genParamsDesc")}</p>
        </div>

        <div className="space-y-3">
          <p className="text-xs font-medium">{t("imageSection")}</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{t("aspectRatio")}</Label>
              <Select
                value={imageParams.aspectRatio}
                onValueChange={(value) =>
                  setImageParams({ ...imageParams, aspectRatio: (value ?? "9:16") as typeof imageParams.aspectRatio })
                }
              >
                <SelectTrigger aria-label={t("aspectRatio")} className="w-full">
                  <SelectValue>{(value: string) => labelOf(aspectOptions, value)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {aspectOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <NumberField
              label={t("count")}
              value={imageParams.count}
              onChange={(value) => setImageParams({ ...imageParams, count: value ?? 1 })}
              placeholder="1"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t("negativePrompt")}</Label>
            <Textarea
              aria-label={t("negativePrompt")}
              value={imageParams.negativePrompt ?? ""}
              onChange={(event) =>
                setImageParams({ ...imageParams, negativePrompt: event.target.value || undefined })
              }
              rows={2}
              placeholder={t("imageNegativePlaceholder")}
              className="resize-none text-xs"
            />
          </div>
        </div>

        <div className="space-y-3 border-t border-border/50 pt-2">
          <p className="text-xs font-medium">{t("videoSection")}</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{t("aspectRatio")}</Label>
              <Select
                value={videoParams.aspectRatio}
                onValueChange={(value) =>
                  setVideoParams({ ...videoParams, aspectRatio: (value ?? "9:16") as typeof videoParams.aspectRatio })
                }
              >
                <SelectTrigger aria-label={t("aspectRatio")} className="w-full">
                  <SelectValue>{(value: string) => labelOf(aspectOptions, value)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {aspectOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{t("resolution")}</Label>
              <Select
                value={videoParams.resolution}
                onValueChange={(value) =>
                  setVideoParams({ ...videoParams, resolution: (value ?? "720p") as typeof videoParams.resolution })
                }
              >
                <SelectTrigger aria-label={t("resolution")} className="w-full">
                  <SelectValue>{(value: string) => labelOf(RESOLUTION_OPTIONS, value)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {RESOLUTION_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <NumberField
              label={t("duration")}
              value={videoParams.duration}
              onChange={(value) => setVideoParams({ ...videoParams, duration: value })}
              placeholder="6"
            />
            <NumberField
              label={t("seed")}
              value={videoParams.seed}
              onChange={(value) => setVideoParams({ ...videoParams, seed: value })}
              placeholder={t("seedPlaceholder")}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t("negativePrompt")}</Label>
            <Textarea
              aria-label={t("negativePrompt")}
              value={videoParams.negativePrompt ?? ""}
              onChange={(event) =>
                setVideoParams({ ...videoParams, negativePrompt: event.target.value || undefined })
              }
              rows={2}
              placeholder={t("videoNegativePlaceholder")}
              className="resize-none text-xs"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
