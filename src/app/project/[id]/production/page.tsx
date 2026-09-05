"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  LuActivity,
  LuArrowLeft,
  LuBadgeDollarSign,
  LuBrainCircuit,
  LuCheck,
  LuChevronDown,
  LuCircleAlert,
  LuClock3,
  LuFilm,
  LuGitBranch,
  LuLoaderCircle,
  LuRefreshCw,
  LuRoute,
  LuSave,
  LuScanSearch,
  LuScissors,
  LuShieldCheck,
  LuSlidersHorizontal,
  LuSparkles,
  LuTags,
  LuThumbsDown,
  LuThumbsUp,
  LuWandSparkles,
} from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { MasteringPanel } from "@/components/mastering-panel";
import { VideoRepairPanel } from "@/components/video-repair-panel";
import { useLocale, useT } from "@/lib/i18n";
import { getVideoModelCapabilities } from "@/lib/model-capabilities";
import {
  buildPreviewPlan,
  buildWorkflowPlan,
  diagnoseGenerationFailure,
  estimateProduction,
  repairPlanFromQc,
  routeModel,
  type CreativeIntent,
  type ProjectMediaInsight,
  type ProductionSnapshot,
  type RepairAction,
  type RoutingGoal,
  type SemanticAsset,
  type VersionTree,
  type VisualBible,
  type WorkflowStageId,
  type WorkflowStagePlan,
} from "@/lib/production-system";
import { prismModels } from "@/lib/providers/prism-catalog";
import type { Model } from "@/lib/providers/types";
import { useSettingsStore } from "@/lib/stores/settings-store";
import type { QcReport } from "@/lib/video-composer/qc";
import type { GenerationControlSummary } from "@/lib/video-repair-plan";
import {
  rankQualityCandidates,
  type GenerationQualityReport,
  type QualityDisposition,
  type ShotQualityContract,
} from "@/lib/generation-quality";

interface ProductionOverview {
  project: { id: string; name: string; sourceVideoUrl?: string | null };
  workflow: WorkflowStagePlan[] | null;
  creativeIntent: CreativeIntent | null;
  visualBible: VisualBible | null;
  mediaInsights: ProjectMediaInsight[];
  snapshots: ProductionSnapshot[];
  semanticAssets: SemanticAsset[];
  versionTree: VersionTree;
  latestRun: { id: string; status: string; stage: string; error?: string | null } | null;
  latestComposition: { id: string; status: string; duration?: number | null; resolution?: "720p" | "1080p" | null; aspectRatio?: "9:16" | "16:9" | "1:1" | null } | null;
  latestFailure: { source: "task" | "pipeline"; id: string; stage: string; error: string } | null;
  selectedScript: { id: string; shotCount: number; totalDuration: number } | null;
  counts: { scripts: number; assets: number; clips: number; tasks: number; compositions: number };
}

interface QualityReview {
  id: string;
  assetId: string;
  shotId: number;
  contract: ShotQualityContract;
  report: GenerationQualityReport;
  disposition: QualityDisposition;
  evaluatorModel: string;
  verdict: "accept" | "review" | "reject";
  humanDecision: "accepted" | "rejected" | null;
  createdAt?: Date | string | null;
}

interface QualityCandidate {
  id: string;
  shotId: number;
  type: string;
  filePath?: string | null;
  thumbnailPath?: string | null;
  provider?: string | null;
  model?: string | null;
  prompt?: string | null;
  generationPlan?: GenerationControlSummary | null;
  selected: boolean;
  createdAt?: Date | string | null;
  latestReview: QualityReview | null;
}

interface ModelQualityStat {
  model: string;
  reviews: number;
  averageOverall: number;
  rejectionRate: number;
}

const EMPTY_BIBLE: VisualBible = {
  characterAnchors: [], productAnchors: [], wardrobeAnchors: [], environmentAnchors: [], lightingAnchors: [], forbiddenChanges: [],
};

const EMPTY_INTENT: CreativeIntent = { subject: "" };
const OPTIONAL_STAGES = new Set<WorkflowStageId>(["analyze", "motion", "voice", "qc", "release"]);

function splitList(value: string): string[] {
  return [...new Set(value.split(/[,，\n]/).map((item) => item.trim()).filter(Boolean))].slice(0, 12);
}

function priceOf(model: Model | undefined): number | undefined {
  const raw = Number(model?.extra?.priceBase);
  if (Number.isFinite(raw) && raw >= 0) return raw;
  const match = model?.description?.match(/\$\s*([\d.]+)/);
  const parsed = match ? Number(match[1]) : Number.NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function formatDate(value: Date | string | null | undefined, locale: "zh" | "en") {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

function Section({ title, hint, icon, children }: { title: string; hint?: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="min-w-0 rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary" aria-hidden="true">{icon}</span>
        <div className="min-w-0"><h2 className="font-semibold tracking-tight">{title}</h2>{hint && <p className="mt-1 text-xs leading-5 text-muted-foreground">{hint}</p>}</div>
      </div>
      {children}
    </section>
  );
}

export default function ProductionPage() {
  const { id } = useParams<{ id: string }>();
  const t = useT("production");
  const locale = useLocale();
  const { media, defaultImageModel, defaultVideoModel, chainMode, llm, setDefaultVideoModel } = useSettingsStore();
  const [overview, setOverview] = useState<ProductionOverview | null>(null);
  // The catalog is static, so there is nothing to fetch and nothing to fail.
  const models = useMemo(() => prismModels(), []);
  const [workflow, setWorkflow] = useState<WorkflowStagePlan[]>([]);
  const [bible, setBible] = useState<VisualBible>(EMPTY_BIBLE);
  const [intent, setIntent] = useState<CreativeIntent>(EMPTY_INTENT);
  const [goal, setGoal] = useState<RoutingGoal>("balanced");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"workflow" | "memory" | "snapshot" | "qc" | "repair" | null>(null);
  const [status, setStatus] = useState("");
  const [repairs, setRepairs] = useState<RepairAction[]>([]);
  const [qualityCandidates, setQualityCandidates] = useState<QualityCandidate[]>([]);
  const [modelQualityStats, setModelQualityStats] = useState<ModelQualityStat[]>([]);
  const [qualityBusy, setQualityBusy] = useState<string | null>(null);

  const loadQuality = useCallback(async () => {
    const response = await fetch(`/api/project/${id}/quality`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || t("qualityLoadFailed"));
    setQualityCandidates(Array.isArray(data.candidates) ? data.candidates : []);
    setModelQualityStats(Array.isArray(data.modelStats) ? data.modelStats : []);
  }, [id, t]);

  const loadOverview = useCallback(async () => {
    const response = await fetch(`/api/project/${id}/production`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || t("loadFailed"));
    const next = data as ProductionOverview;
    setOverview(next);
    const initialWorkflow = next.workflow?.length ? next.workflow : buildWorkflowPlan({
      hasSourceMedia: Boolean(next.project.sourceVideoUrl || next.mediaInsights.length),
      aiKeyframes: Boolean(defaultImageModel),
      aiMotion: Boolean(defaultVideoModel),
      nativeAudio: false,
    });
    setWorkflow(initialWorkflow);
    setBible(next.visualBible ?? EMPTY_BIBLE);
    setIntent(next.creativeIntent ?? { subject: next.project.name || "" });
  }, [defaultImageModel, defaultVideoModel, id, t]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        await Promise.all([loadOverview(), loadQuality()]);
      } catch (error) {
        if (!cancelled) setStatus(error instanceof Error ? error.message : t("loadFailed"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [loadOverview, loadQuality, t]);

  const videoModels = useMemo(() => models.filter((model) => model.mediaType === "video"), [models]);
  const routeDecision = useMemo(() => routeModel(videoModels.map((model) => {
    const capability = getVideoModelCapabilities(model.id);
    const id = model.id.toLowerCase();
    const observed = modelQualityStats.find((stat) => stat.model === model.id);
    return {
      id: model.id, name: model.name, modes: model.modes, supportsAudio: model.supportsAudio,
      supportsLastFrame: capability.lastFrame, pricePerCall: priceOf(model),
      quality: /pro|max|quality|master/.test(id) ? 3 : /lite|turbo|fast/.test(id) ? 1 : 2,
      speed: /lite|turbo|fast|flash/.test(id) ? 3 : /pro|max|quality/.test(id) ? 1 : 2,
      observedQuality: observed?.averageOverall,
      observedReviews: observed?.reviews,
      rejectionRate: observed?.rejectionRate,
    };
  }), { mode: "image-to-video", goal, requireLastFrame: chainMode !== "off" }), [chainMode, goal, modelQualityStats, videoModels]);

  const estimate = useMemo(() => estimateProduction({
    shotCount: overview?.selectedScript?.shotCount || Math.max(1, overview?.counts.assets || 1), workflow,
    imageUnitUsd: priceOf(models.find((model) => model.id === defaultImageModel)),
    videoUnitUsd: priceOf(models.find((model) => model.id === (routeDecision.selected?.id || defaultVideoModel))),
  }), [defaultImageModel, defaultVideoModel, models, overview, routeDecision.selected?.id, workflow]);

  const previewPlan = useMemo(() => buildPreviewPlan({ duration: overview?.selectedScript?.totalDuration || 15, hasGeneratedMotion: Boolean(overview?.counts.clips) }), [overview]);
  const diagnosis = overview?.latestFailure ? diagnoseGenerationFailure(overview.latestFailure.error) : null;
  const qualityGroups = useMemo(() => {
    const groups = new Map<number, QualityCandidate[]>();
    for (const candidate of qualityCandidates) groups.set(candidate.shotId, [...(groups.get(candidate.shotId) ?? []), candidate]);
    return [...groups.entries()].sort(([a], [b]) => a - b).map(([shotId, candidates]) => {
      const rankedIds = rankQualityCandidates(candidates.map((candidate) => ({
        id: candidate.id,
        selected: candidate.selected,
        report: candidate.latestReview?.report,
      }))).map((candidate) => candidate.id);
      const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
      return { shotId, candidates: rankedIds.map((candidateId) => byId.get(candidateId)!) };
    });
  }, [qualityCandidates]);
  const qualitySummary = useMemo(() => {
    const selected = qualityCandidates.filter((candidate) => candidate.selected);
    return {
      total: selected.length,
      reviewed: selected.filter((candidate) => candidate.latestReview).length,
      accepted: selected.filter((candidate) => candidate.latestReview?.humanDecision === "accepted" || (!candidate.latestReview?.humanDecision && candidate.latestReview?.verdict === "accept")).length,
      needsAttention: selected.filter((candidate) => candidate.latestReview?.humanDecision === "rejected" || (!candidate.latestReview?.humanDecision && (candidate.latestReview?.verdict === "review" || candidate.latestReview?.verdict === "reject"))).length,
    };
  }, [qualityCandidates]);

  const toggleWorkflowStage = (id: WorkflowStageId) => {
    if (!OPTIONAL_STAGES.has(id)) return;
    setWorkflow((current) => {
      const enabled = !(current.find((stage) => stage.id === id)?.enabled ?? true);
      let next = current.map((stage) => stage.id === id ? { ...stage, enabled } : stage);
      if (id === "qc" && !enabled) next = next.map((stage) => stage.id === "release" ? { ...stage, enabled: false } : stage);
      if (id === "release" && enabled) next = next.map((stage) => stage.id === "qc" ? { ...stage, enabled: true } : stage);
      if (id === "motion") {
        next = next.map((stage) => stage.id === "voice" ? { ...stage, dependsOn: enabled ? ["motion"] : ["keyframes"] } : stage);
      }
      const voiceEnabled = next.find((stage) => stage.id === "voice")?.enabled ?? false;
      const motionEnabled = next.find((stage) => stage.id === "motion")?.enabled ?? false;
      next = next.map((stage) => stage.id === "compose" ? { ...stage, dependsOn: voiceEnabled ? ["voice"] : motionEnabled ? ["motion"] : ["keyframes"] } : stage);
      return next;
    });
  };

  const patchProduction = async (payload: Record<string, unknown>, kind: typeof busy) => {
    setBusy(kind); setStatus("");
    try {
      const response = await fetch(`/api/project/${id}/production`, { method: "PATCH", headers: { "Content-Type": "application/json", "Accept-Language": locale }, body: JSON.stringify(payload) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || t("statusError"));
      setStatus(t("saved"));
      await loadOverview();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("statusError"));
    } finally { setBusy(null); }
  };

  const runQc = async () => {
    if (!overview?.latestComposition?.id) return;
    setBusy("qc"); setStatus(""); setRepairs([]);
    try {
      const response = await fetch(`/api/project/${id}/qc`, { method: "POST", headers: { "Content-Type": "application/json", "Accept-Language": locale }, body: JSON.stringify({ compositionId: overview.latestComposition.id }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || t("statusError"));
      setRepairs(repairPlanFromQc(data as QcReport));
      setStatus(data.status === "ok" ? t("qcPassed") : t("qcPlanned"));
    } catch (error) { setStatus(error instanceof Error ? error.message : t("statusError")); }
    finally { setBusy(null); }
  };

  const applyAutomaticRepairs = async () => {
    const composition = overview?.latestComposition;
    if (!composition || !repairs.length || repairs.some((repair) => !repair.automatic)) return;
    setBusy("repair"); setStatus("");
    try {
      const response = await fetch(`/api/project/${id}/compose`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept-Language": locale },
        body: JSON.stringify({
          resolution: composition.resolution || "1080p",
          aspectRatio: composition.aspectRatio || "9:16",
          freeTts: { enabled: true },
          bgmDuck: repairs.some((repair) => repair.action === "remix-audio"),
          label: t("repairVersionLabel"),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || t("statusError"));
      setRepairs([]);
      setStatus(t("repairStarted"));
      await loadOverview();
    } catch (error) { setStatus(error instanceof Error ? error.message : t("statusError")); }
    finally { setBusy(null); }
  };

  const evaluateCandidate = async (assetId: string) => {
    setQualityBusy(`evaluate:${assetId}`); setStatus("");
    try {
      const response = await fetch(`/api/project/${id}/quality`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept-Language": locale },
        body: JSON.stringify({ assetId, llmConfig: llm }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || t("qualityFailed"));
      setStatus(t("qualityComplete"));
      await loadQuality();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("qualityFailed"));
    } finally { setQualityBusy(null); }
  };

  const decideQuality = async (reviewId: string, decision: "accepted" | "rejected") => {
    setQualityBusy(`decision:${reviewId}`); setStatus("");
    try {
      const response = await fetch(`/api/project/${id}/quality`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "Accept-Language": locale },
        body: JSON.stringify({ reviewId, decision }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || t("qualityDecisionFailed"));
      setStatus(decision === "accepted" ? t("qualityAccepted") : t("qualityRejected"));
      await Promise.all([loadOverview(), loadQuality()]);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("qualityDecisionFailed"));
    } finally { setQualityBusy(null); }
  };

  const selectCandidate = async (assetId: string) => {
    setQualityBusy(`select:${assetId}`); setStatus("");
    try {
      const response = await fetch(`/api/project/${id}/assets`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "Accept-Language": locale },
        body: JSON.stringify({ assetId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || t("qualityDecisionFailed"));
      setStatus(t("takeSelected"));
      await Promise.all([loadOverview(), loadQuality()]);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("qualityDecisionFailed"));
    } finally { setQualityBusy(null); }
  };

  if (loading && !overview) return <main className="flex min-h-[60vh] items-center justify-center"><div role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><LuLoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" />{t("loading")}</div></main>;
  if (!overview) return <main className="mx-auto max-w-xl px-4 py-16"><div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-5 text-sm text-destructive">{status || t("loadFailed")}</div></main>;

  return (
    <main className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <Link href={`/project/${id}/assets`} className="mb-3 inline-flex min-h-8 items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><LuArrowLeft className="h-4 w-4" />{t("back")}</Link>
          <p className="mb-1 truncate text-xs font-medium tracking-wide text-primary">{overview.project.name}</p>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t("title")}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{t("subtitle")}</p>
        </div>
        <div className="flex self-start gap-2 sm:self-auto">
          <Link href={`/project/${id}/transcript`} className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/8 px-3 text-sm font-medium text-primary hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><LuScissors />{t("textEditor")}</Link>
          <Button variant="outline" className="h-10" disabled={busy === "snapshot"} onClick={() => patchProduction({ action: "snapshot" }, "snapshot")}>
            {busy === "snapshot" ? <LuLoaderCircle className="animate-spin motion-reduce:animate-none" /> : <LuGitBranch />}{t("snapshot")}
          </Button>
        </div>
      </header>

      <div role="status" aria-live="polite" className={`text-sm text-primary ${status ? "mb-4 min-h-5" : "sr-only"}`}>{status}</div>

      <div className="mb-6 grid overflow-hidden rounded-xl border border-border bg-card sm:grid-cols-3 sm:divide-x sm:divide-border">
        <div className="border-b border-border p-4 sm:border-b-0"><div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground"><LuBadgeDollarSign className="h-4 w-4 text-primary" />{t("cost")}</div><div className="text-xl font-bold tabular-nums">{t("usdRange", { min: estimate.rangeUsd.min.toFixed(2), max: estimate.rangeUsd.max.toFixed(2) })}</div><p className="mt-1 text-xs text-muted-foreground">{estimate.unknownCalls ? t("unknownCalls", { n: estimate.unknownCalls }) : t("priceKnown")}</p></div>
        <div className="border-b border-border p-4 sm:border-b-0"><div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground"><LuClock3 className="h-4 w-4 text-primary" />{t("time")}</div><div className="text-xl font-bold tabular-nums">{t("minuteRange", { min: Math.max(1, Math.ceil(estimate.estimatedSeconds.min / 60)), max: Math.max(1, Math.ceil(estimate.estimatedSeconds.max / 60)) })}</div><p className="mt-1 text-xs text-muted-foreground">{t("shots", { n: overview.selectedScript?.shotCount || overview.counts.assets })}</p></div>
        <div className="p-4"><div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground"><LuActivity className="h-4 w-4 text-primary" />{t("projectState")}</div><div className="text-xl font-bold">{overview.latestRun?.status ? t(`run_${overview.latestRun.status}`) : t("ready")}</div><p className="mt-1 text-xs text-muted-foreground">{t("outputCounts", { assets: overview.counts.assets, videos: overview.counts.compositions })}</p></div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <div className="min-w-0 space-y-5">
          <Section title={t("workflow")} hint={t("workflowHint")} icon={<LuRoute className="h-4 w-4" />}>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {workflow.map((stage) => {
                const optional = OPTIONAL_STAGES.has(stage.id);
                return <button key={stage.id} type="button" disabled={!optional} aria-pressed={stage.enabled} onClick={() => toggleWorkflowStage(stage.id)} className={`min-h-20 rounded-xl border p-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-default ${stage.enabled ? "border-primary/30 bg-primary/8" : "border-border/50 bg-background/25 opacity-60"}`}>
                  <span className="flex items-center justify-between gap-2"><span className="text-sm font-medium">{t(`stage_${stage.id}`)}</span><span className={`h-2 w-2 rounded-full ${stage.enabled ? "bg-success" : "bg-muted-foreground/40"}`} /></span>
                  <span className="mt-2 flex flex-wrap gap-1 text-xs text-muted-foreground"><span className="rounded bg-muted/40 px-1.5 py-0.5">{t(`execution_${stage.execution}`)}</span><span className="rounded bg-muted/40 px-1.5 py-0.5">{t(`billing_${stage.billing}`)}</span></span>
                </button>;
              })}
            </div>
            <Button className="mt-4 h-10" disabled={busy === "workflow"} onClick={() => patchProduction({ productionWorkflow: workflow }, "workflow")}><LuSave />{busy === "workflow" ? t("saving") : t("saveWorkflow")}</Button>
          </Section>

          <Section title={t("memory")} hint={t("memoryHint")} icon={<LuBrainCircuit className="h-4 w-4" />}>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-medium text-muted-foreground sm:col-span-2">{t("subject")}<input value={intent.subject} onChange={(event) => setIntent((current) => ({ ...current, subject: event.target.value }))} className="mt-1.5 h-10 w-full rounded-lg border border-border bg-background/50 px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary" /></label>
              {(["action", "environment", "lighting", "camera"] as const).map((field) => <label key={field} className="text-xs font-medium text-muted-foreground">{t(field)}<input value={intent[field] ?? ""} onChange={(event) => setIntent((current) => ({ ...current, [field]: event.target.value }))} className="mt-1.5 h-10 w-full rounded-lg border border-border bg-background/50 px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary" /></label>)}
              {(["characterAnchors", "productAnchors", "wardrobeAnchors", "forbiddenChanges"] as const).map((field) => <label key={field} className="text-xs font-medium text-muted-foreground">{t(field)}<input value={bible[field].join(", ")} placeholder={t("commaHint")} onChange={(event) => setBible((current) => ({ ...current, [field]: splitList(event.target.value) }))} className="mt-1.5 h-10 w-full rounded-lg border border-border bg-background/50 px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary" /></label>)}
            </div>
            <Button className="mt-4 h-10" disabled={busy === "memory"} onClick={() => patchProduction({ creativeIntent: intent, visualBible: bible }, "memory")}><LuSave />{busy === "memory" ? t("saving") : t("saveMemory")}</Button>
          </Section>

          <Section title={t("qualityGate")} hint={t("qualityGateHint")} icon={<LuScanSearch className="h-4 w-4" />}>
            <div className="mb-4 grid grid-cols-3 overflow-hidden rounded-lg bg-muted/30">
              <div className="p-3"><p className="text-xs text-muted-foreground">{t("qualityReviewed")}</p><p className="mt-1 text-lg font-bold tabular-nums">{qualitySummary.reviewed}/{qualitySummary.total}</p></div>
              <div className="border-x border-border/70 p-3"><p className="text-xs text-muted-foreground">{t("qualityAcceptedCount")}</p><p className="mt-1 text-lg font-bold tabular-nums text-success">{qualitySummary.accepted}</p></div>
              <div className="p-3"><p className="text-xs text-muted-foreground">{t("qualityAttention")}</p><p className="mt-1 text-lg font-bold tabular-nums text-warning">{qualitySummary.needsAttention}</p></div>
            </div>
            {!llm.baseUrl || !llm.apiKey || !(llm.visionModel || llm.model) ? <p className="mb-3 rounded-xl border border-warning/25 bg-warning/8 p-3 text-xs leading-5 text-warning">{t("qualityNeedsVision")}</p> : null}
            <div className="space-y-2" aria-busy={qualityBusy !== null}>
              {qualityGroups.length ? qualityGroups.map((group) => {
                const active = group.candidates.find((candidate) => candidate.selected) ?? group.candidates[0];
                const activeReview = active?.latestReview;
                const activeVerdict = activeReview?.humanDecision || activeReview?.verdict;
                return <details key={group.shotId} className="group overflow-hidden rounded-xl border border-border/60 bg-background/25">
                  <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 outline-none transition-colors hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary">
                    <div className="min-w-0"><p className="text-sm font-semibold">{t("qualityShot", { n: group.shotId })}</p><p className="truncate text-[11px] text-muted-foreground">{group.candidates.length > 1 ? t("qualityTakes", { n: group.candidates.length }) : active?.model || active?.provider || t("qualityOneTake")}</p></div>
                    <div className="flex shrink-0 items-center gap-2">
                      {activeReview ? <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${activeVerdict === "accepted" || activeVerdict === "accept" ? "border-success/30 bg-success/10 text-success" : activeVerdict === "rejected" || activeVerdict === "reject" ? "border-destructive/30 bg-destructive/10 text-destructive" : "border-warning/30 bg-warning/10 text-warning"}`}>{activeReview.report.overall} · {t(`qualityVerdict_${activeVerdict}`)}</span> : <span className="rounded-full border border-border/60 px-2 py-1 text-[10px] text-muted-foreground">{t("qualityPending")}</span>}
                      <LuChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
                    </div>
                  </summary>
                  <div className="space-y-3 border-t border-border/50 p-3">
                    {group.candidates.map((candidate, candidateIndex) => {
                      const review = candidate.latestReview;
                      const preview = candidate.thumbnailPath || (candidate.filePath && !/\.(mp4|webm|mov|m4v)$/i.test(candidate.filePath) ? candidate.filePath : null);
                      const actionBusy = qualityBusy?.endsWith(candidate.id) || (review && qualityBusy === `decision:${review.id}`);
                      return <article key={candidate.id} className={`rounded-xl border p-3 ${candidate.selected ? "border-primary/35 bg-primary/6" : "border-border/50 bg-card/35"}`}>
                        <div className="flex items-start gap-3">
                          {preview ? <Image src={preview} alt={t("qualityPreview", { n: candidateIndex + 1 })} width={64} height={64} unoptimized className="h-16 w-16 shrink-0 rounded-lg border border-border/50 object-cover" loading="lazy" /> : <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-border/50 bg-muted/30 text-muted-foreground" aria-hidden="true"><LuFilm /></div>}
                          <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-1.5"><span className="text-xs font-semibold">{t("qualityTake", { n: candidateIndex + 1 })}</span>{candidate.selected && <span className="rounded-full bg-primary/12 px-2 py-0.5 text-[10px] font-medium text-primary">{t("activeTake")}</span>}</div><p className="mt-1 truncate text-[11px] text-muted-foreground">{candidate.model || candidate.provider || candidate.type}</p>{candidate.generationPlan && <div className="mt-1.5 flex flex-wrap gap-1" aria-label={t("qualityControlPlan")}>{"kind" in candidate.generationPlan ? <><span className="rounded-full border border-primary/25 bg-primary/8 px-2 py-0.5 text-[10px] text-primary">{t("qualityPlanRepair", { start: candidate.generationPlan.window.start.toFixed(1), end: candidate.generationPlan.window.end.toFixed(1) })}</span><span className="rounded-full border border-border/60 px-2 py-0.5 text-[10px] text-muted-foreground">{t("repairPreserveAudio")}</span></> : <><span className="rounded-full border border-border/60 px-2 py-0.5 text-[10px] text-muted-foreground">{t(candidate.generationPlan.strategy === "reference-pack" ? "qualityPlanReference" : "qualityPlanKeyframe", { n: candidate.generationPlan.referenceCount })}</span><span className="rounded-full border border-border/60 px-2 py-0.5 text-[10px] text-muted-foreground">{t(`qualityAudio_${candidate.generationPlan.audioMode}`)}</span></>}{candidate.generationPlan.warnings.length > 0 && <span className="rounded-full border border-warning/25 bg-warning/8 px-2 py-0.5 text-[10px] text-warning">{t("qualityPlanDegraded")}</span>}</div>}{review && <p className="mt-1 line-clamp-2 text-xs leading-5 text-foreground/90">{review.report.summary || t("qualityNoSummary")}</p>}</div>
                        </div>
                        {review ? <>
                          <details className="mt-3 rounded-lg border border-border/50 bg-background/30">
                            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-3 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"><span>{t("qualityEvidence")}</span><span className="text-muted-foreground">{review.report.dimensions.length} {t("qualityDimensions")}</span></summary>
                            <div className="grid gap-2 border-t border-border/50 p-3 sm:grid-cols-2">
                              {review.report.dimensions.map((dimension) => <div key={dimension.id} className="rounded-lg bg-muted/25 p-2.5"><div className="flex items-center justify-between gap-2"><span className="text-[11px] font-medium">{t(`quality_${dimension.id}`)}</span><span className="text-xs font-bold tabular-nums">{dimension.score}</span></div><p className="mt-1 text-[10px] text-muted-foreground">{t("qualityConfidence", { n: Math.round(dimension.confidence * 100) })}</p><p className="mt-1 text-[11px] leading-4 text-muted-foreground">{dimension.summary}</p>{dimension.evidence.slice(0, 2).map((evidence, evidenceIndex) => <p key={`${evidence.time ?? "image"}-${evidenceIndex}`} className="mt-1.5 border-l-2 border-border/70 pl-2 text-[10px] leading-4 text-foreground/75">{evidence.time != null ? `${evidence.time.toFixed(1)}s · ` : ""}{evidence.observation}</p>)}</div>)}
                            </div>
                          </details>
                          {review.report.issues.length > 0 && <div className="mt-3 space-y-1.5">{review.report.issues.slice(0, 3).map((issue) => <p key={`${issue.code}-${issue.time ?? "x"}`} className={`rounded-lg border px-2.5 py-2 text-[11px] leading-4 ${issue.severity === "critical" ? "border-destructive/25 bg-destructive/8 text-destructive" : "border-warning/20 bg-warning/8 text-warning"}`}>{issue.time != null ? `${issue.time.toFixed(1)}s · ` : ""}{issue.summary}</p>)}</div>}
                          <p className="mt-3 text-[11px] leading-5 text-muted-foreground">{t(`qualityAction_${review.disposition.action}`)}{review.disposition.paid ? ` · ${t("qualityPaidNotRun")}` : ""}</p>
                          {candidate.filePath && /\.(mp4|webm|mov|m4v)$/i.test(candidate.filePath) && <VideoRepairPanel
                            projectId={id}
                            assetId={candidate.id}
                            reviewId={review.id}
                            currentModel={candidate.model}
                            defaultVideoModel={defaultVideoModel}
                            models={videoModels}
                            media={media}
                            anchors={qualityCandidates.filter((item) => item.filePath && !/\.(mp4|webm|mov|m4v)$/i.test(item.filePath)).map((item) => ({ id: item.id, shotId: item.shotId, label: t("repairAnchorLabel", { shot: item.shotId, model: item.model || item.provider || item.type }) }))}
                            onComplete={async () => { setStatus(t("repairComplete")); await Promise.all([loadOverview(), loadQuality()]); }}
                          />}
                          <div className="mt-3 grid grid-cols-2 gap-2">
                            <Button className="h-11" disabled={Boolean(actionBusy) || review.humanDecision === "accepted"} onClick={() => void decideQuality(review.id, "accepted")}><LuThumbsUp />{review.humanDecision === "accepted" ? t("qualityAccepted") : t("qualityAccept")}</Button>
                            <Button variant="outline" className="h-11" disabled={Boolean(actionBusy) || review.humanDecision === "rejected"} onClick={() => void decideQuality(review.id, "rejected")}><LuThumbsDown />{review.humanDecision === "rejected" ? t("qualityRejected") : t("qualityReject")}</Button>
                          </div>
                        </> : <div className="mt-3 grid gap-2 sm:grid-cols-2"><Button className="h-11" disabled={Boolean(qualityBusy) || !llm.baseUrl || !llm.apiKey || !(llm.visionModel || llm.model)} onClick={() => void evaluateCandidate(candidate.id)}>{qualityBusy === `evaluate:${candidate.id}` ? <LuLoaderCircle className="animate-spin motion-reduce:animate-none" /> : <LuScanSearch />}{qualityBusy === `evaluate:${candidate.id}` ? t("qualityRunning") : t("qualityEvaluate")}</Button>{!candidate.selected && <Button variant="outline" className="h-11" disabled={Boolean(qualityBusy)} onClick={() => void selectCandidate(candidate.id)}><LuCheck />{t("selectTake")}</Button>}</div>}
                      </article>;
                    })}
                  </div>
                </details>;
              }) : <p className="text-sm text-muted-foreground">{t("qualityNoAssets")}</p>}
            </div>
          </Section>

          <Section title={t("versions")} icon={<LuGitBranch className="h-4 w-4" />}>
            {!overview.versionTree.scripts.length && !overview.versionTree.generations.length && !overview.snapshots.length ? <p className="text-sm text-muted-foreground">{t("noVersions")}</p> : <div className="grid gap-4 md:grid-cols-2">
              <div className="min-w-0"><h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("snapshots")}</h3><div className="space-y-2">{overview.snapshots.slice(0, 5).map((item) => <div key={item.id} className="rounded-lg border border-border/50 bg-background/30 px-3 py-2"><p className="truncate text-sm font-medium">{item.label}</p><p className="mt-1 text-[11px] text-muted-foreground">{formatDate(item.createdAt, locale)} · {item.assetIds.length} {t("assetsUnit")}</p></div>)}</div></div>
              <div className="min-w-0"><h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("generations")}</h3><div className="space-y-2">{overview.versionTree.generations.slice(0, 6).map((item) => <div key={`${item.kind}-${item.id}`} className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-border/50 bg-background/30 px-3 py-2"><div className="min-w-0"><p className="truncate text-sm font-medium">{item.label}</p><p className="text-[11px] text-muted-foreground">{item.kind}{item.shotId != null ? ` · #${item.shotId}` : ""}</p></div><span className="shrink-0 rounded-full border border-border/60 px-2 py-0.5 text-[10px]">{item.status}</span></div>)}</div></div>
            </div>}
          </Section>
        </div>

        <div className="min-w-0 space-y-5">
          <Section title={t("router")} hint={t("routerHint")} icon={<LuWandSparkles className="h-4 w-4" />}>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 xl:grid-cols-2">{(["balanced", "cost", "speed", "quality", "consistency"] as RoutingGoal[]).map((item) => <button key={item} type="button" aria-pressed={goal === item} onClick={() => setGoal(item)} className={`min-h-9 rounded-lg border px-2 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-primary ${goal === item ? "border-primary/40 bg-primary/10 text-primary" : "border-border/60 text-muted-foreground hover:text-foreground"}`}>{t(`goal_${item}`)}</button>)}</div>
            {routeDecision.selected ? <div className="mt-4 rounded-xl border border-primary/25 bg-primary/8 p-3"><p className="text-[11px] font-semibold uppercase tracking-wider text-primary">{t("recommended")}</p><p className="mt-1 break-words text-sm font-semibold">{routeDecision.selected.name}</p><p className="mt-1 text-[11px] text-muted-foreground">{priceOf(videoModels.find((model) => model.id === routeDecision.selected?.id)) == null ? t("priceUnknown") : t("perCall", { price: priceOf(videoModels.find((model) => model.id === routeDecision.selected?.id))!.toFixed(3) })}</p>{modelQualityStats.find((stat) => stat.model === routeDecision.selected?.id) ? <p className="mt-1 text-[11px] text-muted-foreground">{t("modelQualityHistory", { score: modelQualityStats.find((stat) => stat.model === routeDecision.selected?.id)!.averageOverall, n: modelQualityStats.find((stat) => stat.model === routeDecision.selected?.id)!.reviews })}</p> : <p className="mt-1 text-[11px] text-muted-foreground">{t("modelNoHistory")}</p>}<Button className="mt-3 h-10 w-full" disabled={defaultVideoModel === routeDecision.selected.id} onClick={() => { setDefaultVideoModel(routeDecision.selected!.id); setStatus(t("modelApplied")); }}><LuCheck />{defaultVideoModel === routeDecision.selected.id ? t("applied") : t("applyModel")}</Button></div> : <p className="mt-4 text-sm text-muted-foreground">{t("noModel")}</p>}
          </Section>

          <Section title={t("assets")} hint={t("assetCount", { n: overview.semanticAssets.length })} icon={<LuTags className="h-4 w-4" />}>
            {overview.semanticAssets.length ? <div className="space-y-3">{overview.semanticAssets.slice(0, 8).map((asset) => <div key={asset.id} className="rounded-xl border border-border/50 bg-background/30 p-3"><div className="flex items-center justify-between gap-2"><span className="text-xs font-medium">#{asset.shotId} · {asset.mediaType}</span><span className="text-[10px] text-muted-foreground">{asset.commercialStatus}</span></div><div className="mt-2 flex flex-wrap gap-1">{asset.tags.length ? asset.tags.slice(0, 6).map((tag) => <span key={tag} className="rounded-full bg-muted/50 px-2 py-0.5 text-[10px] text-muted-foreground">{tag}</span>) : <span className="text-[11px] text-muted-foreground">{t("noTags")}</span>}</div></div>)}</div> : <p className="text-sm text-muted-foreground">{t("noTags")}</p>}
            {overview.mediaInsights.length > 0 && <div className="mt-4 border-t border-border/50 pt-3"><p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("mediaInsights")}</p>{overview.mediaInsights.slice(0, 3).map((insight) => <p key={insight.id} className="mb-2 line-clamp-2 text-xs leading-5 text-muted-foreground">{insight.summary}</p>)}</div>}
          </Section>

          <Section title={t("diagnosis")} icon={<LuCircleAlert className="h-4 w-4" />}>
            {diagnosis ? <div><p className="text-sm leading-6">{diagnosis.message[locale]}</p><p className="mt-3 text-xs font-medium text-muted-foreground">{t("recover")}</p><div className="mt-2 flex flex-wrap gap-1.5">{diagnosis.actions.map((action) => <span key={action} className="rounded-full border border-warning/25 bg-warning/8 px-2.5 py-1 text-[11px] text-warning">{t(`recovery_${action}`)}</span>)}</div></div> : <p className="flex items-center gap-2 text-sm text-muted-foreground"><LuShieldCheck className="h-4 w-4 text-success" />{t("noFailure")}</p>}
          </Section>

          <Section title={t("preview")} hint={t("previewDesc")} icon={<LuFilm className="h-4 w-4" />}>
            <div className="mb-3 flex flex-wrap gap-2 text-[11px] text-muted-foreground"><span className="rounded-full border border-border/60 px-2 py-1">{previewPlan.resolution}</span><span className="rounded-full border border-border/60 px-2 py-1">{previewPlan.videoPreset}</span><span className="rounded-full border border-border/60 px-2 py-1">CRF {previewPlan.crf}</span></div>
            <Link href={`/project/${id}/video?renderPreset=fast`} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-medium outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary"><LuFilm className="h-4 w-4" />{t("previewCta")}</Link>
          </Section>

          <Section title={t("repairs")} icon={<LuSparkles className="h-4 w-4" />}>
            <Button className="h-10 w-full" disabled={overview.latestComposition?.status !== "done" || busy === "qc"} onClick={runQc}>{busy === "qc" ? <LuLoaderCircle className="animate-spin motion-reduce:animate-none" /> : <LuRefreshCw />}{busy === "qc" ? t("qcRunning") : t("runQc")}</Button>
            {!overview.latestComposition?.id && <p className="mt-2 text-xs text-muted-foreground">{t("noComposition")}</p>}
            {repairs.length > 0 && <div className="mt-3 space-y-2">{repairs.map((repair) => <div key={repair.checkId} className="rounded-lg border border-border/50 bg-background/30 p-3"><div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold">{t(`stage_${repair.stage}`)}</span><span className="text-[10px] text-muted-foreground">{repair.automatic ? t("freeAutoFix") : t("manualReview")}</span></div><p className="mt-1 text-xs leading-5 text-muted-foreground">{repair.message[locale]}</p></div>)}{repairs.every((repair) => repair.automatic) && <Button variant="outline" className="h-10 w-full" disabled={busy === "repair"} onClick={applyAutomaticRepairs}>{busy === "repair" ? <LuLoaderCircle className="animate-spin motion-reduce:animate-none" /> : <LuSparkles />}{busy === "repair" ? t("repairStarting") : t("applyFreeRepairs")}</Button>}</div>}
          </Section>

          <Section title={t("masterTitle")} hint={t("masterHint")} icon={<LuSlidersHorizontal className="h-4 w-4" />}>
            <MasteringPanel key={overview.latestComposition?.id ?? "none"} projectId={id} composition={overview.latestComposition} onComplete={loadOverview} />
          </Section>
        </div>
      </div>
    </main>
  );
}
