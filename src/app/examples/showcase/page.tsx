"use client";

import Link from "next/link";
import { LuMic, LuPlus } from "react-icons/lu";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getExampleShowcase, getExampleTemplates } from "@/lib/examples";
import type { Shot } from "@/lib/db/schema";
import { useT, useLocale } from "@/lib/i18n";
import { PageContainer, PageHeader } from "@/components/page-layout";

// Shot type labels (label uses a showcase-namespace i18n key, resolved per language)
const shotTypeLabels: Record<Shot["type"], { labelKey: string; color: string }> = {
  hook: { labelKey: "shotTypeHook", color: "bg-red-500/15 text-red-700 dark:text-red-300" },
  pain_point: { labelKey: "shotTypePainPoint", color: "bg-orange-500/15 text-orange-700 dark:text-orange-300" },
  product_reveal: { labelKey: "shotTypeProductReveal", color: "bg-primary/15 text-primary" },
  demo: { labelKey: "shotTypeDemo", color: "bg-green-500/20 text-green-400" },
  social_proof: { labelKey: "shotTypeSocialProof", color: "bg-rose-500/15 text-rose-600 dark:text-rose-300" },
  cta: { labelKey: "shotTypeCta", color: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
};

export default function ShowcasePage() {
  const t = useT("showcase");
  const locale = useLocale();
  const sc = getExampleShowcase(locale);

  return (
    <div className="min-h-screen page-canvas">
      <PageContainer width="standard">
        <PageHeader
          title={sc.title}
          description={<>
            {t("introLead")}{t("introMeta", { style: sc.styleLabel, shots: sc.shots.length, duration: sc.totalDuration, resolution: sc.resolution, aspectRatio: sc.aspectRatio })}
            {t("introTail")}
          </>}
          actions={<Button render={<Link href="/project/new" />}><LuPlus className="h-4 w-4" />{t("makeSimilar")}</Button>}
        />

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-5 lg:gap-10">
          {/* Left: finished video preview */}
          <div className="lg:col-span-2">
            <Card className="surface-panel overflow-hidden lg:sticky lg:top-8">
              <CardContent className="p-0">
                <div className="relative aspect-[9/16] bg-black flex items-center justify-center">
                  <video
                    src={sc.videoUrl}
                    poster={sc.cover}
                    controls
                    playsInline
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="px-4 py-3 border-t border-border/30 flex items-center gap-3 text-xs text-muted-foreground">
                  <span>{sc.resolution}</span>
                  <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
                  <span>{sc.aspectRatio}</span>
                  <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
                  <span>{sc.totalDuration}s</span>
                  <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
                  <span>MP4</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right: shot-by-shot script */}
          <div className="lg:col-span-3">
            <h2 className="text-base font-semibold mb-4">{t("scriptTitle")}</h2>
            <ol className="divide-y divide-border border-y border-border">
              {sc.shots.map((shot, idx) => {
                // Pure cumulative time calculation — avoids mutating outer variables during render
                const start = sc.shots.slice(0, idx).reduce((s, sh) => s + sh.duration, 0);
                const end = start + shot.duration;
                const meta = shotTypeLabels[shot.type];
                return (
                  <li key={shot.shotId} className="py-4 first:pt-0 last:pb-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-mono text-muted-foreground">{String(idx + 1).padStart(2, "0")}</span>
                      <Badge className={`${meta.color} border-0 text-[10px]`}>{t(meta.labelKey)}</Badge>
                      <Badge variant="outline" className="text-[10px] font-mono">{start}-{end}s</Badge>
                      <span className="text-xs text-muted-foreground ml-auto">{shot.camera}</span>
                    </div>
                    <p className="text-sm mb-1">{shot.description}</p>
                    {shot.voiceover && (
                      <p className="flex items-start gap-1.5 text-xs text-muted-foreground"><LuMic className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />{shot.voiceover}</p>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>
        </div>

        {/* Reference script structures */}
        <div className="mt-12">
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-base font-semibold">{t("templatesTitle")}</h2>
            <Badge variant="secondary" className="text-[10px]">{t("templatesBadge")}</Badge>
          </div>
          <p className="text-xs text-muted-foreground mb-4">{t("templatesDesc")}</p>
          <div className="grid grid-cols-1 divide-y divide-border border-y border-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {getExampleTemplates(locale).map((tpl) => (
              <div key={tpl.id} className="py-4 sm:px-4 sm:first:pl-0 sm:last:pr-0">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-medium">{tpl.name}</h3>
                    <Badge variant="secondary" className="text-[10px]">{tpl.styleLabel}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3 leading-relaxed">{tpl.description}</p>
                  <div className="flex flex-wrap gap-1">
                    {tpl.shots.map((s) => (
                      <Badge key={s.shotId} className={`${shotTypeLabels[s.type].color} border-0 text-[10px]`}>
                        {t(shotTypeLabels[s.type].labelKey)}
                      </Badge>
                    ))}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-2">{t("templateShotsMeta", { shots: tpl.shots.length, duration: tpl.totalDuration })}</p>
              </div>
            ))}
          </div>
        </div>
      </PageContainer>
    </div>
  );
}
