/**
 * Script-model presets shown in Settings.
 *
 * The app talks to one kind of endpoint — OpenAI-compatible chat completions — so a "preset" is
 * nothing more than a base URL and a sensible starting model. OpenRouter is first because one
 * key there reaches every frontier model, which is the shortest path from "installed" to "made
 * a video"; everything else is the same code path with a different host.
 *
 * Kept as data in its own module so the endpoints are unit-testable: a preset that ships a dead
 * endpoint silently bricks the app for anyone who picks it (issue #19 — Pollinations retired its
 * keyless text API, and every new install that chose that preset failed with a bare 402).
 *
 * `apiKey` pre-fills a placeholder ONLY for endpoints that genuinely ignore the key (local
 * Ollama). Never pre-fill one for an endpoint that needs a real key — it disguises
 * "not configured" as "configured".
 */

export interface LLMPreset {
  label: string;
  baseUrl: string;
  model: string;
  /** Vision-capable model on the same endpoint, when the default model cannot read images. */
  visionModel?: string;
  /** i18n key for the short tip shown next to the label (empty = no tip) */
  tipKey?: string;
  /** placeholder key for keyless endpoints only */
  apiKey?: string;
}

/** Where the recommended preset's key comes from. */
export const OPENROUTER_KEYS_URL = "https://openrouter.ai/keys";

export const LLM_PRESETS: LLMPreset[] = [
  {
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    model: "openai/gpt-5.6-luna",
    visionModel: "openai/gpt-5.6-luna",
    tipKey: "presetOpenrouterTip",
  },
  { label: "OpenAI", baseUrl: "https://api.openai.com/v1", model: "gpt-5.6-luna", visionModel: "gpt-5.6-luna" },
  { label: "DeepSeek", baseUrl: "https://api.deepseek.com", model: "deepseek-v4-flash", tipKey: "presetDeepseekTip" },
  { label: "Kimi", baseUrl: "https://api.moonshot.cn/v1", model: "kimi-k2.5", tipKey: "presetKimiTip" },
  { label: "智谱 GLM", baseUrl: "https://open.bigmodel.cn/api/paas/v4", model: "glm-5-turbo", tipKey: "presetGlmTip" },
  { label: "MiniMax", baseUrl: "https://api.minimax.chat/v1", model: "MiniMax-M2.7", tipKey: "presetMinimaxTip" },
  { label: "豆包", baseUrl: "https://ark.cn-beijing.volces.com/api/v3", model: "doubao-seed-2-0-pro-260215", tipKey: "presetDoubaoTip" },
  // 127.0.0.1 rather than localhost: on Windows, localhost resolves to ::1 first while Ollama
  // binds 127.0.0.1 only, so the hostname form can fail to connect for reasons the user cannot
  // see. The model must match a pulled tag exactly — `ollama pull qwen2.5` installs this id.
  { label: "Ollama 本地", baseUrl: "http://127.0.0.1:11434/v1", model: "qwen2.5", tipKey: "presetOllamaTip", apiKey: "ollama" },
];

/** The preset a fresh install is steered towards. */
export const RECOMMENDED_PRESET = LLM_PRESETS[0];

/**
 * The settings after picking a preset. The user's own key survives a switch between keyed
 * endpoints; a placeholder key from a keyless preset does not, so a real endpoint never looks
 * configured with `ollama` in the key field.
 */
export function applyLLMPreset<T extends { apiKey: string; model: string; visionModel?: string }>(
  preset: LLMPreset,
  current: T,
): T & { baseUrl: string } {
  const placeholder = LLM_PRESETS.some((p) => p.apiKey !== undefined && p.apiKey === current.apiKey);
  return {
    ...current,
    baseUrl: preset.baseUrl,
    model: preset.model,
    visionModel: preset.visionModel ?? preset.model,
    apiKey: preset.apiKey ?? (placeholder ? "" : current.apiKey),
  };
}
