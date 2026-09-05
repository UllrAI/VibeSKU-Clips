"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Clapperboard, MessageSquare, Mic2, Check, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { GenerationSettings } from "@/components/generation-settings";
import { PresenterManager } from "@/components/presenter-manager";
import { BrandSettings } from "@/components/settings/brand-settings";
import { ModelPicker } from "@/components/settings/model-picker";
import { useT } from "@/lib/i18n";
import { LLM_PRESETS, OPENROUTER_KEYS_URL } from "@/lib/llm-presets";
import {
  DEFAULT_IMAGE_QUALITY,
  PRISM_IMAGE_MODELS,
  PRISM_VIDEO_MODELS,
  type PrismImageQuality,
} from "@/lib/providers/prism-catalog";
import { PRISM_CONSOLE_URL } from "@/lib/providers/prism";
import { isMediaReady, useSettingsStore } from "@/lib/stores/settings-store";
import {
  OPENAI_TTS_PRESETS,
  TTS_PROVIDERS,
  getTTSProviderMeta,
  isPaidTTSReady,
  resolveTTSConfig,
  type TTSProvider,
} from "@/lib/tts-presets";

/**
 * Settings, in the order someone actually needs them.
 *
 * Four sections replace the previous seven tabs, and the first one answers the only question a
 * new install has: what do I have to connect before this works? Issue #1's finding was that the
 * old page asked people to understand the app's internal model architecture — seven platforms,
 * per-capability model pickers, a voice whose key came from a platform chosen in another tab —
 * before they could make anything. Media is now one credential pair, and everything that is a
 * refinement rather than a prerequisite sits under "advanced".
 */

const IMAGE_QUALITIES: PrismImageQuality[] = ["low", "medium", "high", "auto"];

const SECTIONS = [
  { id: "connect", labelKey: "tabConnect" },
  { id: "generation", labelKey: "tabGeneration" },
  { id: "voice", labelKey: "tabTts" },
  { id: "advanced", labelKey: "tabAdvanced" },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];
const SECTION_IDS: string[] = SECTIONS.map((section) => section.id);

const resolutionOptions = [
  { value: "720p", label: "720p (1280x720)" },
  { value: "1080p", label: "1080p (1920x1080)" },
];

const aspectRatioOptions = [
  { value: "9:16", labelKey: "aspect916" },
  { value: "16:9", labelKey: "aspect169" },
  { value: "1:1", labelKey: "aspect11" },
];

export default function SettingsPage() {
  const t = useT("settings");
  const {
    media,
    setMedia,
    llm,
    setLLM,
    tts,
    setTTS,
    defaultImageModel,
    setDefaultImageModel,
    defaultVideoModel,
    setDefaultVideoModel,
    imageQuality,
    setImageQuality,
    defaultResolution,
    setDefaultResolution,
    defaultAspectRatio,
    setDefaultAspectRatio,
  } = useSettingsStore();

  const [section, setSection] = useState<SectionId>("connect");
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("tab");
    if (requested && SECTION_IDS.includes(requested)) setSection(requested as SectionId);
  }, []);
  const switchSection = (next: SectionId) => {
    setSection(next);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", next);
    window.history.replaceState(null, "", url.toString());
  };

  const mediaReady = isMediaReady(media);
  const llmReady = Boolean(llm.apiKey.trim() && llm.baseUrl.trim() && llm.model.trim());

  return (
    <div className="page-canvas min-h-screen">
      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
        <header className="mb-6 border-b border-border/60 pb-6">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t("pageTitle")}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{t("pageSubtitle")}</p>
        </header>

        <div className="md:grid md:grid-cols-[12rem_minmax(0,1fr)] md:items-start md:gap-6 lg:gap-8">
          <nav
            aria-label={t("pageTitle")}
            className="mb-6 flex gap-1 overflow-x-auto rounded-xl border border-border bg-card p-2 md:sticky md:top-6 md:mb-0 md:flex-col"
          >
            {SECTIONS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => switchSection(item.id)}
                aria-current={section === item.id ? "page" : undefined}
                className={`flex items-center justify-between gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                  section === item.id
                    ? "bg-primary/15 font-medium text-primary"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                }`}
              >
                {t(item.labelKey)}
                {/* Only the script model is genuinely required; Prism is optional if you stay on
                    the free stock path, so a missing Prism key is not a warning. */}
                {item.id === "connect" && !llmReady && (
                  <TriangleAlert className="size-3.5 shrink-0 text-warning" aria-hidden="true" />
                )}
              </button>
            ))}
          </nav>

          <div className="min-w-0 flex-1">
            {section === "connect" && (
              <ConnectSection
                media={media}
                setMedia={setMedia}
                llm={llm}
                setLLM={setLLM}
                mediaReady={mediaReady}
                llmReady={llmReady}
              />
            )}

            {section === "generation" && (
              <section className="space-y-6">
                <h2 className="text-lg font-semibold tracking-tight">{t("tabGeneration")}</h2>
                <Card className="surface-panel">
                  <CardContent className="space-y-4 p-5">
                    <div className="flex items-center gap-2">
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                        <Clapperboard className="size-4" />
                      </div>
                      <h3 className="text-sm font-semibold">{t("defaultsCardTitle")}</h3>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label={t("defaultVideoModel")}>
                        <Select value={defaultVideoModel} onValueChange={(value) => setDefaultVideoModel(value ?? "")}>
                          <SelectTrigger className="w-full" aria-label={t("defaultVideoModel")}>
                            <SelectValue>
                              {(value: string) =>
                                PRISM_VIDEO_MODELS.find((model) => model.id === value)?.name ?? t("selectVideoModel")
                              }
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {PRISM_VIDEO_MODELS.map((model) => (
                              <SelectItem key={model.id} value={model.id}>
                                {model.name} · {model.note}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>

                      <Field label={t("defaultImageModel")}>
                        <Select value={defaultImageModel} onValueChange={(value) => setDefaultImageModel(value ?? "")}>
                          <SelectTrigger className="w-full" aria-label={t("defaultImageModel")}>
                            <SelectValue>
                              {(value: string) =>
                                PRISM_IMAGE_MODELS.find((model) => model.id === value)?.name ?? t("selectImageModel")
                              }
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {PRISM_IMAGE_MODELS.map((model) => (
                              <SelectItem key={model.id} value={model.id}>
                                {model.name} · {model.note}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>

                      <Field label={t("imageQualityLabel")} hint={t("imageQualityHint")}>
                        <Select
                          value={imageQuality ?? DEFAULT_IMAGE_QUALITY}
                          onValueChange={(value) => setImageQuality((value ?? DEFAULT_IMAGE_QUALITY) as PrismImageQuality)}
                        >
                          <SelectTrigger className="w-full" aria-label={t("imageQualityLabel")}>
                            <SelectValue>{(value: string) => t(`imageQuality_${value}`)}</SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {IMAGE_QUALITIES.map((quality) => (
                              <SelectItem key={quality} value={quality}>
                                {t(`imageQuality_${quality}`)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>

                      <Field label={t("defaultResolution")}>
                        <Select
                          value={defaultResolution}
                          onValueChange={(value) => setDefaultResolution(value as "720p" | "1080p")}
                        >
                          <SelectTrigger className="w-full" aria-label={t("defaultResolution")}>
                            <SelectValue>
                              {(value: string) => resolutionOptions.find((o) => o.value === value)?.label ?? value}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {resolutionOptions.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>

                      <Field label={t("defaultAspectRatio")}>
                        <Select
                          value={defaultAspectRatio}
                          onValueChange={(value) => setDefaultAspectRatio(value as "9:16" | "16:9" | "1:1")}
                        >
                          <SelectTrigger className="w-full" aria-label={t("defaultAspectRatio")}>
                            <SelectValue>
                              {(value: string) => {
                                const option = aspectRatioOptions.find((o) => o.value === value);
                                return option ? t(option.labelKey) : value;
                              }}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {aspectRatioOptions.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {t(option.labelKey)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                    </div>
                    <p className="text-xs text-muted-foreground">{t("modelLimitsHint")}</p>
                  </CardContent>
                </Card>

                <GenerationSettings />
              </section>
            )}

            {section === "voice" && <VoiceSection tts={tts} setTTS={setTTS} />}

            {section === "advanced" && (
              <section className="space-y-8">
                <div>
                  <h2 className="mb-4 text-lg font-semibold tracking-tight">{t("tabCharacters")}</h2>
                  <PresenterManager />
                </div>
                <div>
                  <h2 className="mb-4 text-lg font-semibold tracking-tight">{t("tabBrand")}</h2>
                  <BrandSettings />
                </div>
                <Diagnostics />
              </section>
            )}
          </div>
        </div>

        {/* zustand persists every change instantly — say so instead of showing a fake save button */}
        <p className="mt-8 text-xs text-muted-foreground">{t("autoSaveHint")}</p>
      </main>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground/80">{hint}</p>}
    </div>
  );
}

// ==================== connect ====================

type ConnectionStatus = "idle" | "testing" | "ok" | "invalid" | "unknown";

function ConnectSection({
  media,
  setMedia,
  llm,
  setLLM,
  mediaReady,
  llmReady,
}: {
  media: ReturnType<typeof useSettingsStore.getState>["media"];
  setMedia: (media: ReturnType<typeof useSettingsStore.getState>["media"]) => void;
  llm: ReturnType<typeof useSettingsStore.getState>["llm"];
  setLLM: (llm: ReturnType<typeof useSettingsStore.getState>["llm"]) => void;
  mediaReady: boolean;
  llmReady: boolean;
}) {
  const t = useT("settings");
  const [mediaStatus, setMediaStatus] = useState<ConnectionStatus>("idle");
  const [mediaMessage, setMediaMessage] = useState("");
  const [llmStatus, setLlmStatus] = useState<ConnectionStatus>("idle");
  const [llmMessage, setLlmMessage] = useState("");
  const [llmWarning, setLlmWarning] = useState("");

  const testMedia = async () => {
    setMediaStatus("testing");
    setMediaMessage("");
    try {
      const response = await fetch("/api/ai/test-provider", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: media.apiKey, apiSecret: media.apiSecret, baseUrl: media.baseUrl }),
      });
      const data = (await response.json().catch(() => ({ status: "unknown" }))) as {
        status?: ConnectionStatus;
        message?: string;
      };
      setMediaStatus(data.status === "ok" || data.status === "invalid" ? data.status : "unknown");
      setMediaMessage(data.message ?? "");
    } catch (error) {
      setMediaStatus("unknown");
      setMediaMessage(error instanceof Error ? error.message : t("connectFailed"));
    }
  };

  const testLLM = async () => {
    setLlmStatus("testing");
    setLlmMessage("");
    setLlmWarning("");
    try {
      // Server-side: a browser calling a provider directly is blocked by CORS and would report a
      // working endpoint as broken.
      const response = await fetch("/api/llm/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseUrl: llm.baseUrl, apiKey: llm.apiKey, model: llm.model }),
      });
      const data = (await response.json().catch(() => ({ ok: false }))) as {
        ok?: boolean;
        error?: string;
        warning?: string;
      };
      setLlmStatus(data.ok ? "ok" : "invalid");
      if (!data.ok) setLlmMessage(data.error || t("connectFailed"));
      if (data.warning) setLlmWarning(data.warning);
    } catch (error) {
      setLlmStatus("invalid");
      setLlmMessage(error instanceof Error ? error.message : t("connectFailed"));
    }
  };

  return (
    <section className="space-y-6">
      <h2 className="text-lg font-semibold tracking-tight">{t("tabConnect")}</h2>

      {/* What the app costs, stated once and plainly. Issue #1: "免费" was ambiguous enough that
          people could not tell which parts needed paying for. */}
      <div className="rounded-2xl border border-border/60 bg-muted/20 p-5">
        <h3 className="mb-2 text-sm font-semibold">{t("costTitle")}</h3>
        <ul className="space-y-1.5 text-xs leading-relaxed text-muted-foreground">
          <li>· {t("costApp")}</li>
          <li>· {t("costStock")}</li>
          <li>· {t("costScript")}</li>
          <li>· {t("costMedia")}</li>
        </ul>
      </div>

      {/* Media. One credential pair, and the app's recommended connection. */}
      <Card className="surface-panel">
        <CardContent className="space-y-4 p-5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Clapperboard className="size-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold">{t("mediaTitle")}</h3>
                <p className="text-xs text-muted-foreground">{t("mediaSubtitle")}</p>
              </div>
            </div>
            <StatusBadge ready={mediaReady} t={t} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("mediaKeyLabel")}>
              <PasswordInput
                value={media.apiKey}
                onChange={(apiKey) => setMedia({ ...media, apiKey })}
                placeholder={t("mediaKeyPlaceholder")}
              />
            </Field>
            <Field label={t("mediaSecretLabel")}>
              <PasswordInput
                value={media.apiSecret}
                onChange={(apiSecret) => setMedia({ ...media, apiSecret })}
                placeholder={t("mediaSecretPlaceholder")}
              />
            </Field>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" size="sm" onClick={testMedia} disabled={!mediaReady || mediaStatus === "testing"}>
              {mediaStatus === "testing" ? t("connectTesting") : t("connectTest")}
            </Button>
            <a
              href={PRISM_CONSOLE_URL}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-primary underline underline-offset-2"
            >
              {t("mediaGetKey")}
            </a>
            {mediaStatus !== "idle" && mediaStatus !== "testing" && (
              <span
                className={`text-xs ${mediaStatus === "ok" ? "text-success" : mediaStatus === "invalid" ? "text-destructive" : "text-warning"}`}
              >
                {mediaMessage}
              </span>
            )}
          </div>

          <details className="group rounded-lg border border-border/50">
            <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-xs text-muted-foreground hover:text-foreground">
              <span>{t("mediaAdvanced")}</span>
              <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" />
            </summary>
            <div className="px-3 pb-3">
              <Field label={t("mediaBaseUrlLabel")} hint={t("mediaBaseUrlHint")}>
                <Input
                  value={media.baseUrl ?? ""}
                  onChange={(event) => setMedia({ ...media, baseUrl: event.target.value || undefined })}
                  placeholder="https://prism.ullrai.com/api/v1"
                  className="font-mono text-xs"
                />
              </Field>
            </div>
          </details>
        </CardContent>
      </Card>

      {/* Script model. Any OpenAI-compatible endpoint; OpenRouter listed first. */}
      <Card className="surface-panel">
        <CardContent className="space-y-4 p-5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <MessageSquare className="size-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold">{t("llmProvider")}</h3>
                <p className="text-xs text-muted-foreground">{t("llmSubtitle")}</p>
              </div>
            </div>
            <StatusBadge ready={llmReady} t={t} />
          </div>

          <div className="rounded-lg border border-border/50 bg-muted/40 p-3">
            <p className="mb-2 text-xs text-muted-foreground">{t("llmPresetHint")}</p>
            <div className="flex flex-wrap gap-2">
              {LLM_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() =>
                    setLLM({
                      ...llm,
                      baseUrl: preset.baseUrl,
                      model: preset.model,
                      visionModel: preset.visionModel ?? preset.model,
                      ...(preset.apiKey ? { apiKey: preset.apiKey } : {}),
                    })
                  }
                  className="inline-flex items-center gap-1 rounded-md border border-border/50 bg-background px-2.5 py-1 text-xs transition-colors hover:border-primary/40 hover:text-primary"
                >
                  {preset.label}
                  {preset.tipKey && (
                    <span className="text-[10px] text-muted-foreground/70">
                      ({t(preset.tipKey)})
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <Field label={t("llmBaseUrlLabel")}>
            <Input
              value={llm.baseUrl}
              onChange={(event) => setLLM({ ...llm, baseUrl: event.target.value })}
              placeholder="https://openrouter.ai/api/v1"
              className="font-mono text-xs"
            />
          </Field>

          <Field label={t("apiKeyLabel")}>
            <PasswordInput
              value={llm.apiKey}
              onChange={(apiKey) => setLLM({ ...llm, apiKey })}
              placeholder={t("llmApiKeyPlaceholder")}
            />
            {/openrouter/i.test(llm.baseUrl) && (
              <a
                href={OPENROUTER_KEYS_URL}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-primary underline underline-offset-2"
              >
                {t("llmGetKey")}
              </a>
            )}
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("llmTextModel")}>
              <Input
                value={llm.model}
                onChange={(event) => setLLM({ ...llm, model: event.target.value })}
                placeholder="openai/gpt-5.4"
                className="font-mono text-xs"
              />
              {/* A hand-typed model name is the single most common misconfiguration, and a local
                  Ollama additionally requires the :tag (issue #19 follow-up). */}
              <ModelPicker baseUrl={llm.baseUrl} apiKey={llm.apiKey} onPick={(model) => setLLM({ ...llm, model })} />
            </Field>
            <Field label={t("llmVisionModel")} hint={t("llmVisionHint")}>
              <Input
                value={llm.visionModel ?? ""}
                onChange={(event) => setLLM({ ...llm, visionModel: event.target.value || undefined })}
                placeholder="openai/gpt-5.4"
                className="font-mono text-xs"
              />
              <ModelPicker
                baseUrl={llm.baseUrl}
                apiKey={llm.apiKey}
                onPick={(visionModel) => setLLM({ ...llm, visionModel })}
              />
            </Field>
          </div>
          {/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\]):11434/i.test(llm.baseUrl) && (
            <p className="text-xs text-muted-foreground">{t("ollamaModelHint")}</p>
          )}

          <div className="flex flex-wrap items-center gap-3 border-t border-border/50 pt-3">
            <Button variant="outline" size="sm" onClick={testLLM} disabled={!llmReady || llmStatus === "testing"}>
              {llmStatus === "testing" ? t("connectTesting") : t("connectTest")}
            </Button>
            {llmStatus === "ok" && <span className="text-xs text-success">{t("connectOk")}</span>}
          </div>
          {llmStatus === "invalid" && llmMessage && (
            <p className="break-all text-xs text-destructive">{llmMessage}</p>
          )}
          {llmWarning && <p className="break-all text-xs text-warning">{llmWarning}</p>}
          <p className="text-[11px] text-muted-foreground">{t("llmTestTip")}</p>
        </CardContent>
      </Card>
    </section>
  );
}

function StatusBadge({ ready, t }: { ready: boolean; t: ReturnType<typeof useT> }) {
  return ready ? (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-xs text-success">
      <Check className="size-3" aria-hidden="true" />
      {t("statusReady")}
    </span>
  ) : (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 text-xs text-warning">
      <TriangleAlert className="size-3" aria-hidden="true" />
      {t("statusMissing")}
    </span>
  );
}

// ==================== voice ====================

function VoiceSection({
  tts,
  setTTS,
}: {
  tts: ReturnType<typeof useSettingsStore.getState>["tts"];
  setTTS: (tts: ReturnType<typeof useSettingsStore.getState>["tts"]) => void;
}) {
  const t = useT("settings");
  const meta = getTTSProviderMeta(tts.provider);
  const ready = isPaidTTSReady(tts);
  const [status, setStatus] = useState<"idle" | "testing" | "error">("idle");

  // Switching platform resets the fields that only make sense for the previous one — a MiniMax
  // voice id sent to an OpenAI-compatible endpoint is a failure with no visible cause.
  const changeProvider = (provider: TTSProvider) => {
    const next = getTTSProviderMeta(provider);
    setTTS({ ...tts, provider, baseUrl: next.baseUrl, model: next.defaultModel, voice: next.defaultVoice });
  };

  const preview = async () => {
    setStatus("testing");
    try {
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: t("ttsSample"), ttsConfig: resolveTTSConfig(tts) }),
      });
      if (!response.ok) throw new Error("preview failed");
      const audio = new Audio(URL.createObjectURL(await response.blob()));
      await audio.play();
      setStatus("idle");
    } catch {
      setStatus("error");
    }
  };

  return (
    <section className="space-y-6">
      <h2 className="text-lg font-semibold tracking-tight">{t("tabTts")}</h2>
      <Card className="surface-panel">
        <CardContent className="space-y-4 p-5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Mic2 className="size-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold">{t("ttsTitle")}</h3>
                <p className="text-xs text-muted-foreground">{t("ttsSubtitle")}</p>
              </div>
            </div>
            <Switch
              aria-label={t("toggleTts")}
              checked={tts.enabled}
              onCheckedChange={(enabled) => setTTS({ ...tts, enabled })}
            />
          </div>

          {tts.enabled ? (
            <div className="space-y-4">
              <Field label={t("ttsProviderLabel")} hint={meta.hint}>
                <Select
                  value={tts.provider ?? "openai"}
                  onValueChange={(value) => changeProvider((value ?? "openai") as TTSProvider)}
                >
                  <SelectTrigger className="w-full" aria-label={t("ttsProviderLabel")}>
                    <SelectValue>
                      {(value: string) => TTS_PROVIDERS.find((p) => p.value === value)?.label ?? value}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {TTS_PROVIDERS.map((provider) => (
                      <SelectItem key={provider.value} value={provider.value}>
                        {provider.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              {meta.value === "openai" && (
                <div>
                  <p className="mb-2 text-xs text-muted-foreground">{t("ttsPresetHint")}</p>
                  <div className="flex flex-wrap gap-2">
                    {OPENAI_TTS_PRESETS.map((preset) => (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => setTTS({ ...tts, baseUrl: preset.baseUrl, model: preset.model, voice: preset.voice })}
                        className="h-7 rounded-md border border-border/60 bg-muted/20 px-2.5 text-xs transition-colors hover:border-primary/50 hover:text-primary"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <Field label={t("apiKeyLabel")}>
                <PasswordInput
                  value={tts.apiKey}
                  onChange={(apiKey) => setTTS({ ...tts, apiKey })}
                  placeholder={t("ttsApiKeyPlaceholder")}
                />
              </Field>

              {meta.editableBaseUrl && (
                <Field label={t("ttsBaseUrlLabel")}>
                  <Input
                    value={tts.baseUrl}
                    onChange={(event) => setTTS({ ...tts, baseUrl: event.target.value })}
                    placeholder={meta.baseUrl}
                    className="font-mono text-xs"
                  />
                </Field>
              )}

              {meta.needsGroupId && (
                <Field label={t("ttsGroupIdLabel")}>
                  <Input
                    value={tts.groupId ?? ""}
                    onChange={(event) => setTTS({ ...tts, groupId: event.target.value })}
                    placeholder={t("ttsGroupIdPlaceholder")}
                    className="font-mono text-xs"
                  />
                </Field>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t("ttsModelLabel")}>
                  {meta.models.length > 0 ? (
                    <Select
                      value={tts.model || meta.defaultModel}
                      onValueChange={(value) => setTTS({ ...tts, model: value ?? meta.defaultModel })}
                    >
                      <SelectTrigger className="w-full" aria-label={t("ttsModelLabel")}>
                        <SelectValue>
                          {(value: string) => meta.models.find((o) => o.value === value)?.label ?? value}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {meta.models.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      value={tts.model}
                      onChange={(event) => setTTS({ ...tts, model: event.target.value })}
                      placeholder={meta.defaultModel}
                      className="font-mono text-xs"
                    />
                  )}
                </Field>
                <Field label={t("ttsVoiceLabel")}>
                  {meta.voices.length > 0 ? (
                    <Select
                      value={tts.voice || meta.defaultVoice}
                      onValueChange={(value) => setTTS({ ...tts, voice: value ?? meta.defaultVoice })}
                    >
                      <SelectTrigger className="w-full" aria-label={t("ttsVoiceLabel")}>
                        <SelectValue>
                          {(value: string) => meta.voices.find((o) => o.value === value)?.label ?? value}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {meta.voices.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      value={tts.voice}
                      onChange={(event) => setTTS({ ...tts, voice: event.target.value })}
                      placeholder={meta.defaultVoice}
                      className="font-mono text-xs"
                    />
                  )}
                </Field>
              </div>

              <div className="flex items-center gap-3 border-t border-border/50 pt-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={preview}
                  disabled={!ready || status === "testing"}
                  className={status === "error" ? "text-destructive" : ""}
                >
                  {status === "testing" ? t("ttsTesting") : status === "error" ? t("ttsTestError") : t("ttsTestButton")}
                </Button>
                {!ready && <span className="text-[11px] text-muted-foreground">{t("ttsFillKeyFirst")}</span>}
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">{t("ttsDisabledHint")}</p>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

// ==================== diagnostics ====================

function Diagnostics() {
  const t = useT("settings");
  const [report, setReport] = useState("");

  const load = async () => {
    try {
      const response = await fetch("/api/health");
      setReport(JSON.stringify(await response.json(), null, 2));
    } catch (error) {
      setReport(String(error));
    }
  };

  return (
    <details className="group rounded-lg border border-border/40">
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground">
        <span>{t("diagnosticsTitle")}</span>
        <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
      </summary>
      <div className="px-4 pb-4">
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load}>
            {report ? t("diagnosticsRefresh") : t("diagnosticsShow")}
          </Button>
          {report && (
            <Button variant="outline" size="sm" onClick={() => navigator.clipboard.writeText(report)}>
              {t("diagnosticsCopy")}
            </Button>
          )}
        </div>
        {report && (
          <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded bg-muted/30 p-3 text-xs leading-relaxed">
            {report}
          </pre>
        )}
        <p className="mt-2 text-xs text-muted-foreground">{t("diagnosticsHint")}</p>
      </div>
    </details>
  );
}
