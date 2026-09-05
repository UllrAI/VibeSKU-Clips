"use client";

import { Image as ImageIcon, ShieldCheck, Store, Video } from "lucide-react";
import { LuPalette, LuUpload } from "react-icons/lu";

import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/lib/i18n";
import { useBrandStore } from "@/lib/stores/brand-store";

// watermark position options (labelKey is rendered per language inside the component)
const WATERMARK_POSITIONS = [
  { value: "top-left" as const, labelKey: "brandPositionTopLeft" },
  { value: "top-right" as const, labelKey: "brandPositionTopRight" },
  { value: "bottom-left" as const, labelKey: "brandPositionBottomLeft" },
  { value: "bottom-right" as const, labelKey: "brandPositionBottomRight" },
] as const;

export function BrandSettings() {
  const t = useT("settings");
  const { brand, updateBrand, updateWatermark } = useBrandStore();

  return (
    <div className="space-y-6">
      {/* shop basic info */}
      <Card className="surface-panel">
        <CardContent className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Store className="size-4" />
            </div>
            <h3 className="font-semibold text-sm">{t("brandShopTitle")}</h3>
          </div>

          <div className="grid gap-4">
            {/* shop name */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{t("brandNameLabel")}</Label>
              <Input
                value={brand.name}
                onChange={(e) => updateBrand({ name: e.target.value })}
                placeholder={t("brandNamePlaceholder")}
                className="text-sm"
              />
            </div>

            {/* Logo upload area */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Logo</Label>
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted/30 overflow-hidden">
                  {brand.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- user-selected local preview
                    <img
                      src={brand.logoUrl}
                      alt={t("brandLogoAlt")}
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <ImageIcon className="size-6 text-muted-foreground/50" />
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      aria-label={t("brandUploadLogo")}
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          // convert the selected image to a Data URL for storage
                          const reader = new FileReader();
                          reader.onload = (ev) => {
                            updateBrand({ logoUrl: ev.target?.result as string });
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                    />
                    <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent transition-colors">
                      <LuUpload className="w-3 h-3" />
                      {t("brandUploadLogo")}
                    </span>
                  </label>
                  {brand.logoUrl && (
                    <button
                      onClick={() => updateBrand({ logoUrl: undefined })}
                      className="text-xs text-destructive hover:underline text-left"
                    >
                      {t("brandRemove")}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* brand color settings */}
      <Card className="surface-panel">
        <CardContent className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-600 text-white">
              <LuPalette className="w-4 h-4" />
            </div>
            <h3 className="font-semibold text-sm">{t("brandColorTitle")}</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* primary color */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{t("brandPrimaryColor")}</Label>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <input
                    type="color"
                    aria-label={t("brandPrimaryColor")}
                    value={brand.primaryColor}
                    onChange={(e) => updateBrand({ primaryColor: e.target.value })}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <div
                    className="h-9 w-9 rounded-lg border border-border"
                    style={{ backgroundColor: brand.primaryColor }}
                  />
                </div>
                <Input
                  aria-label={t("brandPrimaryColor")}
                  value={brand.primaryColor}
                  onChange={(e) => updateBrand({ primaryColor: e.target.value })}
                  className="font-mono text-xs uppercase flex-1"
                  maxLength={7}
                />
              </div>
            </div>

            {/* secondary color */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{t("brandSecondaryColor")}</Label>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <input
                    type="color"
                    aria-label={t("brandSecondaryColor")}
                    value={brand.secondaryColor}
                    onChange={(e) => updateBrand({ secondaryColor: e.target.value })}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <div
                    className="h-9 w-9 rounded-lg border border-border"
                    style={{ backgroundColor: brand.secondaryColor }}
                  />
                </div>
                <Input
                  aria-label={t("brandSecondaryColor")}
                  value={brand.secondaryColor}
                  onChange={(e) => updateBrand({ secondaryColor: e.target.value })}
                  className="font-mono text-xs uppercase flex-1"
                  maxLength={7}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* watermark settings */}
      <Card className="surface-panel">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-warning text-primary-foreground">
                <ShieldCheck className="size-4" />
              </div>
              <h3 className="font-semibold text-sm">{t("brandWatermarkTitle")}</h3>
            </div>
            <Switch
              aria-label={t("toggleWatermark")}
              checked={brand.watermark.enabled}
              onCheckedChange={(enabled) => updateWatermark({ enabled })}
            />
          </div>

          {brand.watermark.enabled && (
            <div className="space-y-4 pt-2">
              {/* watermark position */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">{t("brandWatermarkPosition")}</Label>
                <div className="grid grid-cols-4 gap-2">
                  {WATERMARK_POSITIONS.map((pos) => (
                    <button
                      key={pos.value}
                      onClick={() => updateWatermark({ position: pos.value })}
                      className={`h-9 rounded-lg border text-xs font-medium transition-colors ${
                        brand.watermark.position === pos.value
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-background hover:bg-accent text-muted-foreground"
                      }`}
                    >
                      {t(pos.labelKey)}
                    </button>
                  ))}
                </div>
              </div>

              {/* opacity */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">{t("brandWatermarkOpacity")}</Label>
                  <span className="text-xs text-muted-foreground font-mono">
                    {Math.round(brand.watermark.opacity * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  aria-label={t("brandWatermarkOpacity")}
                  min="10"
                  max="100"
                  step="5"
                  value={Math.round(brand.watermark.opacity * 100)}
                  onChange={(e) =>
                    updateWatermark({ opacity: Number(e.target.value) / 100 })
                  }
                  className="w-full h-1.5 bg-muted rounded-full appearance-none cursor-pointer accent-primary"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground/50">
                  <span>10%</span>
                  <span>100%</span>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* outro settings */}
      <Card className="surface-panel">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-white">
                <Video className="size-4" />
              </div>
              <h3 className="font-semibold text-sm">{t("brandOutroTitle")}</h3>
            </div>
            <Switch
              aria-label={t("toggleOutro")}
              checked={brand.outroEnabled}
              onCheckedChange={(enabled) => updateBrand({ outroEnabled: enabled })}
            />
          </div>

          {brand.outroEnabled && (
            <div className="space-y-1.5 pt-2">
              <Label className="text-xs text-muted-foreground">{t("brandOutroTextLabel")}</Label>
              <Textarea
                value={brand.outroText ?? ""}
                onChange={(e) => updateBrand({ outroText: e.target.value })}
                placeholder={t("brandOutroTextPlaceholder")}
                rows={2}
                className="text-sm resize-none"
              />
              <p className="text-[11px] text-muted-foreground/60">
                {t("brandOutroTip")}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
