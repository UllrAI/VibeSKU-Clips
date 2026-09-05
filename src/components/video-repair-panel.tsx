"use client";

import { useEffect, useMemo, useState } from "react";
import { LuCircleAlert, LuLoaderCircle, LuPlus, LuRefreshCw, LuShieldCheck, LuTrash2, LuWandSparkles } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { useLocale, useT } from "@/lib/i18n";
import { getVideoModelCapabilities } from "@/lib/model-capabilities";
import type { Model } from "@/lib/providers/types";
import type { MediaSetting } from "@/lib/stores/settings-store";
import { resolveModelTarget } from "@/lib/gen-params";
import type { RepairScope, TimedKeyframe, VideoRepairPreview, VideoRepairWarning } from "@/lib/video-repair-plan";

interface AnchorOption {
  id: string;
  shotId: number;
  label: string;
}

function modelPrice(model: Model | undefined): number | undefined {
  const raw = Number(model?.extra?.priceBase);
  if (Number.isFinite(raw) && raw >= 0) return raw;
  const match = model?.description?.match(/\$\s*([\d.]+)/);
  const parsed = match ? Number(match[1]) : Number.NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function numberOrUndefined(value: string): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function VideoRepairPanel(props: {
  projectId: string;
  assetId: string;
  reviewId: string;
  currentModel?: string | null;
  defaultVideoModel: string;
  models: Model[];
  media: MediaSetting;
  anchors: AnchorOption[];
  onComplete: () => Promise<void> | void;
}) {
  const t = useT("production");
  const locale = useLocale();
  // Repair rewrites a clip from the clip itself, so only models that take a reference video
  // qualify — on Prism that is the Seedance family.
  const repairModels = useMemo(
    () => props.models.filter((model) => model.mediaType === "video" && getVideoModelCapabilities(model.id).referenceVideo),
    [props.models]
  );
  const preferred = useMemo(() => repairModels.find((model) => model.id === props.defaultVideoModel)
    ?? repairModels.find((model) => model.id === props.currentModel)
    ?? repairModels[0], [props.currentModel, props.defaultVideoModel, repairModels]);
  const [modelKey, setModelKey] = useState("");
  const [scope, setScope] = useState<RepairScope>("temporal");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [region, setRegion] = useState({ x: "10", y: "10", width: "80", height: "80" });
  const [keyframes, setKeyframes] = useState<TimedKeyframe[]>([]);
  const [preview, setPreview] = useState<VideoRepairPreview | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState<"preview" | "execute" | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!modelKey && preferred) setModelKey(`${preferred.provider}::${preferred.id}`);
  }, [modelKey, preferred]);

  const selectedModel = repairModels.find((model) => `${model.provider}::${model.id}` === modelKey);
  const invalidate = () => { setPreview(null); setConfirmed(false); setMessage(""); };
  const payload = () => ({
    assetId: props.assetId,
    reviewId: props.reviewId,
    provider: selectedModel?.provider,
    model: selectedModel?.id,
    supportsAudio: selectedModel?.supportsAudio,
    pricePerCall: modelPrice(selectedModel),
    ...((start || end) && { window: { start: numberOrUndefined(start), end: numberOrUndefined(end) } }),
    scope,
    ...(scope === "region" && { region: {
      x: (numberOrUndefined(region.x) ?? 0) / 100,
      y: (numberOrUndefined(region.y) ?? 0) / 100,
      width: (numberOrUndefined(region.width) ?? 100) / 100,
      height: (numberOrUndefined(region.height) ?? 100) / 100,
    } }),
    keyframes,
  });

  const createPreview = async () => {
    if (!selectedModel) return;
    setBusy("preview"); setMessage(""); setConfirmed(false);
    try {
      const response = await fetch(`/api/project/${props.projectId}/repair`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept-Language": locale },
        body: JSON.stringify({ action: "preview", ...payload() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || t("repairPreviewFailed"));
      const next = data as VideoRepairPreview;
      setPreview(next);
      setStart(next.summary.window.start.toFixed(2));
      setEnd(next.summary.window.end.toFixed(2));
      setMessage(t("repairPreviewReady"));
    } catch (error) {
      setPreview(null);
      setMessage(error instanceof Error ? error.message : t("repairPreviewFailed"));
    } finally { setBusy(null); }
  };

  const execute = async () => {
    if (!selectedModel || !preview || !confirmed) return;
    const target = resolveModelTarget(props.media, selectedModel.id);
    if (!target) return;
    setBusy("execute"); setMessage("");
    try {
      const response = await fetch(`/api/project/${props.projectId}/repair`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept-Language": locale },
        body: JSON.stringify({
          action: "execute",
          ...payload(),
          operationId: preview.summary.operationId,
          planHash: preview.summary.planHash,
          confirmed: true,
          apiKey: target.apiKey,
          apiSecret: target.apiSecret,
          baseUrl: target.baseUrl,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || t("repairExecuteFailed"));
      setMessage(t("repairComplete"));
      setConfirmed(false);
      await props.onComplete();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("repairExecuteFailed"));
    } finally { setBusy(null); }
  };

  const addKeyframe = () => {
    const firstUnused = props.anchors.find((anchor) => !keyframes.some((item) => item.assetId === anchor.id));
    if (!firstUnused || keyframes.length >= 4) return;
    setKeyframes((current) => [...current, { assetId: firstUnused.id, time: numberOrUndefined(start) ?? 0, role: "composition" }]);
    invalidate();
  };

  const warningText = (warning: VideoRepairWarning) => t(`repairWarning_${warning}`);

  return (
    <details className="mt-3 rounded-lg border border-primary/25 bg-primary/5">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 text-xs font-semibold text-primary outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary">
        <span className="flex items-center gap-2"><LuWandSparkles aria-hidden="true" />{t("repairPrecise")}</span>
        <span className="text-[10px] font-normal text-muted-foreground">{t("repairPreviewFirst")}</span>
      </summary>
      <div className="space-y-3 border-t border-primary/20 p-3">
        <label className="block text-xs font-medium text-muted-foreground">
          {t("repairModel")}
          <select value={modelKey} onChange={(event) => { setModelKey(event.target.value); invalidate(); }} className="mt-1.5 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary">
            {!repairModels.length && <option value="">{t("repairNoModel")}</option>}
            {repairModels.map((model) => <option key={`${model.provider}:${model.id}`} value={`${model.provider}::${model.id}`}>{model.name} · {model.provider}</option>)}
          </select>
        </label>

        <fieldset className="grid grid-cols-2 gap-2">
          <legend className="mb-1 text-xs font-medium text-muted-foreground">{t("repairScope")}</legend>
          {(["temporal", "region"] as const).map((item) => <button key={item} type="button" aria-pressed={scope === item} onClick={() => { setScope(item); invalidate(); }} className={`min-h-11 rounded-lg border px-3 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-primary ${scope === item ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}>{t(`repairScope_${item}`)}</button>)}
        </fieldset>

        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs font-medium text-muted-foreground">{t("repairStart")}<input id={`repair-start-${props.assetId}`} type="number" inputMode="decimal" min="0" step="0.1" value={start} onChange={(event) => { setStart(event.target.value); invalidate(); }} className="mt-1.5 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm tabular-nums text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-describedby={`repair-time-help-${props.assetId}`} /></label>
          <label className="text-xs font-medium text-muted-foreground">{t("repairEnd")}<input type="number" inputMode="decimal" min="0.5" step="0.1" value={end} onChange={(event) => { setEnd(event.target.value); invalidate(); }} className="mt-1.5 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm tabular-nums text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-describedby={`repair-time-help-${props.assetId}`} /></label>
        </div>
        <p id={`repair-time-help-${props.assetId}`} className="text-[11px] leading-5 text-muted-foreground">{t("repairTimeHelp")}</p>

        {scope === "region" && <div className="grid grid-cols-2 gap-2 rounded-lg border border-border/60 bg-background/35 p-3 sm:grid-cols-4">
          {(["x", "y", "width", "height"] as const).map((field) => <label key={field} className="text-[11px] font-medium text-muted-foreground">{t(`repairRegion_${field}`)}<input type="number" inputMode="decimal" min="0" max="100" value={region[field]} onChange={(event) => { setRegion((current) => ({ ...current, [field]: event.target.value })); invalidate(); }} className="mt-1.5 h-11 w-full rounded-lg border border-border bg-background px-2 text-sm tabular-nums text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary" /></label>)}
        </div>}

        {props.anchors.length > 0 && <div className="rounded-lg border border-border/60 bg-background/35 p-3">
          <div className="flex items-center justify-between gap-2"><div><p className="text-xs font-medium">{t("repairKeyframes")}</p><p className="mt-1 text-[11px] text-muted-foreground">{t("repairKeyframesHelp")}</p></div><Button type="button" variant="outline" className="h-11 shrink-0" disabled={keyframes.length >= 4 || props.anchors.every((anchor) => keyframes.some((item) => item.assetId === anchor.id))} onClick={addKeyframe}><LuPlus aria-hidden="true" />{t("repairAddKeyframe")}</Button></div>
          {keyframes.length > 0 && <div className="mt-3 space-y-2">{keyframes.map((keyframe, index) => <div key={`${keyframe.assetId}-${index}`} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_96px_132px_44px]">
            <select aria-label={t("repairKeyframeAsset")} value={keyframe.assetId} onChange={(event) => { setKeyframes((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, assetId: event.target.value } : item)); invalidate(); }} className="h-11 min-w-0 rounded-lg border border-border bg-background px-2 text-xs text-foreground"><option value={keyframe.assetId}>{props.anchors.find((item) => item.id === keyframe.assetId)?.label ?? keyframe.assetId}</option>{props.anchors.filter((anchor) => anchor.id === keyframe.assetId || !keyframes.some((item) => item.assetId === anchor.id)).map((anchor) => <option key={anchor.id} value={anchor.id}>{anchor.label}</option>)}</select>
            <input aria-label={t("repairKeyframeTime")} type="number" inputMode="decimal" min="0" step="0.1" value={keyframe.time} onChange={(event) => { setKeyframes((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, time: Number(event.target.value) || 0 } : item)); invalidate(); }} className="h-11 rounded-lg border border-border bg-background px-2 text-xs tabular-nums text-foreground" />
            <select aria-label={t("repairKeyframeRole")} value={keyframe.role} onChange={(event) => { setKeyframes((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, role: event.target.value as TimedKeyframe["role"] } : item)); invalidate(); }} className="h-11 rounded-lg border border-border bg-background px-2 text-xs text-foreground">{(["identity", "product", "composition", "continuity"] as const).map((role) => <option key={role} value={role}>{t(`repairRole_${role}`)}</option>)}</select>
            <Button type="button" variant="outline" aria-label={t("repairRemoveKeyframe")} className="h-11 w-11 px-0" onClick={() => { setKeyframes((current) => current.filter((_, itemIndex) => itemIndex !== index)); invalidate(); }}><LuTrash2 aria-hidden="true" /></Button>
          </div>)}</div>}
        </div>}

        <Button type="button" variant="outline" className="h-11 w-full" disabled={!selectedModel || busy !== null} onClick={() => void createPreview()}>{busy === "preview" ? <LuLoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <LuRefreshCw aria-hidden="true" />}{busy === "preview" ? t("repairPreviewing") : preview ? t("repairRefreshPreview") : t("repairCreatePreview")}</Button>

        {preview && <div className="space-y-3 rounded-xl border border-border/70 bg-background/55 p-3" aria-live="polite">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div><p className="text-[10px] text-muted-foreground">{t("repairWindow")}</p><p className="mt-1 text-xs font-semibold tabular-nums">{preview.summary.window.start.toFixed(2)}–{preview.summary.window.end.toFixed(2)}s</p></div>
            <div><p className="text-[10px] text-muted-foreground">{t("repairBilledDuration")}</p><p className="mt-1 text-xs font-semibold tabular-nums">{preview.summary.generatedDuration}s</p></div>
            <div><p className="text-[10px] text-muted-foreground">{t("repairCost")}</p><p className="mt-1 text-xs font-semibold tabular-nums">{preview.estimatedCost.min == null ? t("priceUnknown") : `$${preview.estimatedCost.min.toFixed(3)}`}</p></div>
            <div><p className="text-[10px] text-muted-foreground">{t("repairAudio")}</p><p className="mt-1 text-xs font-semibold">{t("repairPreserveAudio")}</p></div>
          </div>
          <div className="flex flex-wrap gap-1.5">{preview.summary.warnings.map((warning) => <span key={warning} className="inline-flex items-center gap-1 rounded-full border border-warning/25 bg-warning/8 px-2 py-1 text-[10px] leading-4 text-warning"><LuCircleAlert aria-hidden="true" />{warningText(warning)}</span>)}</div>
          {preview.executable ? <p className="flex items-start gap-2 text-[11px] leading-5 text-success"><LuShieldCheck className="mt-0.5 shrink-0" aria-hidden="true" />{t("repairSafePlan")}</p> : <p role="alert" className="text-[11px] leading-5 text-destructive">{t("repairNotExecutable")}</p>}
          <label className="flex min-h-11 cursor-pointer items-start gap-2 rounded-lg border border-border/60 p-2.5 text-xs leading-5"><input type="checkbox" checked={confirmed} disabled={!preview.executable || busy !== null} onChange={(event) => setConfirmed(event.target.checked)} className="mt-1 h-4 w-4 accent-primary" /><span>{preview.estimatedCost.min == null ? t("repairConfirmUnknownCost") : t("repairConfirmCost", { price: preview.estimatedCost.min.toFixed(3) })}</span></label>
          <Button type="button" className="h-11 w-full" disabled={!confirmed || !preview.executable || busy !== null} onClick={() => void execute()}>{busy === "execute" ? <LuLoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <LuWandSparkles aria-hidden="true" />}{busy === "execute" ? t("repairExecuting") : t("repairConfirmExecute")}</Button>
        </div>}
        <p role={message && !preview ? "alert" : "status"} aria-live="polite" className="min-h-5 text-[11px] leading-5 text-muted-foreground">{message}</p>
      </div>
    </details>
  );
}
