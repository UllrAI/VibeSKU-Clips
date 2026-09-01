"use client";

/**
 * New "act first, configure later" landing page (dark studio direction).
 * Lives as an independent route /start, leaving the homepage (currently being rewritten for i18n) untouched.
 * Users land and act immediately: upload a product image or describe a topic → kick off generation right away;
 * only prompted to configure a Key when AI is actually needed (Atlas one-click recommended).
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSettingsStore } from "@/lib/stores/settings-store";
import { ProductionProfilePicker } from "@/components/production-profile-picker";
import { useProductLibraryStore } from "@/lib/stores/product-library-store";
import { useCharacterStore } from "@/lib/stores/project-store";
import { getExampleProducts, type ExampleProduct } from "@/lib/examples";
import { useT, useLocale } from "@/lib/i18n";
import { ATLAS_KEYS_URL } from "@/lib/atlas-onekey";
import { formatRelativeTime } from "@/lib/relative-time";
import { classifyTrendTitle, pickDailyTrend, TREND_CATEGORY_IDS } from "@/lib/trends";
import type { TrendTopic, TrendCategoryId } from "@/lib/trends";
import { DotPattern } from "@/components/ui/dot-pattern";
import {
  ArrowRight,
  CalendarDays,
  Check,
  ExternalLink,
  Flame,
  ImagePlus,
  Link2,
  Mic2,
  RefreshCw,
  Scissors,
  Sparkles,
  Upload,
  X,
} from "lucide-react";

/** How many trend chips are shown at once; "shuffle" pages through the full board. */
const TRENDS_PAGE_SIZE = 8;

/** localStorage keys for the daily-persona picker (device-local, no account concept) */
const DAILY_PERSONA_KEY = "clipforge_daily_persona";
const DAILY_LAST_KEY = "clipforge_daily_last";

/** Local calendar date (YYYY-MM-DD) — "today" for the daily-pick marker follows the user's clock. */
function localDateStamp(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type Mode = "upload" | "topic" | "link";

/** AI-mode commerce form → engine vocab: beginner-facing words map onto script style + video mode */
const FORM_PRESETS = {
  auto: { styleType: "auto", videoMode: "product_closeup" },
  presenter: { styleType: "talking_head", videoMode: "live_presenter" },
  drama: { styleType: "drama", videoMode: "live_presenter" },
  montage: { styleType: "auto", videoMode: "graphic_montage" },
} as const;
type FormId = keyof typeof FORM_PRESETS;

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
  const { llm } = useSettingsStore();
  const applyAtlasOneKey = useSettingsStore((s) => s.applyAtlasOneKey);
  const llmReady = llm.apiKey.trim().length > 0;
  // example products follow the UI language
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
  // which step of the busy takeover is running (index into busySteps)
  const [stageIdx, setStageIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [needKey, setNeedKey] = useState(false);
  const [atlasKey, setAtlasKey] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [recent, setRecent] = useState<RecentProject[]>([]);
  const [trends, setTrends] = useState<TrendTopic[]>([]);
  const [trendsSource, setTrendsSource] = useState<string>("");
  const [trendsPage, setTrendsPage] = useState(0);
  const [trendsCat, setTrendsCat] = useState<"all" | TrendCategoryId>("all");
  // daily-persona picker state (persisted per device)
  const [dailyPersona, setDailyPersona] = useState("");
  const [dailyLast, setDailyLast] = useState<{ date: string; topic: string } | null>(null);
  const [dailyMsg, setDailyMsg] = useState<string>("");
  const fileRef = useRef<HTMLInputElement>(null);
  const keyformRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

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

  // fetch recent projects to give returning users a "continue" entry point (replaces the old homepage project list so they are not left stranded)
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
    return () => { cancelled = true; };
  }, []);

  // trend radar ("what to post today"): Chinese UI reads domestic boards, English UI reads Google Trends.
  // Failure or an empty board silently hides the section — the landing page must never block on it.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(locale === "zh" ? "/api/trends?source=cn&limit=48" : "/api/trends?geo=US&limit=48");
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled || !Array.isArray(data.topics)) return;
        // Curate for sellable content: keep only topics that classify into a creator
        // category, and drop "society" (news/incidents/politics) — raw boards lead with
        // headlines that make no sense as commerce videos and are a compliance risk for
        // AI-generated content.
        setTrends(
          data.topics.filter((tp: TrendTopic) => {
            if (typeof tp?.title !== "string" || !tp.title.trim()) return false;
            const cat = classifyTrendTitle(tp.title);
            return cat !== null && cat !== "society";
          })
        );
        setTrendsSource(typeof data.source === "string" ? data.source : "");
        setTrendsPage(0);
      } catch {
        /* keyless free endpoint — silent degradation */
      }
    })();
    return () => { cancelled = true; };
  }, [locale]);

  // load the persisted daily persona + today's marker once on mount
  // (deferred to a microtask: hydrating from localStorage after paint keeps SSR markup stable
  // and satisfies the no-sync-setState-in-effect rule)
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      try {
        setDailyPersona(localStorage.getItem(DAILY_PERSONA_KEY) || "");
        const last = JSON.parse(localStorage.getItem(DAILY_LAST_KEY) || "null");
        if (last && typeof last.date === "string" && typeof last.topic === "string") setDailyLast(last);
      } catch {
        /* corrupted storage → start fresh */
      }
    });
    return () => { cancelled = true; };
  }, []);

  // categories present on the current board (chips render only for non-empty ones; hidden entirely when nothing classifies)
  const trendsCats = TREND_CATEGORY_IDS.filter((id) => trends.some((tp) => classifyTrendTitle(tp.title) === id));
  const catFiltered = trendsCat === "all" ? trends : trends.filter((tp) => classifyTrendTitle(tp.title) === trendsCat);

  // current slice of the filtered board; "shuffle" cycles through pages
  const trendsPageCount = Math.max(1, Math.ceil(catFiltered.length / TRENDS_PAGE_SIZE));
  const trendsShown = catFiltered.slice(
    (trendsPage % trendsPageCount) * TRENDS_PAGE_SIZE,
    (trendsPage % trendsPageCount) * TRENDS_PAGE_SIZE + TRENDS_PAGE_SIZE
  );
  const trendsSourceLabel =
    trendsSource === "douyin" ? t("trendsSourceDouyin") : trendsSource === "toutiao" ? t("trendsSourceToutiao") : "Google Trends";

  // tap a trend → prefill it as a one-sentence topic and bring the action card into view
  const pickTrend = (tp: TrendTopic) => {
    setMode("topic");
    setTopic(tp.title);
    requestAnimationFrame(() => cardRef.current?.scrollIntoView({ block: "center", behavior: "smooth" }));
  };

  // daily pick: score the full board against the persona keywords, prefill the winner, remember today's pick
  const runDailyPick = () => {
    const pick = pickDailyTrend(trends, dailyPersona);
    if (!pick) return;
    pickTrend(pick.topic);
    setDailyMsg(t(pick.matched ? "dailyPickedMatched" : "dailyPickedFallback").replace("{topic}", pick.topic.title));
    const last = { date: localDateStamp(), topic: pick.topic.title };
    setDailyLast(last);
    try {
      localStorage.setItem(DAILY_LAST_KEY, JSON.stringify(last));
    } catch {
      /* storage full/blocked — the marker is a convenience, not a requirement */
    }
  };

  const onPersonaChange = (v: string) => {
    setDailyPersona(v);
    try {
      localStorage.setItem(DAILY_PERSONA_KEY, v);
    } catch {
      /* ignore */
    }
  };

  // navigate to the appropriate step based on project status
  const stepFor = (status: string) =>
    status === "done" || status === "composing" || status === "video" ? "video" : status === "assets" ? "assets" : "script";

  // map project status to the short stage-label i18n key shown on recent-project cards
  const stageKeyFor = (status: string) =>
    status === "done" ? "pjStageDone" : status === "video" || status === "composing" ? "pjStageVideo" : status === "assets" ? "pjStageAssets" : "pjStageScript";

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
      const t = prev.find((i) => i.id === id);
      if (t) URL.revokeObjectURL(t.url);
      return prev.filter((i) => i.id !== id);
    });

  // one-click fill example: fetch the example image as a File into the upload zone + populate name/selling points
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

  // read LLM config live from the store: after one-click setup the newly written Key is immediately available in the same tick, avoiding stale closure values
  const llmConfig = () => {
    const l = useSettingsStore.getState().llm;
    return { baseUrl: l.baseUrl, apiKey: l.apiKey, model: l.model, visionModel: l.visionModel };
  };

  // creation-time choices flow into script generation and the script page's finishing gate
  const creationPreset = () => (genMode === "ai" ? FORM_PRESETS[form] : FORM_PRESETS.auto);
  const genQuery = () => {
    if (genMode !== "ai") return "";
    const p =
      (form === "presenter" || form === "drama") && presenterId
        ? `&presenter=${encodeURIComponent(presenterId)}`
        : "";
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
      body: JSON.stringify({ name: t("projectName", { name: productName }), productName, productCategory: "other", productDescription: sellingPoints, productImages: [] }),
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

  // paste a product URL → ingest (fetch page, parse title/price/images, create project) → auto-generate script → script page
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
    // no LLM configured: expand the Atlas one-click setup panel inline (no navigation, no loss of filled content)
    if (!llmReady) {
      setNeedKey(true);
      // the panel may be mounting this very tick — defer the scroll until React has committed it to the DOM
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          keyformRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
        });
      });
      return;
    }
    runGeneration();
  };

  // paste an Atlas Key → validate → write full config → immediately continue with generation
  const connectAtlasAndStart = async () => {
    const key = atlasKey.trim();
    if (!key || connecting || busy) return;
    setConnecting(true);
    setConnectError(null);
    try {
      const res = await fetch("/api/ai/test-provider", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "atlas-cloud", apiKey: key }),
      });
      const data = await res.json().catch(() => ({ status: "unknown" }));
      // only block on "explicitly invalid"; unknown (network/endpoint uncertainty) passes through and lets generation attempt proceed
      if (data.status === "invalid") {
        setConnectError(t("atlasKeyInvalid"));
        setConnecting(false);
        return;
      }
      applyAtlasOneKey(key);
      setConnecting(false);
      setNeedKey(false);
      await runGeneration();
    } catch {
      setConnectError(t("atlasConnectFailed"));
      setConnecting(false);
    }
  };

  return (
    <div className="cf-root">
      <style>{`
        .cf-root{--teal:var(--primary);--ink:var(--primary-foreground);--text:var(--foreground);--dim:var(--muted-foreground);--quiet:color-mix(in srgb,var(--muted-foreground) 74%,transparent);--surface:color-mix(in srgb,var(--card) 92%,transparent);--surface2:var(--accent);--bd:var(--border);--bd2:color-mix(in srgb,var(--border) 72%,var(--foreground));
          min-height:100vh;background:var(--background);color:var(--text);position:relative;overflow-x:hidden;
          font-family:ui-sans-serif,"PingFang SC","Microsoft YaHei",system-ui,-apple-system,"Segoe UI",sans-serif;}
        .cf-wrap{position:relative;width:min(1240px,100%);margin:0 auto;padding:0 32px}
        .cf-hero{padding:36px 0 64px;text-align:left}
        .cf-intro{max-width:820px;margin-bottom:28px}
        .cf-eyebrow{font-size:12px;letter-spacing:.12em;color:var(--teal);opacity:.9;margin-bottom:12px}
        .cf-h1{font-weight:700;font-size:clamp(32px,4vw,48px);line-height:1.08;letter-spacing:-.02em;margin-bottom:12px}
        .cf-h1 .hl{color:var(--teal)}
        .cf-sub{color:var(--dim);font-size:15px;line-height:1.7;max-width:700px;margin:0}
        .cf-workspace{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:20px;align-items:start}
        .cf-main,.cf-aside{background:var(--surface);border:1px solid var(--bd);border-radius:14px;text-align:left;min-width:0}
        .cf-main{padding:20px}
        .cf-aside{padding:18px;position:sticky;top:24px}
        .cf-section-head{display:flex;align-items:flex-start;gap:10px;margin-bottom:16px}
        .cf-section-index{width:22px;height:22px;flex:none;border-radius:999px;background:var(--accent);color:var(--accent-foreground);display:grid;place-items:center;font-size:12px;font-weight:700}
        .cf-section-copy{min-width:0}
        .cf-section-title{font-size:15px;font-weight:650;color:var(--text);line-height:1.4}
        .cf-section-hint{font-size:12px;color:var(--quiet);line-height:1.5;margin-top:2px}
        .cf-tabs{display:flex;gap:22px;border-bottom:1px solid var(--bd);margin:0 -20px 18px;padding:0 20px}
        .cf-tab{height:42px;border:0;border-bottom:2px solid transparent;background:transparent;color:var(--dim);font:inherit;font-size:13.5px;font-weight:500;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:7px;transition:border-color .18s,color .18s}
        .cf-tab.on{border-bottom-color:var(--primary);color:var(--primary)}
        .cf-upload-grid{display:grid;grid-template-columns:minmax(240px,.82fr) minmax(320px,1.18fr);gap:16px;align-items:stretch}
        .cf-fields{min-width:0;display:flex;flex-direction:column}
        .cf-drop{position:relative;min-height:224px;border:1px dashed color-mix(in srgb,var(--primary) 45%,var(--border));border-radius:10px;background:color-mix(in srgb,var(--primary) 4%,var(--card));padding:24px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;cursor:pointer;transition:border-color .18s,background-color .18s}
        .cf-drop.drag{border-color:var(--teal)}
        .cf-dic{width:42px;height:42px;border-radius:10px;background:transparent;border:1px solid color-mix(in srgb,var(--primary) 36%,var(--border));display:grid;place-items:center;color:var(--teal);margin-bottom:6px}
        .cf-dt{font-size:14px;font-weight:600}
        .cf-ds{font-size:13px;color:var(--quiet)}
        .cf-thumbs{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
        .cf-thumb{position:relative;width:62px;height:62px;border-radius:10px;overflow:hidden;border:1px solid var(--bd2)}
        .cf-thumb img{width:100%;height:100%;object-fit:cover}
        .cf-thumb button{position:absolute;top:2px;right:2px;width:18px;height:18px;border:0;border-radius:6px;background:rgba(0,0,0,.6);color:#fff;cursor:pointer;font-size:12px;line-height:1;display:grid;place-items:center}
        .cf-field{margin-top:10px}
        .cf-field:first-child{margin-top:0}
        .cf-input,.cf-area{width:100%;background:var(--background);border:1px solid var(--bd);border-radius:9px;color:var(--text);font:inherit;font-size:14px;padding:11px 13px;outline:none;transition:border-color .18s,box-shadow .18s,background-color .18s}
        .cf-input:focus,.cf-area:focus{border-color:var(--ring);box-shadow:0 0 0 3px color-mix(in srgb,var(--ring) 20%,transparent)}
        .cf-area{resize:none;min-height:84px;line-height:1.6}
        .cf-cta-row{display:flex;flex-direction:column;align-items:stretch;gap:8px;margin-top:16px;padding-top:16px;border-top:1px solid var(--bd)}
        .cf-cta{width:100%;height:44px;padding:0 18px;border:0;border-radius:9px;background:var(--primary);color:var(--ink);font:inherit;font-size:14px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px;white-space:nowrap;transition:background-color .18s,color .18s}
        .cf-cta:hover:not(:disabled){background:color-mix(in srgb,var(--primary) 90%,var(--foreground))}
        .cf-cta:disabled{background:var(--muted);color:var(--muted-foreground);cursor:not-allowed}
        .cf-reassure{font-size:12.5px;color:var(--quiet);line-height:1.5}
        .cf-reassure b{color:var(--dim);font-weight:600}
        .cf-genrow{display:flex;flex-direction:column;margin-top:12px;border:1px solid var(--bd);border-radius:10px;overflow:hidden}
        .cf-gen{display:flex;flex-direction:column;gap:3px;padding:11px 12px;border:0;border-bottom:1px solid var(--bd);border-radius:0;background:transparent;font:inherit;text-align:left;cursor:pointer;transition:background-color .18s,color .18s}
        .cf-gen:last-child{border-bottom:0}
        .cf-gen b{font-size:13.5px;font-weight:600;color:var(--text);display:flex;align-items:center;gap:6px}
        .cf-gen span{font-size:12px;line-height:1.5;color:var(--quiet)}
        .cf-gen:hover{background:var(--accent)}
        .cf-gen.on{background:color-mix(in srgb,var(--primary) 9%,transparent)}
        .cf-gen.on b{color:var(--teal)}
        .cf-formrow{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:14px;padding-top:14px;border-top:1px solid var(--bd)}
        .cf-form-lbl{font-size:12px;color:var(--quiet);flex:none;margin-right:2px}
        .cf-fchip{padding:6px 9px;border:1px solid var(--bd);border-radius:7px;background:transparent;color:var(--dim);font:inherit;font-size:12px;cursor:pointer;transition:border-color .18s,background-color .18s,color .18s}
        .cf-fchip:hover{border-color:var(--bd2);color:var(--text)}
        .cf-fchip.on{border-color:color-mix(in srgb,var(--primary) 52%,var(--border));background:color-mix(in srgb,var(--primary) 10%,transparent);color:var(--text)}
        .cf-form-select{background:color-mix(in srgb,var(--background) 74%,var(--card));border:1px solid var(--bd);border-radius:9px;color:var(--text);font:inherit;font-size:12.5px;padding:5px 9px;outline:none}
        .cf-keybox{margin-top:12px;border:1px solid color-mix(in srgb,var(--primary) 34%,var(--border));background:color-mix(in srgb,var(--primary) 7%,transparent);border-radius:12px;padding:12px 14px;font-size:13px;color:var(--dim);display:flex;align-items:center;justify-content:space-between;gap:12px}
        .cf-keybox a{color:var(--ink);background:var(--primary);padding:7px 13px;border-radius:9px;font-weight:600;text-decoration:none;white-space:nowrap}
        .cf-keyform{margin-top:16px;border:0;border-top:1px solid var(--bd);background:transparent;border-radius:0;padding:16px 0 0}
        .cf-keyhead{font-size:14.5px;font-weight:600;color:var(--text);display:flex;align-items:center;gap:9px;margin-bottom:5px}
        .cf-keyhead .badge{font-size:12px;font-weight:700;letter-spacing:.02em;color:var(--ink);background:var(--primary);border-radius:6px;padding:2px 8px}
        .cf-keyclose{margin-left:auto;width:26px;height:26px;flex:none;border:1px solid transparent;border-radius:999px;background:transparent;color:var(--quiet);cursor:pointer;display:grid;place-items:center;transition:border-color .18s,background-color .18s,color .18s}
        .cf-keyclose:hover{color:var(--text);border-color:var(--bd2);background:var(--surface2)}
        .cf-keydesc{font-size:12.5px;color:var(--dim);line-height:1.55;margin-bottom:11px}
        .cf-keydesc a{color:var(--teal);text-decoration:none;white-space:nowrap}
        .cf-keydesc a:hover{text-decoration:underline;text-underline-offset:2px}
        .cf-keyrow{display:flex;gap:8px}
        .cf-keyinput{flex:1;min-width:0;background:color-mix(in srgb,var(--background) 78%,var(--card));border:1px solid var(--bd);border-radius:10px;color:var(--text);font:inherit;font-size:14px;padding:11px 13px;outline:none;transition:border-color .18s,box-shadow .18s,background-color .18s}
        .cf-keyinput:focus{border-color:var(--ring);box-shadow:0 0 0 3px color-mix(in srgb,var(--ring) 20%,transparent)}
        .cf-keybtn{padding:0 18px;border:0;border-radius:10px;background:var(--primary);color:var(--ink);font:inherit;font-size:14px;font-weight:600;cursor:pointer;white-space:nowrap;display:inline-flex;align-items:center;gap:7px;transition:background-color .18s,opacity .18s}
        .cf-keybtn:hover:not(:disabled){background:color-mix(in srgb,var(--primary) 90%,var(--foreground))}
        .cf-keybtn:disabled{opacity:.5;cursor:not-allowed}
        .cf-keyalt{margin-top:10px;font-size:12px}
        .cf-keyalt a{color:var(--quiet);text-decoration:none;border-bottom:1px dashed var(--bd2);padding-bottom:1px}
        .cf-keyalt a:hover{color:var(--dim)}
        .cf-keyerr{margin-top:9px;color:var(--destructive);font-size:12.5px}
        .cf-err{margin-top:12px;color:var(--destructive);font-size:13px}
        .cf-prog{grid-column:1/-1;padding:36px 24px;background:var(--surface);border:1px solid var(--bd);border-radius:14px;display:flex;flex-direction:column;align-items:center;gap:18px}
        .cf-prog-title{font-size:16px;font-weight:600;color:var(--text);display:flex;align-items:center;gap:10px}
        .cf-spin{width:18px;height:18px;flex:none;border-radius:999px;border:2px solid color-mix(in srgb,var(--primary) 25%,transparent);border-top-color:var(--teal);animation:cfSpin .8s linear infinite}
        .cf-spin.sm{width:10px;height:10px;border-width:1.5px}
        @keyframes cfSpin{to{transform:rotate(360deg)}}
        .cf-prog-steps{display:flex;flex-direction:column;gap:10px;width:min(320px,100%)}
        .cf-prog-step{display:flex;align-items:center;gap:11px;font-size:13.5px;color:var(--quiet);transition:color .2s}
        .cf-prog-step.on{color:var(--text)}
        .cf-prog-step.done{color:var(--dim)}
        .cf-prog-step .ic{width:20px;height:20px;flex:none;display:grid;place-items:center;border-radius:999px;border:1px solid var(--bd2);font-size:12px;font-style:normal}
        .cf-prog-step.on .ic{border-color:color-mix(in srgb,var(--primary) 62%,var(--border))}
        .cf-prog-step.done .ic{border-color:color-mix(in srgb,var(--primary) 52%,var(--border));color:var(--teal)}
        .cf-prog-hint{font-size:12px;color:var(--quiet);text-align:center;line-height:1.6}
        .cf-advanced{margin-top:14px;padding-top:14px;border-top:1px solid var(--bd)}
        .cf-advanced summary{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:32px;color:var(--dim);font-size:12.5px;font-weight:600;cursor:pointer;list-style:none}
        .cf-advanced summary::-webkit-details-marker{display:none}
        .cf-advanced summary::after{content:"+";font-size:17px;font-weight:400;color:var(--quiet)}
        .cf-advanced[open] summary::after{content:"−"}
        .cf-secondary-grid{display:grid;grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr);gap:20px;margin-top:24px;align-items:start}
        .cf-trends{margin:0;text-align:left;background:var(--surface);border:1px solid var(--bd);border-radius:14px;padding:16px}
        .cf-trends-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
        .cf-trends-lbl{font-size:13px;font-weight:600;color:var(--dim);letter-spacing:.02em;display:inline-flex;align-items:center;gap:6px}
        .cf-trends-more{display:inline-flex;align-items:center;gap:5px;padding:5px 11px;border:1px solid var(--bd);border-radius:999px;background:transparent;color:var(--quiet);font:inherit;font-size:12px;cursor:pointer;transition:border-color .18s,color .18s}
        .cf-trends-more:hover{color:var(--dim);border-color:var(--bd2)}
        .cf-trend-list{display:flex;flex-direction:column;margin:0 -8px}
        .cf-trow{display:flex;align-items:center;gap:10px;padding:7px 8px;border-radius:9px;transition:background-color .15s}
        .cf-trow:hover{background:var(--surface2)}
        .cf-trow .trk{flex:none;width:18px;text-align:center;font-size:12px;font-style:normal;font-weight:700;color:var(--quiet)}
        .cf-trow .trk.hot{color:var(--destructive)}
        .cf-trow .ttl{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:left;background:none;border:0;color:var(--text);font:inherit;font-size:13.5px;cursor:pointer;padding:0}
        .cf-trow .ttl:hover{color:var(--teal)}
        .cf-trow .tv{flex:none;font-size:12px;color:var(--quiet)}
        .cf-trow .tclone{flex:none;font-size:12px;color:var(--quiet);text-decoration:none;padding:3px 9px;border:1px solid var(--bd);border-radius:999px;transition:border-color .15s,color .15s;display:inline-flex;align-items:center;gap:4px}
        .cf-trow .tclone:hover{color:var(--teal);border-color:color-mix(in srgb,var(--primary) 42%,var(--border))}
        .cf-trends-src{margin-top:9px;font-size:12px;color:var(--quiet)}
        .cf-trends-cats{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:9px}
        .cf-cat{padding:4px 10px;border:1px solid transparent;border-radius:999px;background:transparent;color:var(--quiet);font:inherit;font-size:12px;cursor:pointer;transition:border-color .18s,background-color .18s,color .18s}
        .cf-cat:hover{color:var(--dim)}
        .cf-cat.on{border-color:color-mix(in srgb,var(--primary) 42%,var(--border));background:color-mix(in srgb,var(--primary) 8%,transparent);color:var(--text)}
        .cf-daily{display:flex;align-items:center;gap:8px;margin-top:12px;padding-top:12px;border-top:1px solid var(--bd)}
        .cf-daily-lbl{font-size:12.5px;font-weight:600;color:var(--dim);flex:none;display:inline-flex;align-items:center;gap:5px}
        .cf-daily-input{flex:1;min-width:0;background:color-mix(in srgb,var(--background) 74%,var(--card));border:1px solid var(--bd);border-radius:9px;color:var(--text);font:inherit;font-size:13px;padding:7px 11px;outline:none;transition:border-color .18s,box-shadow .18s,background-color .18s}
        .cf-daily-input:focus{border-color:var(--ring);box-shadow:0 0 0 3px color-mix(in srgb,var(--ring) 20%,transparent)}
        .cf-daily-btn{padding:7px 14px;border:1px solid var(--bd2);border-radius:9px;background:var(--surface2);color:var(--text);font:inherit;font-size:12.5px;font-weight:600;cursor:pointer;transition:background-color .18s,color .18s,border-color .18s;flex:none}
        .cf-daily-btn:hover{border-color:color-mix(in srgb,var(--primary) 48%,var(--border))}
        .cf-daily-msg{margin-top:8px;font-size:12px;color:var(--dim)}
        .cf-examples{margin-top:auto;padding-top:12px;font-size:12px;color:var(--quiet);display:flex;align-items:center;justify-content:flex-start;gap:6px;flex-wrap:wrap}
        .cf-chip{padding:5px 9px;border:1px solid var(--bd);border-radius:7px;background:transparent;color:var(--dim);font:inherit;font-size:12px;cursor:pointer;transition:border-color .18s,color .18s,background-color .18s}
        .cf-chip:hover{border-color:color-mix(in srgb,var(--primary) 42%,var(--border));color:var(--text)}
        .cf-recent{margin:0;text-align:left;background:var(--surface);border:1px solid var(--bd);border-radius:14px;padding:16px}
        .cf-recent .lbl{font-size:12px;color:var(--quiet);margin-bottom:8px;letter-spacing:.02em;display:flex;align-items:center;justify-content:space-between}
        .cf-recent .lbl-all{color:var(--quiet);text-decoration:none;transition:color .18s;display:inline-flex;align-items:center;gap:4px}
        .cf-recent .lbl-all:hover{color:var(--dim)}
        .cf-recent .row{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}
        .cf-pj{display:flex;align-items:center;gap:10px;padding:11px 13px;border:1px solid var(--bd);border-radius:12px;background:var(--surface);text-decoration:none;transition:border-color .18s,background-color .18s}
        .cf-pj:hover{border-color:var(--bd2);background:var(--surface2)}
        .cf-pj .dot{width:7px;height:7px;border-radius:999px;background:var(--teal);flex:none}
        .cf-pj .col{min-width:0;display:flex;flex-direction:column;gap:2px}
        .cf-pj .nm{font-size:13px;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .cf-pj-meta{font-size:12px;color:var(--quiet);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .cf-root button:focus-visible,.cf-root a:focus-visible,.cf-root input:focus-visible,.cf-root textarea:focus-visible,.cf-root select:focus-visible{outline:3px solid color-mix(in srgb,var(--ring) 45%,transparent);outline-offset:2px}
        @media (max-width:1024px){
          .cf-wrap{padding:0 24px}
          .cf-workspace{grid-template-columns:1fr}
          .cf-aside{position:static}
          .cf-secondary-grid{grid-template-columns:1fr}
        }
        @media (max-width:720px){
          .cf-wrap{padding:0 16px}
          .cf-hero{padding:28px 0 40px}
          .cf-eyebrow{margin-bottom:12px;letter-spacing:.14em}
          .cf-sub{font-size:14px;line-height:1.65;margin-bottom:24px}
          .cf-main,.cf-aside{padding:16px;border-radius:12px}
          .cf-tabs{gap:16px;margin:0 -16px 16px;padding:0 16px;overflow-x:auto}
          .cf-tab{min-width:max-content;height:44px;font-size:13px}
          .cf-upload-grid{grid-template-columns:1fr}
          .cf-drop{min-height:180px;padding:24px 16px}
          .cf-input,.cf-area,.cf-keyinput{font-size:16px}
          .cf-keyrow{flex-direction:column}
          .cf-keybtn{min-height:44px;justify-content:center}
          .cf-recent .row{grid-template-columns:1fr}
          .cf-daily{align-items:stretch;flex-wrap:wrap}
          .cf-daily-lbl{width:100%}
          .cf-daily-input{min-height:44px}
          .cf-daily-btn{min-height:44px}
          .cf-trow{align-items:flex-start}
          .cf-trow .tv{display:none}
        }
        @media (prefers-reduced-motion:reduce){.cf-root *{scroll-behavior:auto!important;animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}}
      `}</style>

      <DotPattern className="text-primary/15 [mask-image:radial-gradient(circle_at_50%_22%,black,transparent_72%)]" width={34} height={34} cr={0.7} />
      <div className="cf-wrap">
        <section className="cf-hero">
          <div className="cf-intro">
            <div className="cf-eyebrow">{t("eyebrow")}</div>
            <h1 className="cf-h1">{t("h1Lead")}<span className="hl">{t("h1Highlight")}</span></h1>
            <p className="cf-sub">{t("sub")}</p>
          </div>

          <div className="cf-workspace" ref={cardRef}>
            {busy ? (
              /* busy takeover: the whole card becomes a live checklist so the 20–60s
                 creation wait reads as progress, not a frozen button */
              <div className="cf-prog">
                <div className="cf-prog-title">
                  <span className="cf-spin" />
                  {t("progTitle")}
                </div>
                <div className="cf-prog-steps">
                  {busySteps.map((label, i) => (
                    <div key={label} className={`cf-prog-step${i < stageIdx ? " done" : i === stageIdx ? " on" : ""}`}>
                      <span className="ic">
                        {i < stageIdx ? (
                          <Check aria-hidden="true" size={11} strokeWidth={3} />
                        ) : i === stageIdx ? (
                          <span className="cf-spin sm" />
                        ) : (
                          i + 1
                        )}
                      </span>
                      {label}
                    </div>
                  ))}
                </div>
                <div className="cf-prog-hint">{t("progHint")}</div>
              </div>
            ) : (
              <>
            <section className="cf-main" aria-labelledby="source-step-title">
            <div className="cf-section-head">
              <span className="cf-section-index">1</span>
              <div className="cf-section-copy">
                <div className="cf-section-title" id="source-step-title">{t("sourceStepTitle")}</div>
                <div className="cf-section-hint">{t("sourceStepHint")}</div>
              </div>
            </div>
            <div className="cf-tabs">
              <button className={`cf-tab${mode === "upload" ? " on" : ""}`} aria-pressed={mode === "upload"} onClick={() => setMode("upload")}>
                <ImagePlus aria-hidden="true" size={16} />
                {t("tabUpload")}
              </button>
              <button className={`cf-tab${mode === "link" ? " on" : ""}`} aria-pressed={mode === "link"} onClick={() => setMode("link")}>
                <Link2 aria-hidden="true" size={16} />
                {t("tabLink")}
              </button>
              <button className={`cf-tab${mode === "topic" ? " on" : ""}`} aria-pressed={mode === "topic"} onClick={() => setMode("topic")}>
                <Mic2 aria-hidden="true" size={16} />
                {t("tabTopic")}
              </button>
            </div>

            {mode === "upload" ? (
              <>
                <div className="cf-upload-grid">
                <div>
                <div
                  className={`cf-drop${isDragging ? " drag" : ""}`}
                  role="button"
                  tabIndex={0}
                  aria-label={t("dropTitle")}
                  onClick={() => fileRef.current?.click()}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") fileRef.current?.click(); }}
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
                  onDrop={(e) => { e.preventDefault(); setIsDragging(false); addFiles(e.dataTransfer.files); }}
                >
                  <div className="cf-dic"><Upload aria-hidden="true" size={22} /></div>
                  <div className="cf-dt">{t("dropTitle")}</div>
                  <div className="cf-ds">{t("dropSub")}</div>
                  <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => addFiles(e.target.files)} />
                </div>
                {images.length > 0 && (
                  <div className="cf-thumbs">
                    {images.map((i) => (
                      <div key={i.id} className="cf-thumb">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={i.url} alt={t("imgAlt")} />
                        <button onClick={(e) => { e.stopPropagation(); removeImage(i.id); }} aria-label={t("removeAria")}>×</button>
                      </div>
                    ))}
                  </div>
                )}
                </div>
                <div className="cf-fields">
                <div className="cf-field">
                  <input className="cf-input" aria-label={t("productNamePlaceholder")} value={productName} onChange={(e) => setProductName(e.target.value)} placeholder={t("productNamePlaceholder")} />
                </div>
                <div className="cf-field">
                  <textarea className="cf-area" aria-label={t("sellingPointsPlaceholder")} value={sellingPoints} onChange={(e) => setSellingPoints(e.target.value)} placeholder={t("sellingPointsPlaceholder")} />
                </div>
                <div className="cf-examples">
                  {t("examplesLabel")}
                  {examples.slice(0, 3).map((ex) => (
                    <button key={ex.id} type="button" className="cf-chip" onClick={() => fillExample(ex)}>{ex.name} ¥{ex.price}</button>
                  ))}
                </div>
                </div>
                </div>
              </>
            ) : mode === "link" ? (
              <div className="cf-field" style={{ marginTop: 0 }}>
                <input
                  className="cf-input"
                  aria-label={t("linkPlaceholder")}
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && canStart && !busy) runGeneration(); }}
                  placeholder={t("linkPlaceholder")}
                />
                <div className="cf-ds" style={{ marginTop: 8 }}>{t("linkHint")}</div>
              </div>
            ) : (
              <div className="cf-field" style={{ marginTop: 0 }}>
                <textarea className="cf-area" aria-label={t("topicPlaceholder")} style={{ minHeight: 120 }} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder={t("topicPlaceholder")} />
              </div>
            )}
            </section>

            <aside className="cf-aside" aria-labelledby="output-step-title">
            <div className="cf-section-head">
              <span className="cf-section-index">2</span>
              <div className="cf-section-copy">
                <div className="cf-section-title" id="output-step-title">{t("outputStepTitle")}</div>
                <div className="cf-section-hint">{t("outputStepHint")}</div>
              </div>
            </div>
            <div className="cf-genrow">
              {(["free", "ai"] as const).map((g) => (
                <button key={g} type="button" aria-pressed={genMode === g} className={`cf-gen${genMode === g ? " on" : ""}`} onClick={() => setGenMode(g)}>
                  <b>{g === "free" ? <Scissors aria-hidden="true" size={14} /> : <Sparkles aria-hidden="true" size={14} />}{t(g === "free" ? "genFree" : "genAi")}</b>
                  <span>{t(g === "free" ? "genFreeDesc" : "genAiDesc")}</span>
                </button>
              ))}
            </div>
            {/* commerce form: only asked when it actually changes the outcome (AI visuals);
                the free quick cut uses generic stock footage where this choice is moot */}
            {genMode === "ai" && mode !== "topic" && (
              <div className="cf-formrow">
                <span className="cf-form-lbl">{t("formLabel")}</span>
                {(Object.keys(FORM_PRESETS) as FormId[]).map((f) => (
                  <button
                    key={f}
                    type="button"
                    aria-pressed={form === f}
                    className={`cf-fchip${form === f ? " on" : ""}`}
                    title={t(`form_${f}_tip`)}
                    onClick={() => setForm(f)}
                  >
                    {t(`form_${f}`)}
                  </button>
                ))}
              </div>
            )}
            {/* presenter picking follows the domestic digital-human convention: face → lines → voice */}
            {genMode === "ai" && mode !== "topic" && (form === "presenter" || form === "drama") && characters.length > 0 && (
              <div className="cf-formrow">
                <span className="cf-form-lbl">{t("presenterLabel")}</span>
                <select className="cf-form-select" value={presenterId} onChange={(e) => setPresenterId(e.target.value)}>
                  <option value="">{t("presenterAuto")}</option>
                  {characters.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            )}
            {genMode === "ai" && (
              <details className="cf-advanced">
                <summary>{t("advancedProduction")}</summary>
                <ProductionProfilePicker />
              </details>
            )}

            {needKey && !llmReady && (
              <div className="cf-keyform" ref={keyformRef}>
                <div className="cf-keyhead">
                  <span className="badge">{t("atlasBadge")}</span>
                  {t("atlasTitle")}
                  <button type="button" className="cf-keyclose" aria-label={t("atlasDismiss")} title={t("atlasDismiss")} onClick={() => setNeedKey(false)}>
                    <X aria-hidden="true" size={13} />
                  </button>
                </div>
                <div className="cf-keydesc">
                  {t("atlasDesc")}{" "}
                  <a href={ATLAS_KEYS_URL} target="_blank" rel="noreferrer">{t("atlasGetKey")} ↗</a>
                </div>
                <div className="cf-keyrow">
                  <input
                    className="cf-keyinput"
                    type="password"
                    value={atlasKey}
                    autoFocus
                    onChange={(e) => setAtlasKey(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") connectAtlasAndStart(); }}
                    placeholder={t("atlasKeyPlaceholder")}
                  />
                  <button className="cf-keybtn" onClick={connectAtlasAndStart} disabled={atlasKey.trim().length === 0 || connecting || busy}>
                    {connecting ? t("atlasConnecting") : busy ? (stage || t("busyDefault")) : t("atlasConnectStart")}
                    {!connecting && !busy && <ArrowRight aria-hidden="true" size={15} />}
                  </button>
                </div>
                {connectError && <div className="cf-keyerr">{connectError}</div>}
                <div className="cf-keyalt">
                  <Link href="/settings?tab=llm">{t("atlasUseOther")}</Link>
                </div>
              </div>
            )}
            <div className="cf-cta-row">
              <button className="cf-cta" onClick={onStart} disabled={!canStart || busy}>
                {busy ? (stage || t("busyDefault")) : t("ctaStart")}
                {!busy && <ArrowRight aria-hidden="true" size={16} />}
              </button>
              <div className="cf-reassure">{t("reassureLead")}<b>Atlas Cloud</b>{t("reassureTail")}</div>
            </div>
            {error && <div className="cf-err">{error}</div>}
            </aside>
              </>
            )}
          </div>

          <div className="cf-secondary-grid">
          {recent.length > 0 && (
            <div className="cf-recent">
              <div className="lbl">
                {t("recentLabel")}
                <Link href="/projects" className="lbl-all">{t("recentAll")}<ArrowRight aria-hidden="true" size={12} /></Link>
              </div>
              <div className="row">
                {recent.map((p) => {
                  const rel = formatRelativeTime(p.updatedAt, locale);
                  return (
                    <Link key={p.id} href={`/project/${p.id}/${stepFor(p.status)}`} className="cf-pj">
                      <span className="dot" />
                      <span className="col">
                        <span className="nm">{p.name || p.productName || t("untitledProject")}</span>
                        <span className="cf-pj-meta">{t(stageKeyFor(p.status))}{rel ? ` · ${rel}` : ""}</span>
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          {trends.length > 0 && (
            <div className="cf-trends">
              <div className="cf-trends-head">
                <span className="cf-trends-lbl"><Flame aria-hidden="true" size={14} />{t("trendsLabel")}</span>
                <button type="button" className="cf-trends-more" onClick={() => setTrendsPage((p) => p + 1)}>
                  {t("trendsRefresh")}
                  <RefreshCw aria-hidden="true" size={12} />
                </button>
              </div>
              {trendsCats.length > 1 && (
                <div className="cf-trends-cats">
                  {(["all", ...trendsCats] as const).map((id) => (
                    <button
                      key={id}
                      type="button"
                      className={`cf-cat${trendsCat === id ? " on" : ""}`}
                      onClick={() => { setTrendsCat(id); setTrendsPage(0); }}
                    >
                      {id === "all" ? t("trendCatAll") : t(`trendCat_${id}`)}
                    </button>
                  ))}
                </div>
              )}
              {/* ranked list rows: scan-friendly, one action per row (was a wall of glued pills) */}
              <div className="cf-trend-list">
                {trendsShown.map((tp, i) => (
                  <div key={`${tp.source || "t"}-${tp.rank ?? tp.title}`} className="cf-trow">
                    <b className={`trk${typeof tp.rank === "number" && tp.rank <= 3 ? " hot" : ""}`}>
                      {typeof tp.rank === "number" ? tp.rank : i + 1}
                    </b>
                    <button
                      type="button"
                      className="ttl"
                      title={tp.context || tp.title}
                      onClick={() => pickTrend(tp)}
                    >
                      {tp.title}
                    </button>
                    {tp.traffic && <span className="tv">{tp.traffic}</span>}
                    <Link
                      href={`/project/clone?trend=${encodeURIComponent(tp.title)}`}
                      className="tclone"
                      title={t("trendCloneAria")}
                      aria-label={t("trendCloneAria")}
                    >
                      {t("trendCloneLabel")}<ExternalLink aria-hidden="true" size={10} />
                    </Link>
                  </div>
                ))}
              </div>
              <div className="cf-trends-src">{t("trendsSourceNote", { source: trendsSourceLabel })}</div>

              <div className="cf-daily">
                <span className="cf-daily-lbl"><CalendarDays aria-hidden="true" size={13} />{t("dailyLabel")}</span>
                <input
                  className="cf-daily-input"
                  value={dailyPersona}
                  onChange={(e) => onPersonaChange(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") runDailyPick(); }}
                  placeholder={t("dailyPersonaPlaceholder")}
                />
                <button type="button" className="cf-daily-btn" onClick={runDailyPick}>{t("dailyPick")}</button>
              </div>
              {(dailyMsg || (dailyLast && dailyLast.date === localDateStamp())) && (
                <div className="cf-daily-msg">
                  {dailyMsg || t("dailyDoneHint").replace("{topic}", dailyLast?.topic ?? "")}
                </div>
              )}
            </div>
          )}
          </div>

        </section>
      </div>
    </div>
  );
}
