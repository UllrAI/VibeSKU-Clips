/**
 * Paid TTS presets (pure data, shared by client and server, no server-only dependencies).
 *
 * Voiceover is optional now: the default video model renders its own audio, so this path exists
 * for projects that want one consistent narrator across every shot, or a language the video
 * model does not speak well.
 *
 * Every platform carries its own key. Two of them used to borrow the key from whichever media
 * platform the user had configured, which meant the voice you could pick depended on a choice
 * made in a different tab for a different purpose — exactly the kind of hidden coupling issue #1
 * asked to remove.
 */

export type TTSProvider = "openai" | "minimax";

export interface TTSVoiceOption {
  value: string;
  label: string;
}

export interface TTSProviderMeta {
  value: TTSProvider;
  label: string;
  /** Default baseUrl for this platform's TTS endpoint */
  baseUrl: string;
  /** Default model id */
  defaultModel: string;
  /** Available models (empty means free-form input, e.g. OpenAI-compatible) */
  models: TTSVoiceOption[];
  /** Default voice id */
  defaultVoice: string;
  /** Suggested voice list */
  voices: TTSVoiceOption[];
  /** Whether a GroupId is required (needed for the MiniMax domestic endpoint api.minimax.chat) */
  needsGroupId?: boolean;
  /** Whether to expose a baseUrl input field (OpenAI-compatible and MiniMax support switching regional endpoints) */
  editableBaseUrl?: boolean;
  /** Configuration hint shown in the UI */
  hint?: string;
}

/** OpenAI-compatible quick presets (one click populates baseUrl + model + voice) */
export const OPENAI_TTS_PRESETS = [
  { label: "硅基流动 CosyVoice", baseUrl: "https://api.siliconflow.cn/v1", model: "FunAudioLLM/CosyVoice2-0.5B", voice: "FunAudioLLM/CosyVoice2-0.5B:alex" },
  { label: "OpenAI tts-1", baseUrl: "https://api.openai.com/v1", model: "tts-1", voice: "alloy" },
  { label: "火山方舟", baseUrl: "https://ark.cn-beijing.volces.com/api/v3", model: "doubao-tts", voice: "zh_female_cancan" },
];

export const TTS_PROVIDERS: TTSProviderMeta[] = [
  {
    value: "openai",
    label: "OpenAI 兼容 (/audio/speech)",
    baseUrl: "https://api.siliconflow.cn/v1",
    defaultModel: "FunAudioLLM/CosyVoice2-0.5B",
    models: [],
    defaultVoice: "FunAudioLLM/CosyVoice2-0.5B:alex",
    voices: [],
    editableBaseUrl: true,
    hint: "兼容 OpenAI tts-1、硅基流动 CosyVoice、火山方舟等所有 /audio/speech 端点。",
  },
  {
    value: "minimax",
    label: "MiniMax 海螺 (T2A v2)",
    baseUrl: "https://api.minimax.chat/v1",
    defaultModel: "speech-2.6-hd",
    models: [
      { value: "speech-2.6-hd", label: "speech-2.6-hd（高保真）" },
      { value: "speech-2.6-turbo", label: "speech-2.6-turbo（快速）" },
      { value: "speech-2.5-hd", label: "speech-2.5-hd" },
    ],
    defaultVoice: "female-tianmei",
    voices: [
      { value: "female-tianmei", label: "甜美女声（默认）" },
      { value: "female-shaonv", label: "少女音" },
      { value: "female-yujie", label: "御姐音" },
      { value: "female-chengshu", label: "成熟女声" },
      { value: "presenter_female", label: "女主持人" },
      { value: "presenter_male", label: "男主持人" },
      { value: "male-qn-qingse", label: "青涩青年（男）" },
      { value: "male-qn-jingying", label: "精英青年（男）" },
      { value: "audiobook_female_1", label: "有声书女声" },
    ],
    needsGroupId: true,
    editableBaseUrl: true,
    hint: "海螺开放平台的 API Key + GroupId。国际版改 baseUrl 为 https://api.minimax.io/v1（可不填 GroupId）。",
  },
];

export const DEFAULT_TTS_PROVIDER: TTSProvider = "openai";

/** Get platform metadata (with fallback: unknown/legacy config falls back to openai) */
export function getTTSProviderMeta(provider?: string | null): TTSProviderMeta {
  return TTS_PROVIDERS.find((p) => p.value === provider) ?? TTS_PROVIDERS[0];
}

/** Minimal input shape required when resolving TTS config (avoids circular dependency with store types) */
interface TTSSettingLike {
  enabled?: boolean;
  provider?: string;
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  voice?: string;
  speed?: number;
  groupId?: string;
}
/** Fully resolved TTS config used for actual requests / preview playback */
export interface ResolvedTTSConfig {
  provider: TTSProvider;
  baseUrl: string;
  apiKey: string;
  model: string;
  voice: string;
  speed?: number;
  groupId?: string;
}

/** Fill a partial TTS setting out to a complete, sendable config using the platform defaults. */
export function resolveTTSConfig(tts: TTSSettingLike | undefined): ResolvedTTSConfig {
  const meta = getTTSProviderMeta(tts?.provider);
  // Editable platforms honour a user-supplied endpoint; the rest are pinned to their own.
  const baseUrl = meta.editableBaseUrl ? (tts?.baseUrl || meta.baseUrl) : meta.baseUrl;
  return {
    apiKey: tts?.apiKey || "",
    provider: meta.value,
    baseUrl,
    model: tts?.model || meta.defaultModel,
    voice: tts?.voice || meta.defaultVoice,
    ...(tts?.speed != null && { speed: tts.speed }),
    ...(meta.value === "minimax" && tts?.groupId ? { groupId: tts.groupId } : {}),
  };
}

/** Whether paid TTS is ready (switch enabled + key/endpoint/model/voice all present). */
export function isPaidTTSReady(tts: TTSSettingLike | undefined): boolean {
  if (!tts?.enabled) return false;
  const c = resolveTTSConfig(tts);
  return Boolean(c.apiKey && c.baseUrl && c.model && c.voice);
}
