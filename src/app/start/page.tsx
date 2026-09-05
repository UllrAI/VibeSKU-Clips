"use client";

/**
 * The single creation entry.
 *
 * Issue #1's first finding was that `/start` and `/project/new` both offered "photo, link, or a
 * sentence", so the first decision anyone made was which page to start on. This page is now the
 * only one in the primary flow: content in, output mode chosen, generate. Everything that used to
 * be a peer decision — category, duration, video mode, script style, presenter, production
 * profile — sits behind one disclosure, and the full ad-template workbench stays one link away
 * rather than one tab away.
 *
 * The page also no longer ships its own stylesheet. It is built from the same shadcn primitives
 * as the rest of the app, so a change to the theme reaches it like it reaches everything else.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  ImagePlus,
  Link2,
  Loader2,
  Mic2,
  Scissors,
  Settings2,
  Sparkles,
  Upload,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { DisclosureSection } from "@/components/disclosure-section";
import { ProductionProfilePicker } from "@/components/production-profile-picker";
import { getExampleProducts, type ExampleProduct } from "@/lib/examples";
import { useLocale, useT } from "@/lib/i18n";
import { RECOMMENDED_PRESET, OPENROUTER_KEYS_URL } from "@/lib/llm-presets";
import { PRISM_CONSOLE_URL } from "@/lib/providers/prism";
import { formatRelativeTime } from "@/lib/relative-time";
import { isLLMReady, isMediaReady, useSettingsStore } from "@/lib/stores/settings-store";
import { useProductLibraryStore } from "@/lib/stores/product-library-store";
import { useCharacterStore } from "@/lib/stores/project-store";
import { cn } from "@/lib/utils";

type Mode = "upload" | "topic" | "link";

/** AI-mode commerce form → engine vocab: beginner-facing words map onto script style + video mode */
const FORM_PRESETS = {
  auto: { styleType: "auto", videoMode: "product_closeup" },
  presenter: { styleType: "talking_head", videoMode: "live_presenter" },
  drama: { styleType: "drama", videoMode: "live_presenter" },
  montage: { styleType: "auto", videoMode: "graphic_montage" },
} as const;
type FormId = keyof typeof FORM_PRESETS;
const FORM_IDS = Object.keys(FORM_PRESETS) as FormId[];

interface PickedImage {
  id: string;
  url: string;
  file: File;
}
interface RecentProject {
  id: string;
  name: string;
  productName: string | null;
  status: string;
  updatedAt: string | null;
}

export default function StartPage() {
  const router = useRouter();
  const t = useT("start");
  const locale = useLocale();
  const { llm, media, setLLM, setMedia } = useSettingsStore();
  const examples = getExampleProducts(locale);

  const [mode, setMode] = useState<Mode>("upload");
  // generation-task mode: the free/paid fork, explicit with cost up front
  // (open-source BYOK — AI charges go to the user's own model platform, never to us)
  const [genMode, setGenMode] = useState<"free" | "ai">("free");
  // commerce form (AI mode only): what the finished video looks like
  const [form, setForm] = useState<FormId>("auto");
  const { characters } = useCharacterStore();
  const [presenterId, setPresenterId] = useState("");
  const [images, setImages] = useState<PickedImage[]>([]);
  const [productName, setProductName] = useState("");
  const [sellingPoints, setSellingPoints] = useState("");
  const [topic, setTopic] = useState("");
  const [link, setLink] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState("");
  const [stageIdx, setStageIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<RecentProject[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const connectRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // What this run actually needs: a script model always, Prism only when the visuals are generated.
  const llmReady = isLLMReady(llm);
  const mediaReady = isMediaReady(media);
  const ready = llmReady && (genMode === "free" || mediaReady);
  const [showConnect, setShowConnect] = useState(false);

  // product-library hand-off: /start?productId=x pre-fills the upload tab, so the
  // library's "make video" button lands beginners on the same single creation path
  const { products: libraryProducts } = useProductLibraryStore();
  const prefilledRef = useRef(false);
  useEffect(() => {
    if (prefilledRef.current) return;
    const productId = new URLSearchParams(window.location.search).get("productId");
    if (!productId) return;
    const product = libraryProducts.find((p) => p.id === productId);
    if (!product) return; // store not hydrated yet (effect re-runs) or stale id
    prefilledRef.current = true;
    queueMicrotask(() => {
      setMode("upload");
      setProductName(product.name);
      if (product.description) setSellingPoints(product.description);
    });
    // fetch library images into File objects; local blob URLs from other pages may be dead — text stays filled either way
    (async () => {
      const files: PickedImage[] = [];
      for (const [i, src] of product.images.slice(0, 5).entries()) {
        try {
          const res = await fetch(src);
          const blob = await res.blob();
          const file = new File([blob], `product-${i}.png`, { type: blob.type || "image/png" });
          files.push({ id: crypto.randomUUID(), url: URL.createObjectURL(file), file });
        } catch {
          /* non-fatal per image */
        }
      }
      if (files.length) {
        setImages((prev) => {
          prev.forEach((p) => URL.revokeObjectURL(p.url));
          return files;
        });
      }
    })();
  }, [libraryProducts]);

  // recent projects give returning users a "continue" entry point
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/project");
        const data = res.ok ? await res.json() : [];
        const list: RecentProject[] = Array.isArray(data) ? data : [];
        // sort by updatedAt desc so "recent" truly reflects last-edited order (null/invalid timestamps sink to the end)
        const ts = (p: RecentProject) => {
          if (!p.updatedAt) return 0;
          const time = new Date(p.updatedAt).getTime();
          return Number.isFinite(time) ? time : 0;
        };
        if (!cancelled) setRecent([...list].sort((a, b) => ts(b) - ts(a)).slice(0, 4));
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // navigate to the appropriate step based on project status
  const stepFor = (status: string) =>
    status === "done" || status === "composing" || status === "video" ? "video" : status === "assets" ? "assets" : "script";

  const stageKeyFor = (status: string) =>
    status === "done"
      ? "pjStageDone"
      : status === "video" || status === "composing"
      ? "pjStageVideo"
      : status === "assets"
      ? "pjStageAssets"
      : "pjStageScript";

  const addFiles = useCallback((files: FileList | null) => {
    if (!files) return;
    setImages((prev) => {
      const remaining = 5 - prev.length;
      if (remaining <= 0) return prev;
      const next = Array.from(files)
        .slice(0, remaining)
        .filter((f) => f.type.startsWith("image/"))
        .map((file) => ({ id: crypto.randomUUID(), url: URL.createObjectURL(file), file }));
      return [...prev, ...next];
    });
  }, []);

  const removeImage = (id: string) =>
    setImages((prev) => {
      const target = prev.find((i) => i.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter((i) => i.id !== id);
    });

  // one-click example: fetch the example image as a File into the upload zone + populate the fields
  const fillExample = useCallback(async (ex: ExampleProduct) => {
    setMode("upload");
    setProductName(ex.name);
    setSellingPoints(ex.sellingPoints);
    try {
      const res = await fetch(ex.image);
      const blob = await res.blob();
      const file = new File([blob], `${ex.id}.png`, { type: blob.type || "image/png" });
      setImages((prev) => {
        prev.forEach((i) => URL.revokeObjectURL(i.url));
        return [{ id: crypto.randomUUID(), url: URL.createObjectURL(file), file }];
      });
    } catch {
      /* image fetch failure is fine; the text fields are already filled */
    }
  }, []);

  const canStart =
    mode === "topic"
      ? topic.trim().length >= 2
      : mode === "link"
      ? /^https?:\/\/.+/i.test(link.trim())
      : images.length >= 1 && productName.trim().length > 0;

  // read LLM config live from the store: after the inline connect panel writes a key it is
  // available in the same tick, avoiding a stale closure value
  const llmConfig = () => {
    const l = useSettingsStore.getState().llm;
    return { baseUrl: l.baseUrl, apiKey: l.apiKey, model: l.model, visionModel: l.visionModel };
  };

  // creation-time choices flow into script generation and the script page's finishing gate
  const creationPreset = () => (genMode === "ai" ? FORM_PRESETS[form] : FORM_PRESETS.auto);
  const genQuery = () => {
    if (genMode !== "ai") return "";
    const p = (form === "presenter" || form === "drama") && presenterId ? `&presenter=${encodeURIComponent(presenterId)}` : "";
    return `&gen=ai${p}`;
  };
  const creationCharacter = () => {
    if (genMode !== "ai" || (form !== "presenter" && form !== "drama") || !presenterId) return null;
    const c = characters.find((x) => x.id === presenterId);
    return c ? { id: c.id, name: c.name, appearance: c.appearance || "", voiceStyle: c.voiceProfile?.style } : null;
  };

  // step labels for the busy takeover, per entry mode (rendered as a live checklist)
  const busySteps =
    mode === "upload"
      ? [t("stageCreate"), t("stageUpload"), t("stageScript")]
      : mode === "link"
      ? [t("stageIngest"), t("stageScript")]
      : [t("stageScript")];

  const startTopic = async () => {
    setStageIdx(0);
    setStage(t("stageScript"));
    const res = await fetch("/api/topic/script", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic: topic.trim(), narrationStyle: "knowledge", targetDuration: 25, llmConfig: llmConfig() }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok && !data.projectId) throw new Error(data.error || t("errTopicScript"));
    router.push(`/project/${data.projectId}/script?auto=1${genQuery()}`);
  };

  const startUpload = async () => {
    setStageIdx(0);
    setStage(t("stageCreate"));
    const projectRes = await fetch("/api/project", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: t("projectName", { name: productName }),
        productName,
        productCategory: "other",
        productDescription: sellingPoints,
        productImages: [],
      }),
    });
    if (!projectRes.ok) {
      const errData = await projectRes.json().catch(() => ({}));
      throw new Error(errData.error ? `${t("errProjectCreate")}: ${errData.error}` : t("errProjectCreate"));
    }
    const project = await projectRes.json();

    setStageIdx(1);
    setStage(t("stageUpload"));
    const fd = new FormData();
    images.forEach((i) => fd.append("files", i.file));
    fd.append("projectId", project.id);
    const uploadRes = await fetch("/api/upload", { method: "POST", body: fd });
    if (!uploadRes.ok) throw new Error(t("errUpload"));
    const { paths } = await uploadRes.json();
    await fetch(`/api/project/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productImages: paths }),
    });

    setStageIdx(2);
    setStage(t("stageScript"));
    const scriptRes = await fetch("/api/llm/script", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: project.id,
        productName,
        category: "other",
        productDescription: sellingPoints,
        targetDuration: 30,
        styleType: creationPreset().styleType,
        videoMode: creationPreset().videoMode,
        productImages: paths,
        llmConfig: llmConfig(),
        ...(creationCharacter() && { character: creationCharacter() }),
      }),
    });
    if (!scriptRes.ok) {
      const errData = await scriptRes.json().catch(() => ({}));
      throw new Error(errData.error ? `${t("errScript")}: ${errData.error}` : t("errScript"));
    }
    router.push(`/project/${project.id}/script?auto=1${genQuery()}`);
  };

  // paste a product URL → ingest (fetch page, parse title/price/images, create project) → script
  const startLink = async () => {
    setStageIdx(0);
    setStage(t("stageIngest"));
    const ingestRes = await fetch("/api/ingest/product", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: link.trim(), createProject: true }),
    });
    const data = await ingestRes.json().catch(() => ({}));
    if (!ingestRes.ok || !data.projectId) throw new Error(data.error || t("errIngest"));
    const p = data.product || {};
    setStageIdx(1);
    setStage(t("stageScript"));
    // even if script gen fails, the project exists with product data — the script page offers retry
    await fetch("/api/llm/script", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: data.projectId,
        productName: p.title || t("linkProductFallback"),
        category: "other",
        productDescription: p.description || "",
        targetDuration: 30,
        styleType: creationPreset().styleType,
        videoMode: creationPreset().videoMode,
        productImages: data.productImages || [],
        llmConfig: llmConfig(),
        ...(creationCharacter() && { character: creationCharacter() }),
      }),
    });
    router.push(`/project/${data.projectId}/script?auto=1${genQuery()}`);
  };

  // actually run generation (shared by all modes); restore busy/stage on failure
  const runGeneration = async () => {
    setBusy(true);
    setError(null);
    try {
      if (mode === "topic") await startTopic();
      else if (mode === "link") await startLink();
      else await startUpload();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errGeneric"));
      setBusy(false);
      setStage("");
      setStageIdx(0);
    }
  };

  const onStart = () => {
    if (!canStart || busy) return;
    if (!ready) {
      // expand the connect panel in place — no navigation, no loss of what was typed
      setShowConnect(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => connectRef.current?.scrollIntoView({ block: "center", behavior: "smooth" }));
      });
      return;
    }
    runGeneration();
  };

  return (
    <div className="page-canvas min-h-screen">
      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        <header className="mb-8 max-w-2xl">
          <p className="mb-2 text-xs font-medium tracking-widest text-primary uppercase">{t("eyebrow")}</p>
          <h1 className="text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
            {t("h1Lead")}
            <span className="text-primary">{t("h1Highlight")}</span>
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{t("sub")}</p>
        </header>

        <div ref={cardRef}>
          {busy ? (
            <Card className="surface-panel">
              <CardContent className="flex flex-col items-center gap-5 px-6 py-12">
                <p className="flex items-center gap-2 text-base font-medium">
                  <Loader2 className="size-4 animate-spin text-primary" aria-hidden="true" />
                  {t("progTitle")}
                </p>
                <ol className="w-full max-w-xs space-y-2.5">
                  {busySteps.map((label, i) => (
                    <li
                      key={label}
                      className={cn(
                        "flex items-center gap-3 text-sm",
                        i < stageIdx ? "text-muted-foreground" : i === stageIdx ? "text-foreground" : "text-muted-foreground/60"
                      )}
                    >
                      <span
                        className={cn(
                          "flex size-5 shrink-0 items-center justify-center rounded-full border text-[11px]",
                          i <= stageIdx ? "border-primary/60 text-primary" : "border-border"
                        )}
                      >
                        {i < stageIdx ? (
                          <Check className="size-3" strokeWidth={3} aria-hidden="true" />
                        ) : i === stageIdx ? (
                          <Loader2 className="size-3 animate-spin" aria-hidden="true" />
                        ) : (
                          i + 1
                        )}
                      </span>
                      {label}
                    </li>
                  ))}
                </ol>
                <p className="max-w-sm text-center text-xs leading-relaxed text-muted-foreground">{t("progHint")}</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
              {/* Step 1 — where the video comes from */}
              <Card className="surface-panel">
                <CardContent className="p-5">
                  <StepHead index={1} title={t("sourceStepTitle")} hint={t("sourceStepHint")} />

                  <Tabs value={mode} onValueChange={(value) => setMode((value ?? "upload") as Mode)} className="mt-4">
                    <TabsList variant="line" className="mb-4 w-full justify-start border-b border-border">
                      <TabsTrigger value="upload">
                        <ImagePlus className="size-4" aria-hidden="true" />
                        {t("tabUpload")}
                      </TabsTrigger>
                      <TabsTrigger value="link">
                        <Link2 className="size-4" aria-hidden="true" />
                        {t("tabLink")}
                      </TabsTrigger>
                      <TabsTrigger value="topic">
                        <Mic2 className="size-4" aria-hidden="true" />
                        {t("tabTopic")}
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>

                  {mode === "upload" && (
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <div
                          role="button"
                          tabIndex={0}
                          aria-label={t("dropTitle")}
                          onClick={() => fileRef.current?.click()}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") fileRef.current?.click();
                          }}
                          onDragOver={(e) => {
                            e.preventDefault();
                            setIsDragging(true);
                          }}
                          onDragLeave={(e) => {
                            e.preventDefault();
                            setIsDragging(false);
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            setIsDragging(false);
                            addFiles(e.dataTransfer.files);
                          }}
                          className={cn(
                            "flex min-h-52 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed p-6 text-center transition-colors",
                            isDragging ? "border-primary bg-primary/10" : "border-primary/40 bg-primary/[0.04] hover:border-primary/70"
                          )}
                        >
                          <span className="mb-1 flex size-10 items-center justify-center rounded-lg border border-primary/35 text-primary">
                            <Upload className="size-5" aria-hidden="true" />
                          </span>
                          <span className="text-sm font-medium">{t("dropTitle")}</span>
                          <span className="text-xs text-muted-foreground">{t("dropSub")}</span>
                          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
                        </div>
                        {images.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {images.map((i) => (
                              <div key={i.id} className="relative size-16 overflow-hidden rounded-lg border border-border">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={i.url} alt={t("imgAlt")} className="size-full object-cover" />
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    removeImage(i.id);
                                  }}
                                  aria-label={t("removeAria")}
                                  className="absolute right-1 top-1 flex size-5 items-center justify-center rounded bg-foreground/65 text-background"
                                >
                                  <X className="size-3" aria-hidden="true" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col gap-3">
                        <Input
                          aria-label={t("productNamePlaceholder")}
                          value={productName}
                          onChange={(e) => setProductName(e.target.value)}
                          placeholder={t("productNamePlaceholder")}
                        />
                        <Textarea
                          aria-label={t("sellingPointsPlaceholder")}
                          value={sellingPoints}
                          onChange={(e) => setSellingPoints(e.target.value)}
                          placeholder={t("sellingPointsPlaceholder")}
                          className="min-h-24 resize-none"
                        />
                        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                          {t("examplesLabel")}
                          {examples.slice(0, 3).map((ex) => (
                            <button
                              key={ex.id}
                              type="button"
                              onClick={() => fillExample(ex)}
                              className="rounded-md border border-border px-2 py-1 text-xs transition-colors hover:border-primary/50 hover:text-primary"
                            >
                              {ex.name} ¥{ex.price}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {mode === "link" && (
                    <div className="space-y-2">
                      <Input
                        aria-label={t("linkPlaceholder")}
                        value={link}
                        onChange={(e) => setLink(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") onStart();
                        }}
                        placeholder={t("linkPlaceholder")}
                      />
                      <p className="text-xs text-muted-foreground">{t("linkHint")}</p>
                    </div>
                  )}

                  {mode === "topic" && (
                    <Textarea
                      aria-label={t("topicPlaceholder")}
                      value={topic}
                      onChange={(e) => setTopic(e.target.value)}
                      placeholder={t("topicPlaceholder")}
                      className="min-h-32 resize-none"
                    />
                  )}
                </CardContent>
              </Card>

              {/* Step 2 — how it gets made, and the one connect action it needs */}
              <Card className="surface-panel lg:sticky lg:top-6">
                <CardContent className="space-y-4 p-5">
                  <StepHead index={2} title={t("outputStepTitle")} hint={t("outputStepHint")} />

                  <div className="overflow-hidden rounded-xl border border-border">
                    {(["free", "ai"] as const).map((g, i) => (
                      <button
                        key={g}
                        type="button"
                        aria-pressed={genMode === g}
                        onClick={() => setGenMode(g)}
                        className={cn(
                          "flex w-full flex-col gap-1 px-3 py-3 text-left transition-colors",
                          i > 0 && "border-t border-border",
                          genMode === g ? "bg-primary/10" : "hover:bg-muted/50"
                        )}
                      >
                        <span className={cn("flex items-center gap-1.5 text-sm font-medium", genMode === g && "text-primary")}>
                          {g === "free" ? <Scissors className="size-3.5" aria-hidden="true" /> : <Sparkles className="size-3.5" aria-hidden="true" />}
                          {t(g === "free" ? "genFree" : "genAi")}
                        </span>
                        <span className="text-xs leading-relaxed text-muted-foreground">{t(g === "free" ? "genFreeDesc" : "genAiDesc")}</span>
                      </button>
                    ))}
                  </div>

                  {/* the commerce form only changes the outcome when AI renders the visuals */}
                  {genMode === "ai" && mode !== "topic" && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="mr-0.5 text-xs text-muted-foreground">{t("formLabel")}</span>
                      {FORM_IDS.map((f) => (
                        <button
                          key={f}
                          type="button"
                          aria-pressed={form === f}
                          title={t(`form_${f}_tip`)}
                          onClick={() => setForm(f)}
                          className={cn(
                            "rounded-md border px-2 py-1 text-xs transition-colors",
                            form === f ? "border-primary/50 bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground"
                          )}
                        >
                          {t(`form_${f}`)}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* presenter picking follows the digital-human convention: face → lines → voice */}
                  {genMode === "ai" && mode !== "topic" && (form === "presenter" || form === "drama") && characters.length > 0 && (
                    <div className="flex items-center gap-2">
                      <span className="shrink-0 text-xs text-muted-foreground">{t("presenterLabel")}</span>
                      {/* "auto" is a sentinel: an empty string is not a selectable value here. */}
                      <Select
                        value={presenterId || "auto"}
                        onValueChange={(value) => setPresenterId(value === "auto" ? "" : value ?? "")}
                      >
                        <SelectTrigger className="h-8 flex-1 text-xs" aria-label={t("presenterLabel")}>
                          <SelectValue>
                            {(value: string) => characters.find((c) => c.id === value)?.name ?? t("presenterAuto")}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="auto">{t("presenterAuto")}</SelectItem>
                          {characters.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {genMode === "ai" && (
                    <DisclosureSection title={t("advancedProduction")} summary={t("advancedProductionHint")}>
                      <div className="w-full space-y-4">
                        <ProductionProfilePicker />
                        <Link
                          href="/project/new"
                          className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                        >
                          <Settings2 className="size-3.5 shrink-0" aria-hidden="true" />
                          <span className="min-w-0">
                            <span className="block font-medium text-foreground">{t("advOpenNew")}</span>
                            <span className="block leading-relaxed">{t("advOpenNewDesc")}</span>
                          </span>
                        </Link>
                      </div>
                    </DisclosureSection>
                  )}

                  {showConnect && !ready && (
                    <ConnectPanel
                      ref={connectRef}
                      t={t}
                      needMedia={genMode === "ai" && !mediaReady}
                      needLLM={!llmReady}
                      llm={llm}
                      media={media}
                      setLLM={setLLM}
                      setMedia={setMedia}
                      onDone={runGeneration}
                      onDismiss={() => setShowConnect(false)}
                    />
                  )}

                  <div className="space-y-2 border-t border-border pt-4">
                    <Button className="w-full" size="lg" onClick={onStart} disabled={!canStart || busy}>
                      {busy ? stage || t("busyDefault") : t("ctaStart")}
                      {!busy && <ArrowRight className="size-4" aria-hidden="true" />}
                    </Button>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {t(genMode === "free" ? "reassureFree" : "reassureAi")}
                    </p>
                  </div>

                  {error && <p className="text-sm text-destructive">{error}</p>}
                </CardContent>
              </Card>
            </div>
          )}
        </div>

        <div className="mt-6">
          {recent.length > 0 && (
            <Card className="surface-panel">
              <CardContent className="p-5">
                <div className="mb-3 flex items-baseline justify-between gap-2">
                  <h2 className="text-sm font-semibold">{t("recentLabel")}</h2>
                  <Link href="/projects" className="flex items-center gap-1 text-xs text-primary hover:underline">
                    {t("recentAll")}
                    <ArrowRight className="size-3" aria-hidden="true" />
                  </Link>
                </div>
                <ul className="space-y-1">
                  {recent.map((p) => {
                    const rel = formatRelativeTime(p.updatedAt, locale);
                    return (
                      <li key={p.id}>
                        <Link
                          href={`/project/${p.id}/${stepFor(p.status)}`}
                          className="flex items-center gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-muted/50"
                        >
                          <span className="size-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm">{p.name || p.productName || t("untitledProject")}</span>
                            <span className="block text-xs text-muted-foreground">
                              {t(stageKeyFor(p.status))}
                              {rel ? ` · ${rel}` : ""}
                            </span>
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}

function StepHead({ index, title, hint }: { index: number; title: string; hint: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-accent text-[11px] font-semibold text-accent-foreground">
        {index}
      </span>
      <div className="min-w-0">
        <h2 className="text-sm font-semibold leading-tight">{title}</h2>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{hint}</p>
      </div>
    </div>
  );
}

/**
 * The one connect action, asked at the moment it is needed and for exactly what is missing.
 *
 * The free path only needs a script model; the AI path additionally needs Prism. Asking for both
 * up front was the old page's mistake — it made "try it once" look like a paid setup task.
 */
function ConnectPanel({
  ref,
  t,
  needLLM,
  needMedia,
  llm,
  media,
  setLLM,
  setMedia,
  onDone,
  onDismiss,
}: {
  ref: React.Ref<HTMLDivElement>;
  t: ReturnType<typeof useT>;
  needLLM: boolean;
  needMedia: boolean;
  llm: ReturnType<typeof useSettingsStore.getState>["llm"];
  media: ReturnType<typeof useSettingsStore.getState>["media"];
  setLLM: ReturnType<typeof useSettingsStore.getState>["setLLM"];
  setMedia: ReturnType<typeof useSettingsStore.getState>["setMedia"];
  onDone: () => void;
  onDismiss: () => void;
}) {
  const [llmKey, setLlmKey] = useState("");
  const [mediaKey, setMediaKey] = useState(media.apiKey);
  const [mediaSecret, setMediaSecret] = useState(media.apiSecret);
  const [checking, setChecking] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const filled = (!needLLM || llmKey.trim().length > 0) && (!needMedia || (mediaKey.trim() && mediaSecret.trim()));

  const connect = async () => {
    if (!filled || checking) return;
    setChecking(true);
    setFailure(null);
    try {
      if (needLLM) {
        // an unset baseUrl means a fresh install: steer it to the recommended endpoint
        const baseUrl = llm.baseUrl.trim() || RECOMMENDED_PRESET.baseUrl;
        const model = llm.model.trim() || RECOMMENDED_PRESET.model;
        const res = await fetch("/api/llm/test", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ baseUrl, apiKey: llmKey.trim(), model }),
        });
        const data = await res.json().catch(() => ({ ok: false }));
        if (!data.ok) {
          setFailure(data.error || t("connectFailed"));
          setChecking(false);
          return;
        }
        setLLM({ ...llm, baseUrl, model, apiKey: llmKey.trim(), visionModel: llm.visionModel || model });
      }
      if (needMedia) {
        const res = await fetch("/api/ai/test-provider", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ apiKey: mediaKey.trim(), apiSecret: mediaSecret.trim(), baseUrl: media.baseUrl }),
        });
        const data = await res.json().catch(() => ({ status: "unknown" }));
        // block only on "explicitly invalid" — an inconclusive probe must not stop a run that would work
        if (data.status === "invalid") {
          setFailure(data.message || t("connectFailed"));
          setChecking(false);
          return;
        }
        setMedia({ ...media, apiKey: mediaKey.trim(), apiSecret: mediaSecret.trim() });
      }
      setChecking(false);
      onDismiss();
      onDone();
    } catch {
      setFailure(t("connectFailed"));
      setChecking(false);
    }
  };

  return (
    <div ref={ref} className="space-y-3 rounded-xl border border-primary/30 bg-primary/[0.06] p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">{t("connectTitle")}</h3>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{t("connectDesc")}</p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label={t("connectDismiss")}
          title={t("connectDismiss")}
          className="flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="size-3.5" aria-hidden="true" />
        </button>
      </div>

      {needLLM && (
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs font-medium">{t("connectLlmLabel")}</span>
            <a href={OPENROUTER_KEYS_URL} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">
              {t("connectGetKey")}
            </a>
          </div>
          <PasswordInput value={llmKey} onChange={setLlmKey} placeholder={t("connectLlmPlaceholder")} />
        </div>
      )}

      {needMedia && (
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs font-medium">{t("connectMediaLabel")}</span>
            <a href={PRISM_CONSOLE_URL} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">
              {t("connectGetKey")}
            </a>
          </div>
          <PasswordInput value={mediaKey} onChange={setMediaKey} placeholder={t("connectMediaKeyPlaceholder")} />
          <PasswordInput value={mediaSecret} onChange={setMediaSecret} placeholder={t("connectMediaSecretPlaceholder")} />
        </div>
      )}

      <Button className="w-full" onClick={connect} disabled={!filled || checking}>
        {checking ? t("connectChecking") : t("connectSubmit")}
        {!checking && <ArrowRight className="size-4" aria-hidden="true" />}
      </Button>
      {failure && <p className="break-all text-xs text-destructive">{failure}</p>}
      <Link href="/settings?tab=connect" className="block text-xs text-muted-foreground hover:text-foreground">
        {t("connectUseSettings")}
      </Link>
    </div>
  );
}
