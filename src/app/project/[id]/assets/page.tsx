"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import { LuArrowLeft, LuZap, LuCheck, LuCircleX, LuImage, LuArrowRight, LuLoaderCircle, LuTriangleAlert, LuUpload } from "react-icons/lu";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useSettingsStore } from "@/lib/stores/settings-store";
import { mergeCustomModels, buildImageOptions, buildVideoOptions } from "@/lib/gen-params";
import type { Shot } from "@/lib/db/schema";
import { buildAssetRows, shouldOfferStockFill, needsImageModelWarning, nextChainKeyframe, type AssetItem } from "@/lib/assets-view";
import { realMixFromRows, shotReality } from "@/lib/real-mix";
import { buildMotionPrompt } from "@/lib/motion-prompt";
import {
  CAMERA_PRESETS,
  CAMERA_PRESET_CATEGORIES,
  getCameraPreset,
  cameraPresetPrompt,
  recommendedPresets,
  findPresetByPrompt,
  mixablePresets,
  mixCameraPrompt,
  type CameraPresetCategory,
} from "@/lib/camera-presets";
import { LOOK_PRESETS, getLookPreset, lookImageSuffix } from "@/lib/look-presets";
import { realFaceLine } from "@/lib/presenters";
import { modelSupportsLastFrame } from "@/lib/video-composer/transitions";
import { useT, useLocale } from "@/lib/i18n";
import { LanguageToggle } from "@/components/language-toggle";
import { ProjectStepper } from "@/components/project-stepper";

// shot type labels (label changed to i18n key in the assets namespace, resolved per locale)
const shotTypeLabels: Record<Shot["type"], { key: string; color: string }> = {
  hook: { key: "shotTypeHook", color: "bg-red-500/20 text-red-400" },
  pain_point: { key: "shotTypePainPoint", color: "bg-orange-500/20 text-orange-400" },
  product_reveal: { key: "shotTypeProductReveal", color: "bg-blue-500/20 text-blue-400" },
  demo: { key: "shotTypeDemo", color: "bg-green-500/20 text-green-400" },
  social_proof: { key: "shotTypeSocialProof", color: "bg-purple-500/20 text-purple-400" },
  cta: { key: "shotTypeCta", color: "bg-amber-500/20 text-amber-400" },
};

// platform info for the default image model (used when initiating generation requests)
interface ImageModelTarget {
  provider: string;
  model: string;
  apiKey: string;
  baseUrl?: string;
}

// persisted cloud AI task row (from /api/ai/tasks, issue #16 recovery flow)
interface PendingAiTask {
  id: string;
  shotId: number | null;
  provider: string;
  model: string;
  taskId: string;
  status: "submitted" | "processing" | "completed" | "failed" | "unknown";
}

// shot types that "feature the product": when product fidelity is enabled, these AI shots use image-to-image (redraw with product photo to lock in the subject)
const PRODUCT_SHOT_TYPES = new Set(["product_reveal", "demo", "cta"]);

// map a text-to-image model to its corresponding edit / image-to-image variant (product fidelity redraw)
function toEditVariant(modelId: string): string {
  if (modelId === "openai/gpt-image-2") return "openai/gpt-image-2/image-to-image";
  if (modelId === "fal-ai/gpt-image-1.5") return "fal-ai/gpt-image-1.5/edit";
  // Replicate FLUX text-to-image → Kontext edit model
  if (modelId.startsWith("black-forest-labs/flux") && !modelId.includes("kontext")) {
    return "black-forest-labs/flux-kontext-pro";
  }
  // other models (Seedream / Tongyi Wanxiang, etc.) mostly support reference-image image-to-image natively, keep the original model
  return modelId;
}

export default function AssetsPage() {
  const t = useT("assets");
  const tc = useT("common");
  const locale = useLocale();
  const { id } = useParams<{ id: string }>();
  const { providers, defaultImageModel, defaultVideoModel, customModels, imageParams, videoParams, llm, motionIntensity, setMotionIntensity, visualLook, setVisualLook } = useSettingsStore();

  const [assets, setAssets] = useState<AssetItem[]>([]);
  const [productImages, setProductImages] = useState<string[]>([]);
  // product fidelity: when AI generates shots featuring the product, use the original product photo as a reference for redrawing to prevent AI from altering the product (critical for commerce)
  const [productSafe, setProductSafe] = useState(true);
  // after image generation, automatically run image-to-video to produce real motion shots (i2v quality path, replacing fake Ken-Burns camera moves). Only active when a video model is configured.
  const [autoMotion, setAutoMotion] = useState(true);
  const [projectName, setProjectName] = useState("");
  // project type: topic (one-sentence-to-video without a product) uses the free stock library for automatic visuals
  const [contentType, setContentType] = useState<string>("");
  const [modelTarget, setModelTarget] = useState<ImageModelTarget | null>(null);
  const [videoModelTarget, setVideoModelTarget] = useState<ImageModelTarget | null>(null);
  // shots currently being converted to motion
  const [motionShots, setMotionShots] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isBatchGenerating, setIsBatchGenerating] = useState(false);
  // state for "auto-fill visuals (free stock)" feature
  const [isFillingStock, setIsFillingStock] = useState(false);
  const [stockMsg, setStockMsg] = useState<string | null>(null);
  // cloud paid tasks with unretrieved results (issue #16): submitted/processing/unknown rows
  // persisted server-side the moment the provider acknowledged the task
  const [pendingTasks, setPendingTasks] = useState<PendingAiTask[]>([]);
  const [resumingTasks, setResumingTasks] = useState<Set<string>>(new Set());
  const [taskMsg, setTaskMsg] = useState<string | null>(null);
  // per-shot camera editing (preset picker + inline free text): edits persist into the
  // selected script's shots via the scripts PATCH, so the next (re)generation uses them
  const [scriptId, setScriptId] = useState<string>("");
  const [editingCameraShot, setEditingCameraShot] = useState<number | null>(null);
  const [cameraDraft, setCameraDraft] = useState("");
  const [savingCameraShot, setSavingCameraShot] = useState<number | null>(null);
  // storyboard grid: one generation renders all shots in a 3x3 grid → cells become keyframes
  const [isGridGenerating, setIsGridGenerating] = useState(false);
  const [gridNotice, setGridNotice] = useState<string | null>(null);

  const doneCount = assets.filter((a) => a.status === "done").length;
  const allDone = assets.length > 0 && doneCount === assets.length;
  // real/AI mix metering (duration-weighted) — Douyin tilts traffic toward hybrid content at ≥50% real
  const mix = realMixFromRows(assets);
  // when no image model is configured (modelTarget is null), offer key-free users a free stock fill entry point
  const offerStockFill = !loading && shouldOfferStockFill(assets, contentType, modelTarget !== null);
  // only show the "configure a model" warning when there are still AI shots that need generating (no warning once everything is ready, to avoid contradicting the "all done" state)
  const showModelWarning = !loading && needsImageModelWarning(assets, modelTarget !== null);

  // load real data: project info + selected script shots + resolve the provider for the default image model
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const [projectRes, scriptsRes, assetsRes] = await Promise.all([
          fetch(`/api/project/${id}`),
          fetch(`/api/project/${id}/scripts`),
          fetch(`/api/project/${id}/assets`),
        ]);

        const project = projectRes.ok ? await projectRes.json() : null;
        const scripts = scriptsRes.ok ? await scriptsRes.json() : [];
        const savedAssets = assetsRes.ok ? await assetsRes.json() : [];
        if (cancelled) return;

        const imgs: string[] = project && Array.isArray(project.productImages) ? project.productImages : [];
        if (project) {
          setProjectName(project.name ?? project.productName ?? "");
          setProductImages(imgs);
          setContentType(typeof project.contentType === "string" ? project.contentType : "");
        }

        // use the selected script (fall back to the first one if none is marked selected)
        const selected = Array.isArray(scripts)
          ? scripts.find((s: { selected?: boolean }) => s.selected) ?? scripts[0]
          : null;

        if (!selected || !Array.isArray(selected.shots) || selected.shots.length === 0) {
          setAssets([]);
          setLoadError(t("errorNoScript"));
          return;
        }
        // remember which script row the view came from — camera edits PATCH back into it
        setScriptId(typeof selected.id === "string" ? selected.id : "");

        // selected script shots + persisted assets → view rows (shared pure function used by "refresh after filling visuals")
        setAssets(buildAssetRows(selected.shots as Shot[], Array.isArray(savedAssets) ? savedAssets : [], imgs));
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : t("errorLoadFailed"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  // re-fetch project / scripts / assets and rebuild view rows (refresh thumbnails after filling visuals, reuses the same pure function)
  const reloadAssets = useCallback(async () => {
    const [projectRes, scriptsRes, assetsRes] = await Promise.all([
      fetch(`/api/project/${id}`),
      fetch(`/api/project/${id}/scripts`),
      fetch(`/api/project/${id}/assets`),
    ]);
    const project = projectRes.ok ? await projectRes.json() : null;
    const scripts = scriptsRes.ok ? await scriptsRes.json() : [];
    const savedAssets = assetsRes.ok ? await assetsRes.json() : [];
    const imgs: string[] = project && Array.isArray(project.productImages) ? project.productImages : [];
    const selected = Array.isArray(scripts)
      ? scripts.find((s: { selected?: boolean }) => s.selected) ?? scripts[0]
      : null;
    if (selected && Array.isArray(selected.shots)) {
      setScriptId(typeof selected.id === "string" ? selected.id : "");
      setAssets(buildAssetRows(selected.shots as Shot[], Array.isArray(savedAssets) ? savedAssets : [], imgs));
    }
  }, [id]);

  // persist a per-shot camera edit into the selected script (scripts PATCH whitelists `camera`),
  // then mirror it into the view rows so the next generateMotion call picks it up immediately
  const saveCamera = useCallback(
    async (shotId: number, text: string) => {
      const trimmed = text.trim();
      setEditingCameraShot(null);
      const current = assets.find((a) => a.shotId === shotId);
      if (!scriptId || trimmed === (current?.camera ?? "")) return;
      setSavingCameraShot(shotId);
      try {
        const res = await fetch(`/api/project/${id}/scripts`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scriptId, shotTexts: [{ shotId, camera: trimmed }] }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error || t("cameraSaveFailed"));
        }
        setAssets((prev) => prev.map((a) => (a.shotId === shotId ? { ...a, camera: trimmed || undefined } : a)));
      } catch (e) {
        setAssets((prev) =>
          prev.map((a) => (a.shotId === shotId ? { ...a, error: e instanceof Error ? e.message : t("cameraSaveFailed") } : a))
        );
      } finally {
        setSavingCameraShot(null);
      }
    },
    [assets, scriptId, id, t]
  );

  // apply a named camera preset (Higgsfield-style one-click move) — sentence language follows the script
  const applyCameraPreset = useCallback(
    (shotId: number, presetId: string) => {
      const preset = getCameraPreset(presetId);
      const asset = assets.find((a) => a.shotId === shotId);
      if (!preset || !asset) return;
      void saveCamera(shotId, cameraPresetPrompt(preset, `${asset.camera ?? ""}${asset.description ?? ""}`));
    },
    [assets, saveCamera]
  );

  // Higgsfield-Mix-style overlay: combine the currently applied preset with a second one.
  // Only offered while the camera text exactly equals a preset sentence — after mixing it
  // no longer does, which naturally caps the stack at two moves.
  const applyCameraMix = useCallback(
    (shotId: number, basePresetId: string, overlayPresetId: string) => {
      const base = getCameraPreset(basePresetId);
      const overlay = getCameraPreset(overlayPresetId);
      const asset = assets.find((a) => a.shotId === shotId);
      if (!base || !overlay || !asset) return;
      const mixed = mixCameraPrompt(base, overlay, `${asset.camera ?? ""}${asset.description ?? ""}`);
      if (mixed) void saveCamera(shotId, mixed);
    },
    [assets, saveCamera]
  );

  // one-click "auto-fill visuals (free stock)": pull visuals from the free stock library (keyless Openverse images) shot-by-shot using search terms.
  // no image generation key required — this is the key step in the zero-barrier "one-sentence topic video" closed loop.
  // per-shot local image/video upload: a single hidden input, click sets the target shot; onChange uploads
  // then persists as that shot's asset. This unblocks user_upload shots (which had no action = dead end)
  // and lets users replace an AI/stock visual with their own footage.
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const pendingUploadShot = useRef<number | null>(null);
  const [uploadingShot, setUploadingShot] = useState<number | null>(null);
  const openUploadFor = (shotId: number) => {
    pendingUploadShot.current = shotId;
    uploadInputRef.current?.click();
  };
  const onUploadFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const shotId = pendingUploadShot.current;
    e.target.value = ""; // allow re-picking the same file later
    if (!file || shotId == null) return;
    setUploadingShot(shotId);
    try {
      const fd = new FormData();
      fd.append("files", file);
      fd.append("projectId", id);
      const up = await fetch("/api/upload", { method: "POST", body: fd });
      const upData = await up.json().catch(() => ({}));
      if (!up.ok || !upData.paths?.[0]) throw new Error(upData.error || t("uploadFailed"));
      const res = await fetch(`/api/project/${id}/assets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shotId, sourceUrl: upData.paths[0], type: "user_upload" }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || t("uploadFailed")); }
      await reloadAssets();
    } catch (err) {
      setStockMsg(err instanceof Error ? err.message : t("uploadFailed"));
    } finally {
      setUploadingShot(null);
      pendingUploadShot.current = null;
    }
  };

  const fillStock = useCallback(async () => {
    if (isFillingStock) return;
    setIsFillingStock(true);
    setStockMsg(null);
    try {
      const res = await fetch(`/api/project/${id}/stock-fill`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // free sources are primarily Openverse images (video sources require a Pexels/Pixabay key, to be integrated in settings later)
        // llmConfig opt-in: semantic rerank picks the best-matching footage per shot (heuristic fallback inside the route)
        body: JSON.stringify({
          source: "all",
          mediaType: "image",
          ...(llm.baseUrl && llm.model ? { llmConfig: { baseUrl: llm.baseUrl, apiKey: llm.apiKey, model: llm.model } } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || t("stockFillFailed"));
      await reloadAssets();
      setStockMsg(
        t("stockFilledMsg", { filled: data.filled ?? 0, total: data.total ?? 0 }) +
          (data.sameSourceHits ? t("stockSameSourceMsg", { n: data.sameSourceHits }) : "")
      );
    } catch (e) {
      setStockMsg(e instanceof Error ? e.message : t("stockFillFailed"));
    } finally {
      setIsFillingStock(false);
    }
  }, [id, isFillingStock, reloadAssets, t, llm.baseUrl, llm.apiKey, llm.model]);

  // resolve the provider for the default image model (locate provider by model from /api/ai/models aggregated results)
  useEffect(() => {
    let cancelled = false;
    const enabled = Object.entries(providers)
      .filter(([, p]) => p.enabled && p.apiKey)
      .map(([name, p]) => ({ name, apiKey: p.apiKey, baseUrl: p.baseUrl }));
    if (enabled.length === 0 || !defaultImageModel) {
      setModelTarget(null);
      return;
    }
    (async () => {
      try {
        const res = await fetch("/api/ai/models", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ providers: enabled, mediaType: "image" }),
        });
        if (!res.ok) return;
        const data = await res.json();
        // merge user-defined custom models so they can also be resolved to their provider
        const merged = mergeCustomModels(data.models ?? [], customModels, "image", new Set(enabled.map((e) => e.name)));
        const model = merged.find((m) => m.id === defaultImageModel);
        if (cancelled || !model) return;
        const prov = enabled.find((e) => e.name === model.provider);
        if (prov) {
          setModelTarget({ provider: prov.name, model: defaultImageModel, apiKey: prov.apiKey, baseUrl: prov.baseUrl });
        }
      } catch {
        // ignore; generateOne will surface the "not configured" error when called
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [providers, defaultImageModel, customModels]);

  // resolve the provider for the default video model (used for "convert to motion shot")
  useEffect(() => {
    let cancelled = false;
    const enabled = Object.entries(providers)
      .filter(([, p]) => p.enabled && p.apiKey)
      .map(([name, p]) => ({ name, apiKey: p.apiKey, baseUrl: p.baseUrl }));
    if (enabled.length === 0 || !defaultVideoModel) {
      setVideoModelTarget(null);
      return;
    }
    (async () => {
      try {
        const res = await fetch("/api/ai/models", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ providers: enabled, mediaType: "video" }),
        });
        if (!res.ok) return;
        const data = await res.json();
        // merge user-defined custom video models
        const merged = mergeCustomModels(data.models ?? [], customModels, "video", new Set(enabled.map((e) => e.name)));
        const model = merged.find((m) => m.id === defaultVideoModel);
        if (cancelled || !model) return;
        const prov = enabled.find((e) => e.name === model.provider);
        if (prov) {
          setVideoModelTarget({ provider: prov.name, model: defaultVideoModel, apiKey: prov.apiKey, baseUrl: prov.baseUrl });
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [providers, defaultVideoModel, customModels]);

  // load cloud tasks whose results were never retrieved (issue #16) so the user can
  // recover a paid task instead of resubmitting (and paying again)
  const reloadPendingTasks = useCallback(async () => {
    try {
      const res = await fetch(`/api/ai/tasks?projectId=${id}&active=1`);
      if (!res.ok) return;
      const rows = await res.json();
      if (Array.isArray(rows)) setPendingTasks(rows);
    } catch {
      // recovery UI is best-effort; never block the page on it
    }
  }, [id]);

  useEffect(() => {
    reloadPendingTasks();
  }, [reloadPendingTasks]);

  // save a generated video as the shot's asset (shared by the normal flow and task recovery).
  // keyframeUrl = the static first frame the i2v ran from: persisted as thumbnailPath so the
  // keyframe survives the upsert — it powers the per-shot motion re-run and keyframe chaining
  const saveVideoAsset = useCallback(
    async (shotId: number, url: string, prompt: string | undefined, provider: string, model: string, keyframeUrl?: string) => {
      const saveRes = await fetch(`/api/project/${id}/assets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shotId, type: "ai_generate", sourceUrl: url, prompt, provider, model,
          ...(keyframeUrl && { thumbnailPath: keyframeUrl }),
        }),
      });
      let savedUrl = url;
      if (saveRes.ok) {
        const saved = await saveRes.json();
        if (saved.filePath) savedUrl = saved.filePath;
      }
      setAssets((prev) =>
        prev.map((a) =>
          a.shotId === shotId
            ? { ...a, status: "done", thumbnailUrl: keyframeUrl ?? savedUrl, isVideo: true, keyframeUrl, error: undefined }
            : a
        )
      );
    },
    [id]
  );

  // resume a persisted cloud task: query (and wait for) its status, then save the result
  const resumeTask = useCallback(
    async (task: PendingAiTask) => {
      const prov = providers[task.provider];
      if (!prov?.apiKey) {
        setTaskMsg(t("errorNoVideoModel"));
        return;
      }
      setResumingTasks((prev) => new Set(prev).add(task.id));
      setTaskMsg(null);
      try {
        const res = await fetch("/api/ai/video/task", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: task.provider,
            apiKey: prov.apiKey,
            baseUrl: prov.baseUrl,
            taskId: task.taskId,
            wait: true,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || t("taskResumeFailed"));
        if (data.status === "completed" && data.videoUrls?.[0]) {
          if (task.shotId != null) {
            const asset = assets.find((a) => a.shotId === task.shotId);
            // best-effort keyframe provenance: the task was submitted from the shot's static frame
            const keyframe = asset && !asset.isVideo ? asset.thumbnailUrl : asset?.keyframeUrl;
            await saveVideoAsset(task.shotId, data.videoUrls[0], asset?.prompt, task.provider, task.model, keyframe);
          }
          setTaskMsg(t("taskResumeDone"));
        } else if (data.status === "failed" || data.status === "cancelled") {
          setTaskMsg(`${t("taskResumeFailed")}${data.error ? `: ${data.error}` : ""}`);
        } else {
          setTaskMsg(t("taskResumeProcessing"));
        }
        await reloadPendingTasks();
      } catch (e) {
        setTaskMsg(e instanceof Error ? e.message : t("taskResumeFailed"));
      } finally {
        setResumingTasks((prev) => {
          const next = new Set(prev);
          next.delete(task.id);
          return next;
        });
      }
    },
    [providers, assets, saveVideoAsset, reloadPendingTasks, t]
  );

  // convert to motion shot: use the already-generated image for this shot as the first frame, call the image-to-video model, and save the result as the shot's asset (video).
  // Keyframe chaining (Dreamina-style): when the next shot's static keyframe exists and the model
  // supports a pinned last frame, the clip ends by flowing into the next scene — the transition is
  // generated inside the clip, and the composer's hard concat becomes seamless.
  const generateMotion = useCallback(
    async (shotId: number, firstFrameOverride?: string, lastFrameOverride?: string | null) => {
      const asset = assets.find((a) => a.shotId === shotId);
      // prefer the freshly passed URL for the first frame: during auto-chaining React state hasn't updated yet, so the thumbnailUrl in the closure is stale
      const firstFrame = firstFrameOverride || asset?.thumbnailUrl;
      if (!firstFrame) return;
      if (!videoModelTarget) {
        setAssets((prev) =>
          prev.map((a) => (a.shotId === shotId ? { ...a, error: t("errorNoVideoModel") } : a))
        );
        return;
      }
      // chain target: explicit override wins (null = explicitly no chain); otherwise the next shot's static keyframe
      const chainFrame =
        lastFrameOverride === null || !modelSupportsLastFrame(videoModelTarget.model)
          ? undefined
          : lastFrameOverride ?? nextChainKeyframe(assets, shotId);
      setMotionShots((prev) => new Set(prev).add(shotId));
      // Motion prompt, not the static image prompt: the first frame already fixes the
      // composition — the text's job is camera path + subject action + fidelity constraints
      const motionPrompt = buildMotionPrompt({
        shotType: asset?.type,
        camera: asset?.camera,
        description: asset?.description,
        productShot: asset?.visualSource === "product_image" || PRODUCT_SHOT_TYPES.has(asset?.type ?? ""),
        chainToNext: !!chainFrame,
        intensity: motionIntensity,
        personShot: !!asset?.characterId,
        // a character WITH a line is a talking shot: mid-conversation direction + rotating
        // behavior beats (seeded by shot position so a batch never repeats the same gestures)
        talking: !!asset?.characterId && !!asset?.voiceover?.trim(),
        beatSeed: assets.findIndex((a) => a.shotId === shotId),
        // global look: short lighting anchor keeps the palette from drifting through the i2v pass
        look: getLookPreset(visualLook)?.motion,
      });
      // per-shot duration: the composer's slot follows the script duration (voice-fitted), and the
      // composer trims overshoot from the TAIL — which would cut a chained ending. Round to the
      // model's supported range instead of always sending the global 5s default.
      const videoOptions = buildVideoOptions(videoParams);
      if (asset?.duration) {
        videoOptions.duration = Math.min(15, Math.max(4, Math.round(asset.duration)));
      }
      try {
        const res = await fetch("/api/ai/video", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: videoModelTarget.provider,
            model: videoModelTarget.model,
            apiKey: videoModelTarget.apiKey,
            baseUrl: videoModelTarget.baseUrl,
            mode: "image-to-video",
            prompt: motionPrompt,
            imageUrl: firstFrame,
            ...(chainFrame && { lastImageUrl: chainFrame }),
            // issue #16: identify the task server-side so the paid task ID is persisted
            // against this project/shot and stays recoverable after timeout or restart
            projectId: id,
            shotId,
            // user-defined video parameters (aspect ratio / resolution / duration / frame rate / motion / seed / negative prompt)
            options: videoOptions,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          // the paid task may already exist in the cloud — surface its ID and the recovery
          // path instead of a bare failure that invites a duplicate (billed) resubmit
          if (data.taskId) {
            await reloadPendingTasks();
            throw new Error(
              t("errorWithTaskId", { msg: data.error || t("errorImageToVideoFailed"), taskId: data.taskId })
            );
          }
          throw new Error(data.error || t("errorImageToVideoFailed"));
        }
        const url = data.videoUrls?.[0];
        if (!url) throw new Error(t("errorEmptyResult"));
        // save as this shot's asset (video will be downloaded locally); compose processes it as a video clip (including native audio track detection).
        // Persist the motion prompt actually sent AND the source keyframe (provenance + re-run/chaining)
        await saveVideoAsset(shotId, url, motionPrompt, videoModelTarget.provider, data.modelId || videoModelTarget.model, firstFrame);
      } catch (e) {
        setAssets((prev) =>
          prev.map((a) => (a.shotId === shotId ? { ...a, error: e instanceof Error ? e.message : t("errorImageToVideoFailed") } : a))
        );
      } finally {
        setMotionShots((prev) => {
          const next = new Set(prev);
          next.delete(shotId);
          return next;
        });
      }
    },
    [assets, videoModelTarget, id, videoParams, motionIntensity, visualLook, saveVideoAsset, reloadPendingTasks, t]
  );

  // actually generate a single asset. Returns the saved static keyframe URL (undefined on failure) so
  // the batch flow can run a second keyframe-chained motion pass without re-reading stale React state.
  const generateOne = useCallback(
    async (shotId: number, opts?: { skipMotion?: boolean }): Promise<string | undefined> => {
      const asset = assets.find((a) => a.shotId === shotId);
      if (!asset) return undefined;

      // product image shot: use the product photo directly, no AI call needed (persisted for the composer to read)
      if (asset.visualSource === "product_image") {
        setAssets((prev) =>
          prev.map((a) =>
            a.shotId === shotId ? { ...a, status: "done", thumbnailUrl: productImages[0] } : a
          )
        );
        if (productImages[0]) {
          fetch(`/api/project/${id}/assets`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ shotId, type: "product_image", sourceUrl: productImages[0] }),
          }).catch(() => {});
          // auto motion: use the product image as the first frame and run image-to-video (bring the real product to life); falls back to a static image on failure
          if (!opts?.skipMotion && autoMotion && videoModelTarget) await generateMotion(shotId, productImages[0]);
        }
        return productImages[0];
      }

      // AI-generated shot: requires a default image model to be configured
      if (!modelTarget) {
        setAssets((prev) =>
          prev.map((a) =>
            a.shotId === shotId
              ? { ...a, status: "failed", error: t("errorNoImageModel") }
              : a
          )
        );
        return undefined;
      }

      setAssets((prev) => prev.map((a) => (a.shotId === shotId ? { ...a, status: "generating", error: undefined } : a)));

      // product fidelity: AI shot featuring product + product image available + toggle on → redraw with product image (image-to-image, locks in the product subject)
      const useProductSafe =
        productSafe && !!productImages[0] && PRODUCT_SHOT_TYPES.has(asset.type);
      const genModel = useProductSafe ? toEditVariant(modelTarget.model) : modelTarget.model;
      const genMode = useProductSafe ? "image-to-image" : "text-to-image";
      const basePrompt = asset.prompt || asset.description;
      // cast shots: pin the anti-"AI face" realism constraint onto the keyframe too,
      // so the person is ordinary-looking from the very first frame the i2v runs on
      const castSuffix = asset.characterId ? `。${realFaceLine(basePrompt)}` : "";
      // global look: one lighting/palette block across every keyframe keeps shots in one video
      // from drifting between styles (the LLM improvises style words per shot otherwise)
      const lookText = lookImageSuffix(visualLook, basePrompt);
      const lookSuffix = lookText ? `。${lookText}` : "";
      const genPrompt = useProductSafe
        ? `${basePrompt}。严格保持商品的外观、包装、颜色、logo 和文字完全不变，只重绘符合描述的场景、背景与光线。${castSuffix}${lookSuffix}`
        : `${basePrompt}${castSuffix}${lookSuffix}`;

      try {
        const res = await fetch("/api/ai/image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: modelTarget.provider,
            model: genModel,
            apiKey: modelTarget.apiKey,
            baseUrl: modelTarget.baseUrl,
            mode: genMode,
            prompt: genPrompt,
            ...(useProductSafe && { imageUrl: productImages[0] }),
            // user-defined image parameters (aspect ratio → dimensions / count / steps / guidance / seed / negative prompt)
            options: buildImageOptions(imageParams),
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || t("errorGenerateFailed"));
        const url = data.imageUrls?.[0];
        if (!url) throw new Error(t("errorEmptyResult"));
        // persist to database (remote images will be downloaded locally) so the composer can read the real AI asset
        let savedUrl = url;
        try {
          const saveRes = await fetch(`/api/project/${id}/assets`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              shotId, type: "ai_generate", sourceUrl: url,
              prompt: asset.prompt, provider: modelTarget.provider, model: genModel,
            }),
          });
          if (saveRes.ok) {
            const saved = await saveRes.json();
            if (saved.filePath) savedUrl = saved.filePath;
          }
        } catch {
          // persist failure doesn't affect the preview (the composer will fall back to the product image as a safety net)
        }
        setAssets((prev) =>
          prev.map((a) => (a.shotId === shotId ? { ...a, status: "done", thumbnailUrl: savedUrl } : a))
        );
        // auto motion: use the freshly generated image as the first frame and run image-to-video (real camera moves replace fake Ken-Burns); falls back to static image on failure
        if (!opts?.skipMotion && autoMotion && videoModelTarget) await generateMotion(shotId, savedUrl);
        return savedUrl;
      } catch (e) {
        setAssets((prev) =>
          prev.map((a) =>
            a.shotId === shotId ? { ...a, status: "failed", error: e instanceof Error ? e.message : t("errorGenerateFailed") } : a
          )
        );
        return undefined;
      }
    },
    [assets, modelTarget, productImages, productSafe, imageParams, autoMotion, videoModelTarget, visualLook, generateMotion]
  );

  // storyboard grid: ONE image generation renders every shot as a 3x3 grid cell (person /
  // outfit / room / light physically identical), the server crops cells into per-shot
  // keyframes — then the normal per-shot "animate" i2v pass takes over
  const runStoryboardGrid = useCallback(async () => {
    if (!modelTarget || !scriptId || isGridGenerating) return;
    setIsGridGenerating(true);
    setGridNotice(null);
    try {
      const res = await fetch(`/api/project/${id}/storyboard-grid`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scriptId,
          provider: modelTarget.provider,
          model: modelTarget.model,
          apiKey: modelTarget.apiKey,
          baseUrl: modelTarget.baseUrl,
          // the grid itself is 9:16 so each of the 3x3 cells is exactly 9:16 too
          options: buildImageOptions(imageParams ? { ...imageParams, aspectRatio: "9:16", count: 1 } : undefined),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("gridFailed"));
      await reloadAssets();
      setGridNotice(t("gridDone").replace("{n}", String(data.count ?? "")));
    } catch (e) {
      setGridNotice(e instanceof Error ? e.message : t("gridFailed"));
    } finally {
      setIsGridGenerating(false);
    }
  }, [id, scriptId, modelTarget, imageParams, isGridGenerating, reloadAssets, t]);

  // generate all in one click (sequential, to avoid hitting platform rate limits with concurrent requests).
  // With auto-motion on, this runs TWO passes: (1) every static keyframe, (2) keyframe-chained i2v per shot —
  // chaining needs the NEXT shot's keyframe to exist, which a single interleaved pass can't provide.
  const generateAll = useCallback(async () => {
    const pending = assets.filter((a) => a.status === "pending" || a.status === "failed");
    if (pending.length === 0) return;
    setIsBatchGenerating(true);
    const chained = autoMotion && !!videoModelTarget;
    // freshly saved keyframes by shot — React state in this closure is stale during the loop
    const savedByShot = new Map<number, string>();
    for (const asset of pending) {
      const url = await generateOne(asset.shotId, { skipMotion: chained });
      if (url) savedByShot.set(asset.shotId, url);
    }
    if (chained) {
      // pass 2: i2v in script order; each shot chains into the next shot's keyframe when available.
      // Existing static keyframes (generated in earlier sessions) participate too.
      const staticFrameOf = (a: AssetItem): string | undefined =>
        savedByShot.get(a.shotId) ?? (a.status === "done" && !a.isVideo ? a.thumbnailUrl : undefined);
      for (let i = 0; i < assets.length; i++) {
        const row = assets[i];
        if (row.isVideo) continue; // already a motion/stock video — don't re-bill
        const firstFrame = staticFrameOf(row);
        if (!firstFrame) continue;
        const next = assets[i + 1];
        const lastFrame = next ? staticFrameOf(next) : undefined;
        // null = explicitly no chain (last shot / next frame unavailable)
        await generateMotion(row.shotId, firstFrame, lastFrame ?? null);
      }
    }
    setIsBatchGenerating(false);
  }, [assets, generateOne, generateMotion, autoMotion, videoModelTarget]);

  return (
    <div className="min-h-screen grid-bg">
      {/* top navigation */}
      <header className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg brand-gradient">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="23 7 16 12 23 17 23 7" />
                  <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                </svg>
              </div>
              <span className="text-lg font-bold tracking-tight">ClipForge</span>
            </Link>
            <span className="text-muted-foreground">/</span>
            <span className="text-sm text-muted-foreground truncate max-w-[20vw] sm:max-w-xs">{projectName || t("untitledProject")}</span>
          </div>

          {/* step progress: clickable pills (mobile shows a compact badge inside the component) */}
          <div className="flex items-center gap-1">
            <LanguageToggle className="mr-1" />
            <ProjectStepper />
          </div>
        </div>
      </header>

      {/* single hidden input reused for every per-shot upload; target shot tracked in pendingUploadShot */}
      <input
        ref={uploadInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onUploadFileChange}
      />

      <main className="mx-auto max-w-4xl px-6 py-8">
        {/* action bar: wraps on mobile so the button cluster never overflows the viewport */}
        <div className="flex flex-wrap items-center justify-between gap-y-3 mb-6">
          <div>
            <h2 className="text-lg font-semibold">{t("title")}</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {loading ? tc("loading") : t("assetsReady", { done: doneCount, total: assets.length })}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {productImages.length > 0 && (
              <button
                type="button"
                onClick={() => setProductSafe((v) => !v)}
                title={t("productSafeTip")}
                className={`flex items-center gap-1.5 rounded-full border px-3 h-8 text-xs font-medium transition-all ${
                  productSafe
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border/60 bg-muted/20 text-muted-foreground"
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${productSafe ? "bg-primary" : "bg-muted-foreground/40"}`} />
                {t("productSafe")}{productSafe ? t("on") : t("off")}
              </button>
            )}
            {/* Visual-look picker (Higgsfield Cinema Studio-style enumerated lighting/palette
                panel): applies to keyframe image prompts AND pins lighting through the i2v pass */}
            <div
              className="flex items-center gap-1 rounded-full border border-border/60 bg-muted/20 pl-2.5 pr-1.5 h-8"
              title={t("lookTip")}
            >
              <span className="text-xs font-medium text-muted-foreground">{t("lookLabel")}</span>
              <select
                value={visualLook}
                onChange={(e) => setVisualLook(e.target.value)}
                className="bg-transparent text-xs outline-none h-6 max-w-28 text-foreground"
              >
                <option value="none">{t("lookNone")}</option>
                {LOOK_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {locale === "zh" ? p.name.zh : p.name.en}
                  </option>
                ))}
              </select>
            </div>
            {videoModelTarget && (
              <div
                className="flex items-center gap-0.5 rounded-full border border-border/60 bg-muted/20 pl-2.5 pr-1 h-8"
                title={t("motionIntensityTip")}
              >
                <span className="text-xs font-medium text-muted-foreground mr-1">{t("motionIntensity")}</span>
                {(["subtle", "normal", "strong"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setMotionIntensity(v)}
                    className={`rounded-full px-2 h-6 text-xs font-medium transition-all ${
                      motionIntensity === v
                        ? "bg-primary/15 text-primary"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {t(`motionIntensity_${v}`)}
                  </button>
                ))}
              </div>
            )}
            {videoModelTarget && (
              <button
                type="button"
                onClick={() => setAutoMotion((v) => !v)}
                title={t("autoMotionTip")}
                className={`flex items-center gap-1.5 rounded-full border px-3 h-8 text-xs font-medium transition-all ${
                  autoMotion
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border/60 bg-muted/20 text-muted-foreground"
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${autoMotion ? "bg-primary" : "bg-muted-foreground/40"}`} />
                {t("autoMotion")}{autoMotion ? t("on") : t("off")}
              </button>
            )}
            <Link href={`/project/${id}/script`}>
              <Button variant="outline" size="sm" className="text-xs">
                <LuArrowLeft className="w-3.5 h-3.5 mr-1" />
                {t("backToScript")}
              </Button>
            </Link>
            {offerStockFill && (
              <Button
                onClick={fillStock}
                disabled={isFillingStock}
                variant="outline"
                size="sm"
                className="text-xs border-primary/50 text-primary hover:bg-primary/10"
                title={t("stockFillHint")}
              >
                {isFillingStock ? (
                  <>
                    <LuLoaderCircle className="animate-spin w-3.5 h-3.5 mr-1" />
                    {t("stockFilling")}
                  </>
                ) : (
                  <>
                    <LuImage className="w-3.5 h-3.5 mr-1" />
                    {t("stockFill")}
                  </>
                )}
              </Button>
            )}
            {modelTarget && assets.length >= 2 && assets.length <= 9 && (
              <Button
                onClick={runStoryboardGrid}
                disabled={isGridGenerating || isBatchGenerating}
                variant="outline"
                className="text-xs"
                title={t("gridTip")}
              >
                {isGridGenerating ? (
                  <>
                    <LuLoaderCircle className="animate-spin mr-1.5 h-3.5 w-3.5" />
                    {t("gridRunning")}
                  </>
                ) : (
                  <>{t("gridButton")}</>
                )}
              </Button>
            )}
            <Button
              onClick={generateAll}
              disabled={isBatchGenerating || allDone || assets.length === 0}
              className="brand-gradient text-white text-xs"
            >
              {isBatchGenerating ? (
                <>
                  <LuLoaderCircle className="animate-spin mr-1.5 h-3.5 w-3.5" />
                  {t("generatingAll")}
                </>
              ) : allDone ? (
                t("allDone")
              ) : (
                <>
                  <LuZap className="w-3.5 h-3.5 mr-1" />
                  {t("generateAll")}
                </>
              )}
            </Button>
          </div>
        </div>

        {/* storyboard-grid outcome line (success count or error) */}
        {gridNotice && (
          <div className="mb-4 rounded-lg border border-border bg-muted/40 px-4 py-2.5 text-xs text-muted-foreground">
            {gridNotice}
          </div>
        )}

        {/* auto-fill visuals hint/result (free stock, no key required, preferred path for topic videos) */}
        {offerStockFill && (
          <div className="mb-4 flex items-center gap-2 rounded-lg bg-primary/5 border border-primary/15 px-3 py-2 text-xs text-muted-foreground">
            <LuImage className="w-3.5 h-3.5 text-primary/70 shrink-0" />
            <span>{stockMsg ?? t("stockFillTip")}</span>
          </div>
        )}

        {/* cloud paid-task recovery (issue #16): submitted tasks whose results were never
            retrieved — offer resume instead of a duplicate (billed) resubmit */}
        {pendingTasks.length > 0 && (
          <div className="mb-6 p-4 rounded-xl bg-blue-50 border border-blue-200">
            <div className="flex items-start gap-3">
              <LuLoaderCircle className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-blue-900">
                  {t("pendingTasksTitle", { n: pendingTasks.length })}
                </p>
                <p className="text-xs text-blue-700 mt-0.5">{t("pendingTasksDesc")}</p>
                <div className="mt-2 space-y-1.5">
                  {pendingTasks.map((task) => (
                    <div key={task.id} className="flex items-center gap-2 text-xs text-blue-800">
                      <span className="truncate">
                        {t("taskLabel", { shot: task.shotId ?? "-", model: task.model, taskId: task.taskId })}
                      </span>
                      <Button
                        onClick={() => resumeTask(task)}
                        disabled={resumingTasks.has(task.id)}
                        variant="outline"
                        size="sm"
                        className="h-6 px-2 text-[11px] border-blue-300 text-blue-700 hover:bg-blue-100 shrink-0"
                      >
                        {resumingTasks.has(task.id) ? (
                          <>
                            <LuLoaderCircle className="animate-spin w-3 h-3 mr-1" />
                            {t("btnResumingTask")}
                          </>
                        ) : (
                          t("btnResumeTask")
                        )}
                      </Button>
                    </div>
                  ))}
                </div>
                {taskMsg && <p className="text-xs text-blue-700 mt-2">{taskMsg}</p>}
              </div>
            </div>
          </div>
        )}

        {/* no image model configured warning (only shown when there are still AI shots pending generation) */}
        {showModelWarning && (
          <div className="mb-6 p-4 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-3">
            <LuTriangleAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-900">{t("noModelTitle")}</p>
              <p className="text-xs text-amber-700 mt-0.5">
                {t("noModelDesc")}
                <Link href="/settings" className="underline ml-1">{t("goToSettings")}</Link>
              </p>
            </div>
          </div>
        )}

        {/* loading state / empty state */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <LuLoaderCircle className="w-6 h-6 animate-spin mb-3" />
            <p className="text-sm">{t("loadingShots")}</p>
          </div>
        ) : loadError ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <LuImage className="w-10 h-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground mb-4">{loadError}</p>
            <Link href={`/project/${id}/script`}>
              <Button variant="outline" size="sm">{t("backToScriptStep")}</Button>
            </Link>
          </div>
        ) : (
          <>
            {/* progress bar */}
            <div className="mb-6">
              <div className="h-2 bg-muted/30 rounded-full overflow-hidden">
                <div
                  className="h-full brand-gradient transition-all duration-700 rounded-full"
                  style={{ width: `${assets.length ? (doneCount / assets.length) * 100 : 0}%` }}
                />
              </div>
              {/* real/AI mix meter — Douyin tilts traffic toward hybrid content at ≥50% real (duration-weighted) */}
              {mix.realRatio != null && (
                <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground" title={t("mixTiltTip")}>
                  <span className="shrink-0">{t("mixLabel")}</span>
                  <div className="h-1.5 w-32 rounded-full overflow-hidden bg-muted/30 flex shrink-0">
                    <div className="h-full bg-emerald-500/80" style={{ width: `${Math.round(mix.realRatio * 100)}%` }} />
                    <div className="h-full bg-violet-500/60" style={{ width: `${100 - Math.round(mix.realRatio * 100)}%` }} />
                  </div>
                  <span className="shrink-0 tabular-nums">
                    {t("mixReal")} {Math.round(mix.realRatio * 100)}% · {t("mixAi")} {100 - Math.round(mix.realRatio * 100)}%
                  </span>
                  {mix.tiltEligible && <span className="text-emerald-500 truncate">✓ {t("mixTiltOk")}</span>}
                </div>
              )}
            </div>

            {/* asset list */}
            <div className="space-y-4">
              {assets.map((asset) => {
                const typeInfo = shotTypeLabels[asset.type];
                // per-shot real/AI chip (same classification as the mix meter above)
                const reality = shotReality({
                  visualSource: asset.visualSource,
                  assetType: asset.assetType,
                  done: asset.status === "done",
                });
                return (
                  <Card key={asset.shotId} className="glass-card overflow-hidden">
                    <CardContent className="p-0">
                      <div className="flex">
                        {/* left-side index */}
                        <div className="flex flex-col items-center justify-center w-16 py-4 border-r border-border/50 shrink-0">
                          <span className="text-lg font-bold text-muted-foreground/50">
                            {String(asset.shotId).padStart(2, "0")}
                          </span>
                          <Badge className={`${typeInfo.color} border-0 text-[10px] mt-1`}>
                            {t(typeInfo.key)}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground mt-1">{asset.duration}s</span>
                          {reality && (
                            <span
                              className={`text-[9px] mt-1 px-1 rounded ${
                                reality === "real"
                                  ? "bg-emerald-500/15 text-emerald-600"
                                  : "bg-violet-500/15 text-violet-600"
                              }`}
                            >
                              {reality === "real" ? t("badgeReal") : t("badgeAi")}
                            </span>
                          )}
                        </div>

                        {/* center content */}
                        <div className="flex-1 p-4">
                          <p className="text-sm leading-relaxed mb-2">{asset.description}</p>
                          {/* per-shot camera move: named-preset picker + inline free-text edit
                              (Higgsfield "Click-to-Video": curated moves instead of prompt guessing).
                              Edits persist into the script and apply on the next motion generation */}
                          <div className="flex items-center gap-1.5 mb-2 text-xs min-w-0">
                            <span className="shrink-0 text-muted-foreground/70">🎥</span>
                            {editingCameraShot === asset.shotId ? (
                              <input
                                autoFocus
                                value={cameraDraft}
                                onChange={(e) => setCameraDraft(e.target.value)}
                                onBlur={() => saveCamera(asset.shotId, cameraDraft)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") saveCamera(asset.shotId, cameraDraft);
                                  if (e.key === "Escape") setEditingCameraShot(null);
                                }}
                                maxLength={200}
                                className="flex-1 min-w-0 bg-muted/20 border border-border/60 rounded px-2 py-0.5 text-xs outline-none focus:border-primary"
                              />
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingCameraShot(asset.shotId);
                                  setCameraDraft(asset.camera ?? "");
                                }}
                                title={t("cameraEditTip")}
                                className="min-w-0 truncate text-left text-muted-foreground hover:text-foreground underline decoration-dotted underline-offset-2"
                              >
                                {asset.camera || t("cameraUnset")}
                              </button>
                            )}
                            {savingCameraShot === asset.shotId ? (
                              <LuLoaderCircle className="w-3 h-3 animate-spin shrink-0 text-muted-foreground" />
                            ) : (
                              <select
                                value=""
                                onChange={(e) => e.target.value && applyCameraPreset(asset.shotId, e.target.value)}
                                title={t("cameraPresetTip")}
                                className="shrink-0 bg-muted/20 border border-border/60 rounded px-1 h-5 text-[11px] text-muted-foreground outline-none max-w-24"
                              >
                                <option value="">{t("cameraPresetPick")}</option>
                                <optgroup label={t("cameraRecommendGroup")}>
                                  {recommendedPresets(asset.type).map((p) => (
                                    <option key={`rec-${p.id}`} value={p.id}>
                                      {locale === "zh" ? p.name.zh : p.name.en}
                                    </option>
                                  ))}
                                </optgroup>
                                {(Object.keys(CAMERA_PRESET_CATEGORIES) as CameraPresetCategory[]).map((cat) => (
                                  <optgroup key={cat} label={locale === "zh" ? CAMERA_PRESET_CATEGORIES[cat].zh : CAMERA_PRESET_CATEGORIES[cat].en}>
                                    {CAMERA_PRESETS.filter((p) => p.category === cat).map((p) => (
                                      <option key={p.id} value={p.id}>
                                        {locale === "zh" ? p.name.zh : p.name.en}
                                      </option>
                                    ))}
                                  </optgroup>
                                ))}
                              </select>
                            )}
                            {/* Mix overlay (Higgsfield Mix): only while the text IS a preset sentence */}
                            {savingCameraShot !== asset.shotId && editingCameraShot !== asset.shotId && (() => {
                              const base = findPresetByPrompt(asset.camera);
                              if (!base) return null;
                              const sample = `${asset.camera ?? ""}${asset.description ?? ""}`;
                              const candidates = mixablePresets(base, sample);
                              if (candidates.length === 0) return null;
                              return (
                                <select
                                  value=""
                                  onChange={(e) => e.target.value && applyCameraMix(asset.shotId, base.id, e.target.value)}
                                  title={t("cameraMixTip")}
                                  className="shrink-0 bg-muted/20 border border-border/60 rounded px-1 h-5 text-[11px] text-muted-foreground outline-none max-w-20"
                                >
                                  <option value="">{t("cameraMixPick")}</option>
                                  {candidates.map((p) => (
                                    <option key={p.id} value={p.id}>
                                      {locale === "zh" ? p.name.zh : p.name.en}
                                    </option>
                                  ))}
                                </select>
                              );
                            })()}
                          </div>
                          {asset.prompt && (
                            <p className="text-xs text-muted-foreground bg-muted/20 rounded px-2 py-1.5 mb-2 line-clamp-2">
                              {t("promptLabel", { prompt: asset.prompt })}
                            </p>
                          )}
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>
                              {asset.assetType === "stock_footage"
                                ? t("sourceStock")
                                : asset.visualSource === "product_image"
                                ? t("sourceProductImage")
                                : asset.visualSource === "ai_generate"
                                ? t("sourceAiGenerate")
                                : t("sourceUserUpload")}
                            </span>
                          </div>
                          {asset.status === "failed" && asset.error && (
                            <p className="text-xs text-destructive mt-2">⚠ {asset.error}</p>
                          )}
                        </div>

                        {/* right-side preview + actions */}
                        <div className="flex flex-col items-center justify-center gap-2 p-4 shrink-0">
                          {/* thumbnail area */}
                          <div className="w-24 h-16 bg-muted/30 rounded-md flex items-center justify-center border border-border/30 overflow-hidden">
                            {asset.status === "done" && asset.thumbnailUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={asset.thumbnailUrl} alt={t("assetPreviewAlt")} className="w-full h-full object-cover" />
                            ) : asset.status === "done" ? (
                              <div className="w-full h-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                                <LuCheck className="w-5 h-5 text-primary" />
                              </div>
                            ) : asset.status === "generating" ? (
                              <LuLoaderCircle className="animate-spin h-5 w-5 text-primary" />
                            ) : asset.status === "failed" ? (
                              <LuCircleX className="w-5 h-5 text-destructive" />
                            ) : (
                              <LuImage className="w-4 h-4 text-muted-foreground/40" />
                            )}
                          </div>

                          {/* action buttons (AI-generated shots can be manually generated or retried) */}
                          {asset.visualSource === "ai_generate" && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs w-24"
                              disabled={asset.status === "generating" || motionShots.has(asset.shotId)}
                              onClick={() => generateOne(asset.shotId)}
                            >
                              {asset.status === "generating"
                                ? t("btnGenerating")
                                : asset.status === "done"
                                ? t("btnRegenerate")
                                : asset.status === "failed"
                                ? tc("retry")
                                : t("btnGenerate")}
                            </Button>
                          )}
                          {/* upload own image: unblocks user_upload shots (no other action) and lets any non-product shot use the creator's own photo instead of AI/stock */}
                          {asset.visualSource !== "product_image" && (
                            <Button
                              variant={asset.visualSource === "user_upload" && asset.status !== "done" ? "outline" : "ghost"}
                              size="sm"
                              className="text-xs w-24 text-muted-foreground hover:text-primary"
                              disabled={uploadingShot === asset.shotId}
                              onClick={() => openUploadFor(asset.shotId)}
                            >
                              {uploadingShot === asset.shotId ? (
                                <LuLoaderCircle className="animate-spin h-3.5 w-3.5" />
                              ) : (
                                <><LuUpload className="w-3 h-3 mr-1" />{asset.status === "done" ? t("btnReplaceUpload") : t("btnUpload")}</>
                              )}
                            </Button>
                          )}
                          {/* convert to motion shot: existing image asset → image-to-video (real camera moves). Product close-up shots are best kept static to avoid distortion */}
                          {asset.status === "done" && asset.thumbnailUrl && !asset.isVideo && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-xs w-24 text-muted-foreground hover:text-primary"
                              disabled={motionShots.has(asset.shotId)}
                              onClick={() => generateMotion(asset.shotId)}
                              // pre-call transparency (issue #16): show which provider/model this
                              // paid call actually uses, so a t2v/i2v mix-up is visible up front
                              title={
                                videoModelTarget
                                  ? `${t("motionTip")}\n${videoModelTarget.provider} · ${videoModelTarget.model}`
                                  : t("motionTip")
                              }
                            >
                              {motionShots.has(asset.shotId) ? t("btnConvertingMotion") : t("btnConvertMotion")}
                            </Button>
                          )}
                          {asset.isVideo && (
                            <span className="text-[10px] text-primary">{t("motionDone")}</span>
                          )}
                          {/* per-shot fallback (commercial "regenerate one shot" mechanism): re-run ONLY
                              the i2v from the preserved keyframe — never throws away the whole batch.
                              Full keyframe+motion redo stays available via the regenerate button above */}
                          {asset.isVideo && asset.keyframeUrl && videoModelTarget && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-xs w-24 text-muted-foreground hover:text-primary"
                              disabled={motionShots.has(asset.shotId)}
                              onClick={() => generateMotion(asset.shotId, asset.keyframeUrl)}
                              title={`${t("redoMotionTip")}\n${videoModelTarget.provider} · ${videoModelTarget.model}`}
                            >
                              {motionShots.has(asset.shotId) ? t("btnConvertingMotion") : t("btnRedoMotion")}
                            </Button>
                          )}
                          {asset.error && (
                            <span className="text-[10px] text-destructive max-w-24 text-center">{asset.error}</span>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* bottom action */}
            <div className="mt-8 flex justify-end">
              <Link href={allDone ? `/project/${id}/video` : "#"}>
                <Button className="brand-gradient text-white text-sm" disabled={!allDone}>
                  {t("nextCompose")}
                  <LuArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </Link>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
