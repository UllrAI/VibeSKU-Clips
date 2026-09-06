/**
 * Delivery specification for every clip the platform produces. These values are
 * contractual: the renderer, the quality gate, and the export manifest all read
 * them from here.
 */
export const CLIP_SPEC = {
  durationSeconds: 15,
  width: 1080,
  height: 1920,
  aspectRatio: "9:16",
  /** Tolerance either side of the target duration before a clip is rejected. */
  durationToleranceMs: 700,
  /** Roughly the number of spoken characters that fit in the target duration. */
  voiceoverBudget: { latin: 210, cjk: 90 },
} as const;

export const SUPPORTED_LOCALES = [
  "en",
  "es",
  "pt",
  "ja",
  "ko",
  "zh-Hans",
] as const;
export type ContentLocale = (typeof SUPPORTED_LOCALES)[number];

/** Locales whose voiceover budget is counted in characters rather than words. */
const CJK_LOCALES = new Set<string>(["zh-Hans", "ja", "ko"]);

export function voiceoverBudgetFor(locale: string): number {
  return CJK_LOCALES.has(locale)
    ? CLIP_SPEC.voiceoverBudget.cjk
    : CLIP_SPEC.voiceoverBudget.latin;
}

export const SUPPORTED_MARKETS = [
  "US",
  "MX",
  "BR",
  "JP",
  "KR",
  "ES",
  "CN",
] as const;
export type TargetMarket = (typeof SUPPORTED_MARKETS)[number];

export const SCRIPT_TEMPLATES = [
  "spokesperson",
  "scenario",
  "tutorial",
] as const;
export type ScriptTemplate = (typeof SCRIPT_TEMPLATES)[number];

/**
 * Credit cost per unit of work. Retries and operator-requested regenerations
 * both consume credits, and both are recorded separately from the planned count.
 */
export const CREDIT_COST = {
  analysis: 1,
  script: 1,
  render: 10,
} as const;

/** A generation attempt is abandoned after this many system retries. */
export const MAX_RENDER_ATTEMPTS = 3;

export const MAX_BATCH_CLIPS = 200;

/**
 * Prism is a first-party service and the models below are a product decision,
 * not a per-deployment setting. Only the credentials come from the environment.
 */
export const MEDIA_PROVIDER = {
  baseUrl: "https://prism.ullrai.com/api/v1",
  /** `quality` is only honoured by Prism's gpt-image-* family. */
  imageModel: "gpt-image-2",
  imageQuality: "low",
  /** H3 takes up to nine reference images and a 1-15 second duration. */
  videoModel: "minimax-h3",
  videoResolution: "1080p",
  maxVideoReferences: 9,
  requestTimeoutMs: 60_000,
} as const;
