"use client";

import Link from "next/link";
import { Clapperboard, Gauge, Sparkles, Zap } from "lucide-react";
import { useT } from "@/lib/i18n";
import { PRODUCTION_PROFILE_IDS, PRODUCTION_PROFILES, type ProductionProfileId } from "@/lib/production-profiles";
import { isMediaReady, useSettingsStore } from "@/lib/stores/settings-store";

const ICONS = {
  rapid: Zap,
  balanced: Sparkles,
  cinematic: Clapperboard,
} satisfies Record<ProductionProfileId, typeof Zap>;

function Meter({ value, label }: { value: 1 | 2 | 3; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground" aria-label={`${label} ${value}/3`}>
      <span>{label}</span>
      <span className="flex gap-0.5" aria-hidden="true">
        {[1, 2, 3].map((level) => (
          <i key={level} className={`h-1.5 w-2.5 rounded-full ${level <= value ? "bg-primary" : "bg-muted"}`} />
        ))}
      </span>
    </span>
  );
}

export function ProductionProfilePicker() {
  const t = useT("start");
  const { activeProductionProfile, applyProductionProfile, llm, media, defaultImageModel, defaultVideoModel } = useSettingsStore();
  // The models always have a value (the catalog ships defaults), so what can actually be missing
  // is the credential pair that lets either of them run.
  const incomplete = !isMediaReady(media);
  const pipeline = [
    { key: "profileStageScript", value: llm.model || t("profileAutoModel") },
    { key: "profileStageFrame", value: incomplete ? t("profileNeedsSetup") : defaultImageModel },
    { key: "profileStageMotion", value: incomplete ? t("profileNeedsSetup") : defaultVideoModel },
    { key: "profileStageCompose", value: t("profileLocalCompose") },
  ];

  return (
    <section className="mt-3 border-t border-border pt-3" aria-labelledby="production-profile-title">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div id="production-profile-title" className="flex items-center gap-2 text-xs font-semibold text-foreground">
            <Gauge className="size-3.5 text-primary" aria-hidden="true" />
            {t("profileTitle")}
            <span className="rounded-full bg-primary/12 px-2 py-0.5 text-[10px] font-medium text-primary">{t("profileSmartBadge")}</span>
          </div>
          <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{t("profileDescription")}</p>
        </div>
        <Link href="/settings?tab=generation" className="inline-flex min-h-6 shrink-0 items-center text-[11px] text-primary hover:underline">
          {t("profileFineTune")}
        </Link>
      </div>

      <div className="grid gap-1.5" role="radiogroup" aria-label={t("profileTitle")}>
        {PRODUCTION_PROFILE_IDS.map((id) => {
          const profile = PRODUCTION_PROFILES[id];
          const Icon = ICONS[id];
          const selected = activeProductionProfile === id;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => applyProductionProfile(id)}
              className={`rounded-lg border p-2.5 text-left transition-[border-color,background-color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 ${
                selected
                  ? "border-primary/70 bg-primary/10 outline-1 outline-primary/25"
                  : "border-border bg-background hover:border-primary/35 hover:bg-accent"
              }`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-xs font-semibold text-foreground">
                  <span className={`grid size-7 place-items-center rounded-lg ${selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                    <Icon className="size-3.5" aria-hidden="true" />
                  </span>
                  {t(`profile_${id}_name`)}
                </span>
                {selected && <span className="text-[10px] font-medium text-primary">{t("profileSelected")}</span>}
              </span>
              <span className="mt-1.5 block text-[11px] leading-4 text-muted-foreground">{t(`profile_${id}_desc`)}</span>
              <span className="mt-2 flex flex-wrap gap-x-2.5 gap-y-1">
                <Meter value={profile.speed} label={t("profileSpeed")} />
                <Meter value={profile.quality} label={t("profileQuality")} />
                <Meter value={profile.cost} label={t("profileCost")} />
              </span>
              <span className="mt-2 block text-[10px] text-foreground/65">
                {profile.resolution} · {t("profileShotDuration", { seconds: profile.duration })} · {t(`profileChain_${profile.chainMode}`)}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-stretch gap-1.5" aria-label={t("profilePipelineLabel")}>
        {pipeline.map((stage, index) => (
          <div key={stage.key} className="contents">
            <div className="min-w-0 flex-1 basis-28 rounded-lg border border-border bg-background px-2.5 py-2">
              <div className="text-[10px] text-muted-foreground">{index + 1}. {t(stage.key)}</div>
              <div className="mt-0.5 truncate text-[11px] font-medium text-foreground" title={stage.value}>{stage.value}</div>
            </div>
            {index < pipeline.length - 1 && <span className="self-center text-xs text-muted-foreground/50" aria-hidden="true">→</span>}
          </div>
        ))}
      </div>

      {incomplete && (
        <p className="mt-2.5 text-[11px] text-warning/90">
          {t("profileModelWarning")} <Link href="/settings?tab=connect" className="inline-flex min-h-6 items-center font-medium underline underline-offset-2">{t("profileConfigure")}</Link>
        </p>
      )}
    </section>
  );
}
