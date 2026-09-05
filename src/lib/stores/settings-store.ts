import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import { DEFAULT_TTS_PROVIDER, type TTSProvider } from "@/lib/tts-presets";
import {
  DEFAULT_IMAGE_PARAMS,
  DEFAULT_VIDEO_PARAMS,
  type ImageGenParams,
  type VideoGenParams,
} from "@/lib/gen-params";
import {
  DEFAULT_IMAGE_MODEL,
  DEFAULT_IMAGE_QUALITY,
  DEFAULT_VIDEO_MODEL,
  PRISM_IMAGE_MODELS,
  PRISM_VIDEO_MODELS,
  type PrismImageQuality,
} from "@/lib/providers/prism-catalog";
import type { MotionIntensity, MotionRealismTier } from "@/lib/motion-prompt";
import {
  isProductionProfileId,
  productionProfilePatch,
  type ProductionProfileId,
} from "@/lib/production-profiles";

/**
 * Prism credentials — the app's single media platform.
 *
 * There is no `enabled` flag and no platform list: media generation is either configured or it
 * is not, and "configured" means both halves of the credential pair are present. Earlier
 * versions asked users to pick from seven platforms before they could make anything, which is
 * the onboarding cost issue #1 set out to remove.
 */
export interface MediaSetting {
  apiKey: string;
  apiSecret: string;
  /** Override the Prism gateway (staging or self-hosted). Blank = the production default. */
  baseUrl?: string;
}

/** Script + vision model. Any OpenAI-compatible endpoint; OpenRouter is the recommended one. */
export interface LLMSetting {
  /** Display label for the chosen preset, or a user-supplied name for a custom endpoint. */
  provider: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  /** Model used to read product photos; falls back to `model` when blank. */
  visionModel?: string;
}

/** Optional voiceover. The default video model already renders its own audio. */
export interface TTSSetting {
  enabled: boolean;
  provider?: TTSProvider;
  baseUrl: string;
  apiKey: string;
  model: string;
  voice: string;
  speed?: number;
  /** GroupId required by MiniMax's domestic endpoint. */
  groupId?: string;
}

export interface SettingsState {
  media: MediaSetting;
  llm: LLMSetting;
  tts: TTSSetting;
  defaultImageModel: string;
  defaultVideoModel: string;
  /** Quality tier for the gpt-image-* family. Drafts are cheap on purpose. */
  imageQuality: PrismImageQuality;
  defaultResolution: "720p" | "1080p";
  defaultAspectRatio: "9:16" | "16:9" | "1:1";
  imageParams: ImageGenParams;
  videoParams: VideoGenParams;
  motionIntensity: MotionIntensity;
  motionRealism: MotionRealismTier;
  /** Keyframe chaining: pin the next shot's first frame, continue from the real tail, or neither. */
  chainMode: "pin" | "tail" | "off";
  /** Global look preset id from look-presets.ts; "none" adds nothing. */
  visualLook: string;
  activeProductionProfile: ProductionProfileId;
  locale: Locale;
  /** `auto` follows the system language until the user picks one themselves. */
  localeSource: "auto" | "user";

  setLocale: (locale: Locale) => void;
  applyAutoLocale: (locale: Locale) => void;
  setMedia: (media: MediaSetting) => void;
  setLLM: (llm: LLMSetting) => void;
  setTTS: (tts: TTSSetting) => void;
  setDefaultImageModel: (model: string) => void;
  setDefaultVideoModel: (model: string) => void;
  setImageQuality: (quality: PrismImageQuality) => void;
  setDefaultResolution: (resolution: "720p" | "1080p") => void;
  setDefaultAspectRatio: (ratio: "9:16" | "16:9" | "1:1") => void;
  setImageParams: (params: ImageGenParams) => void;
  setVideoParams: (params: VideoGenParams) => void;
  setMotionIntensity: (intensity: MotionIntensity) => void;
  setMotionRealism: (tier: MotionRealismTier) => void;
  setChainMode: (mode: "pin" | "tail" | "off") => void;
  setVisualLook: (look: string) => void;
  applyProductionProfile: (profile: ProductionProfileId) => void;
}

/** True when media generation can actually run. Both halves of the pair are required. */
export function isMediaReady(media: MediaSetting | undefined): boolean {
  return Boolean(media?.apiKey?.trim() && media?.apiSecret?.trim());
}

const PRISM_IMAGE_IDS = new Set(PRISM_IMAGE_MODELS.map((m) => m.id));
const PRISM_VIDEO_IDS = new Set(PRISM_VIDEO_MODELS.map((m) => m.id));

/**
 * Migration to the Prism-only settings shape (v6).
 *
 * Everything platform-specific is dropped rather than translated: an Atlas or fal key cannot be
 * used against Prism, and a model id like `bytedance/seedance-2.0/text-to-video` has no Prism
 * equivalent that is safe to guess — guessing wrong bills the user for a model they did not
 * choose. Stale ids are therefore reset to the defaults, and the LLM block is preserved intact
 * because any OpenAI-compatible endpoint still works exactly as it did.
 */
export function migrateSettings(persisted: unknown): SettingsState {
  const state = (persisted ?? {}) as SettingsState & {
    providers?: Record<string, { apiKey?: string }>;
    customModels?: unknown;
  };

  delete state.providers;
  delete state.customModels;

  state.media = {
    apiKey: state.media?.apiKey ?? "",
    apiSecret: state.media?.apiSecret ?? "",
    ...(state.media?.baseUrl ? { baseUrl: state.media.baseUrl } : {}),
  };

  // A model id from the old multi-platform catalog is not a Prism model id.
  if (!PRISM_IMAGE_IDS.has(state.defaultImageModel)) state.defaultImageModel = DEFAULT_IMAGE_MODEL;
  if (!PRISM_VIDEO_IDS.has(state.defaultVideoModel)) state.defaultVideoModel = DEFAULT_VIDEO_MODEL;
  if (!state.imageQuality) state.imageQuality = DEFAULT_IMAGE_QUALITY;

  // Retired script endpoints. The LLM block is otherwise preserved: any OpenAI-compatible
  // endpoint still works exactly as it did.
  if (state.llm) {
    // On Windows `localhost` resolves to ::1 first while Ollama binds 127.0.0.1 only, so the
    // hostname form fails to connect for a reason the user cannot see (issue #19 follow-up).
    if (/^http:\/\/localhost:11434(\/|$)/i.test(state.llm.baseUrl || "")) {
      state.llm = { ...state.llm, baseUrl: state.llm.baseUrl.replace("localhost", "127.0.0.1") };
    }
    // Pollinations retired its keyless text API and Atlas Cloud is no longer a supported gateway;
    // both leave an endpoint that can only ever fail, so they are cleared rather than rewritten.
    if (/pollinations\.ai|atlascloud\.ai/i.test(state.llm.baseUrl || "")) {
      state.llm = { ...state.llm, baseUrl: "", apiKey: "", model: "", visionModel: "" };
    }
  }

  // The Atlas and fal.ai voices borrowed their key from a platform that no longer exists, so a
  // persisted config naming either of them is unusable rather than merely stale.
  const retiredVoice = state.tts?.provider as string | undefined;
  if (state.tts && (retiredVoice === "atlas" || retiredVoice === "falai")) {
    state.tts = { ...state.tts, enabled: false, provider: DEFAULT_TTS_PROVIDER, apiKey: "", baseUrl: "", model: "", voice: "" };
  }

  if (!isProductionProfileId(state.activeProductionProfile)) state.activeProductionProfile = "balanced";
  return state;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      media: { apiKey: "", apiSecret: "" },
      llm: { provider: "", baseUrl: "", apiKey: "", model: "", visionModel: "" },
      tts: {
        enabled: false,
        provider: DEFAULT_TTS_PROVIDER,
        baseUrl: "",
        apiKey: "",
        model: "",
        voice: "",
        speed: 1,
      },
      defaultImageModel: DEFAULT_IMAGE_MODEL,
      defaultVideoModel: DEFAULT_VIDEO_MODEL,
      imageQuality: DEFAULT_IMAGE_QUALITY,
      defaultResolution: "720p",
      defaultAspectRatio: "9:16",
      imageParams: DEFAULT_IMAGE_PARAMS,
      videoParams: DEFAULT_VIDEO_PARAMS,
      motionIntensity: "normal",
      motionRealism: "auto",
      chainMode: "pin",
      visualLook: "none",
      activeProductionProfile: "balanced",
      locale: DEFAULT_LOCALE,
      localeSource: "auto",

      setLocale: (locale) => set({ locale, localeSource: "user" }),
      applyAutoLocale: (locale) => set({ locale }),
      setMedia: (media) => set({ media }),
      setLLM: (llm) => set({ llm }),
      setTTS: (tts) => set({ tts }),
      setDefaultImageModel: (model) => set({ defaultImageModel: model }),
      setDefaultVideoModel: (model) => set({ defaultVideoModel: model }),
      setImageQuality: (quality) => set({ imageQuality: quality }),
      setDefaultResolution: (resolution) => set({ defaultResolution: resolution }),
      setDefaultAspectRatio: (ratio) => set({ defaultAspectRatio: ratio }),
      setImageParams: (params) => set({ imageParams: params }),
      setVideoParams: (params) => set({ videoParams: params }),
      setMotionIntensity: (intensity) => set({ motionIntensity: intensity }),
      setMotionRealism: (tier) => set({ motionRealism: tier }),
      setChainMode: (mode) => set({ chainMode: mode }),
      setVisualLook: (look) => set({ visualLook: look }),
      applyProductionProfile: (profile) => set((state) => productionProfilePatch(profile, state)),
    }),
    {
      name: "daihuo-jianshou-settings",
      // v6: collapse the seven-platform media config onto Prism, drop custom models, and reset
      // model ids that belonged to the old catalog. See migrateSettings for why nothing is
      // translated across.
      version: 6,
      migrate: migrateSettings,
    }
  )
);
