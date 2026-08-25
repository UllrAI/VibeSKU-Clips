/**
 * Atlas Cloud "one key covers everything" preset for quick onboarding.
 *
 * Landing-page "try first, configure later" flow: when a beginner has configured no keys at all,
 * pasting a single Atlas key unlocks script generation (LLM) + product-image analysis (Vision)
 * + image gen + video gen + voiceover (TTS) all at once, with models pre-selected automatically.
 * Model IDs are taken from the Atlas official on-sale catalog (verified via official MCP, 2026-06).
 */

/**
 * Media/predictions gateway: image gen, video gen and `POST /model/generateAudio` (TTS) all live
 * under `/api/v1`. This is the base printed on the Atlas key console, so it is the one users copy.
 */
export const ATLAS_BASE_URL = "https://api.atlascloud.ai/api/v1";

/**
 * OpenAI-compatible chat gateway. Atlas serves it on a DIFFERENT path from the media one above:
 * `/v1/chat/completions` and `/v1/models` (an OpenAI-shaped `{data:[{id}]}` catalog), while
 * `/api/v1/models` lists only media models. Sending a chat request to `/api/v1` answers 404 with
 * an empty body, which surfaces as "endpoint or model not found" and sends users hunting for a
 * wrong model id (issue #24). Never use ATLAS_BASE_URL for LLM/Vision calls.
 */
export const ATLAS_LLM_BASE_URL = "https://api.atlascloud.ai/v1";

/**
 * Deep link to the Atlas Cloud API-key console (verified 2026-07: page titled "API Keys - Atlas Cloud";
 * unauthenticated visitors are routed through login/signup and land back on this page).
 * Used by every "get a free key" CTA — deep-linking here instead of the homepage saves beginners
 * from hunting for the key console on their own.
 */
/** Atlas sign-up/landing link with the project referral — the in-app "get a key" CTA
 * targets key-less new users, who must register first anyway (the console deep link
 * bounces logged-out visitors to sign-in). */
export const ATLAS_KEYS_URL = "https://www.atlascloud.ai?ref=JPM683";

export const ATLAS_ONEKEY_MODELS = {
  /**
   * Script (LLM): DeepSeek V4 Pro — flagship-tier writing quality for scripts and the judge
   * panel. Field lesson (2026-08): v3.2's thinking mode leaks reasoning text into the JSON
   * output and breaks script parsing, so the default steers to a clean-JSON flagship; users
   * can still pick any model themselves via the settings model picker.
   */
  llm: "deepseek-ai/deepseek-v4-pro",
  /** Product-image analysis (Vision): Qwen VL multimodal */
  vision: "qwen/qwen3-vl-30b-a3b-instruct",
  /** Image generation: GPT Image 2 — excellent product-image quality */
  image: "openai/gpt-image-2/text-to-image",
  /** Video generation: Seedance 2.0 text-to-video (native audio, safe for both text and image workflows) */
  video: "bytedance/seedance-2.0/text-to-video",
} as const;

/** Default image/video gen models: keep user's existing choice; fall back to Atlas defaults only when nothing is configured (never overwrite user settings). */
export function fillAtlasModelDefaults(current: { image?: string; video?: string }): {
  image: string;
  video: string;
} {
  return {
    image: current.image?.trim() ? current.image : ATLAS_ONEKEY_MODELS.image,
    video: current.video?.trim() ? current.video : ATLAS_ONEKEY_MODELS.video,
  };
}
