"use client";

import { useState } from "react";
import { LuAudioLines, LuCheck, LuChevronDown, LuLoaderCircle, LuScanSearch, LuSparkles } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";
import type { MasteringAnalysis } from "@/lib/video-mastering";

interface MasteringPanelProps {
  projectId: string;
  composition: { id: string; status: string } | null;
  onComplete: () => Promise<void> | void;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function MasteringPanel({ projectId, composition, onComplete }: MasteringPanelProps) {
  const t = useT("production");
  const [analysis, setAnalysis] = useState<MasteringAnalysis | null>(null);
  const [normalizeAudio, setNormalizeAudio] = useState(false);
  const [deflicker, setDeflicker] = useState(false);
  const [busy, setBusy] = useState<"analyze" | "render" | null>(null);
  const [message, setMessage] = useState("");

  const analyze = async () => {
    if (!composition?.id) return;
    setBusy("analyze");
    setMessage("");
    try {
      const response = await fetch(`/api/project/${projectId}/mastering`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "analyze", compositionId: composition.id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || t("masterAnalyzeFailed"));
      const next = data.analysis as MasteringAnalysis;
      setAnalysis(next);
      setNormalizeAudio(next.recommendations.normalizeAudio);
      setDeflicker(false);
      setMessage(t("masterAnalyzeReady"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("masterAnalyzeFailed"));
    } finally {
      setBusy(null);
    }
  };

  const render = async () => {
    if (!composition?.id || !analysis || (!normalizeAudio && !deflicker)) return;
    setBusy("render");
    setMessage("");
    try {
      const response = await fetch(`/api/project/${projectId}/mastering`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "render",
          compositionId: composition.id,
          normalizeAudio,
          deflicker,
          label: t("masterVersionLabel"),
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.compositionId) throw new Error(data.error || t("masterRenderFailed"));
      for (let attempt = 0; attempt < 240; attempt += 1) {
        await wait(1500);
        const poll = await fetch(`/api/project/${projectId}/compose?compositionId=${data.compositionId}`);
        const state = await poll.json();
        if (!poll.ok) throw new Error(state.error || t("masterRenderFailed"));
        if (state.composition?.status === "done") {
          setMessage(t("masterComplete"));
          await onComplete();
          return;
        }
        if (state.composition?.status === "failed") throw new Error(t("masterRenderFailed"));
      }
      throw new Error(t("masterStillRunning"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("masterRenderFailed"));
    } finally {
      setBusy(null);
    }
  };

  if (!composition || composition.status !== "done") {
    return <p className="text-sm text-muted-foreground">{t("noComposition")}</p>;
  }

  const attention = analysis?.boundaries.filter((item) => item.level !== "ok") ?? [];
  return (
    <div className="space-y-3" aria-busy={busy !== null}>
      {!analysis ? (
        <Button className="h-11 w-full" disabled={busy !== null} onClick={() => void analyze()}>
          {busy === "analyze" ? <LuLoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <LuScanSearch aria-hidden="true" />}
          {busy === "analyze" ? t("masterAnalyzing") : t("masterAnalyze")}
        </Button>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <div className="rounded-xl border border-border/50 bg-background/30 p-3">
              <p className="text-[11px] text-muted-foreground">{t("masterCuts")}</p>
              <p className="mt-1 text-lg font-bold tabular-nums">{analysis.summary.total}</p>
            </div>
            <div className="rounded-xl border border-warning/20 bg-warning/8 p-3">
              <p className="text-[11px] text-muted-foreground">{t("masterAttention")}</p>
              <p className="mt-1 text-lg font-bold tabular-nums text-warning">{analysis.summary.review + analysis.summary.strong}</p>
            </div>
            <div className="col-span-2 rounded-xl border border-border/50 bg-background/30 p-3 sm:col-span-1">
              <p className="text-[11px] text-muted-foreground">{t("masterLoudness")}</p>
              <p className="mt-1 text-lg font-bold tabular-nums">{analysis.loudness ? `${analysis.loudness.inputI.toFixed(1)} LUFS` : "—"}</p>
            </div>
          </div>

          {attention.length > 0 ? (
            <details className="group overflow-hidden rounded-xl border border-border/60 bg-background/25">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary">
                <span>{t("masterBoundaryDetails", { n: attention.length })}</span>
                <LuChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
              </summary>
              <div className="space-y-2 border-t border-border/50 p-3">
                {attention.slice(0, 8).map((item) => (
                  <div key={item.at} className="rounded-lg border border-border/50 bg-card/35 p-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-semibold tabular-nums">{item.at.toFixed(2)}s</span>
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${item.level === "strong" ? "border-destructive/30 bg-destructive/10 text-destructive" : "border-warning/30 bg-warning/10 text-warning"}`}>
                        {t(item.level === "strong" ? "masterStrong" : "masterReview")} · {item.score}
                      </span>
                    </div>
                    <p className="mt-1.5 text-[11px] leading-5 text-muted-foreground">
                      {t("masterBoundaryMetrics", { luma: item.lumaDelta.toFixed(1), chroma: item.chromaDelta.toFixed(1), saturation: item.saturationDelta.toFixed(1) })}
                    </p>
                  </div>
                ))}
                {attention.length > 8 && <p className="text-[11px] text-muted-foreground">{t("masterMoreBoundaries", { n: attention.length - 8 })}</p>}
              </div>
            </details>
          ) : (
            <p className="flex items-center gap-2 rounded-xl border border-success/20 bg-success/8 p-3 text-xs leading-5 text-success"><LuCheck className="h-4 w-4 shrink-0" aria-hidden="true" />{t("masterBoundariesClean")}</p>
          )}

          <div className="space-y-2">
            <label className={`flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border p-3 ${normalizeAudio ? "border-primary/35 bg-primary/8" : "border-border/60 bg-background/25"}`}>
              <input type="checkbox" checked={normalizeAudio} disabled={!analysis.hasAudio || busy !== null} onChange={(event) => setNormalizeAudio(event.target.checked)} className="mt-1 h-4 w-4 accent-primary" />
              <span className="min-w-0"><span className="flex items-center gap-2 text-xs font-semibold"><LuAudioLines className="h-4 w-4" aria-hidden="true" />{t("masterNormalize")}{analysis.recommendations.normalizeAudio && <span className="rounded-full bg-primary/12 px-2 py-0.5 text-[10px] text-primary">{t("masterRecommended")}</span>}</span><span className="mt-1 block text-[11px] leading-5 text-muted-foreground">{t("masterNormalizeHint")}</span></span>
            </label>
            <label className={`flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border p-3 ${deflicker ? "border-primary/35 bg-primary/8" : "border-border/60 bg-background/25"}`}>
              <input type="checkbox" checked={deflicker} disabled={busy !== null} onChange={(event) => setDeflicker(event.target.checked)} className="mt-1 h-4 w-4 accent-primary" />
              <span className="min-w-0"><span className="text-xs font-semibold">{t("masterDeflicker")}</span><span className="mt-1 block text-[11px] leading-5 text-muted-foreground">{t("masterDeflickerHint")}</span></span>
            </label>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <Button variant="outline" className="h-11" disabled={busy !== null} onClick={() => void analyze()}>
              {busy === "analyze" ? <LuLoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <LuScanSearch aria-hidden="true" />}
              {t("masterReanalyze")}
            </Button>
            <Button className="h-11" disabled={busy !== null || (!normalizeAudio && !deflicker)} onClick={() => void render()}>
              {busy === "render" ? <LuLoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <LuSparkles aria-hidden="true" />}
              {busy === "render" ? t("masterRendering") : t("masterRender")}
            </Button>
          </div>
        </>
      )}
      {message && <p role="status" aria-live="polite" className="text-xs leading-5 text-muted-foreground">{message}</p>}
    </div>
  );
}
