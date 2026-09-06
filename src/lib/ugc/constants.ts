/** The fixed timing and speech constraints shared by every clip. */
export const CLIP_SPEC = {
  durationSeconds: 15,
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

/** Whether the operator reviews generated key frames before video rendering. */
export const VIDEO_MODES = ["one_take", "storyboard"] as const;
export type VideoMode = (typeof VIDEO_MODES)[number];

export const VIDEO_ASPECT_RATIOS = ["9:16", "16:9"] as const;
export type VideoAspectRatio = (typeof VIDEO_ASPECT_RATIOS)[number];

export const VIDEO_RESOLUTIONS = ["480p", "720p", "1080p", "2k"] as const;
export type VideoResolution = (typeof VIDEO_RESOLUTIONS)[number];

/** Prism's H3 adapter exposes only its lower two output tiers. */
export const PRISM_VIDEO_RESOLUTIONS = ["480p", "720p"] as const;
export const LK666_VIDEO_RESOLUTIONS = ["720p", "1080p", "2k"] as const;
export const VIDEO_GENERATION_PROVIDERS = ["prism", "lk666"] as const;
export type VideoGenerationProvider =
  (typeof VIDEO_GENERATION_PROVIDERS)[number];

export function videoResolutionsForProvider(
  provider: VideoGenerationProvider,
): readonly VideoResolution[] {
  return provider === "lk666"
    ? LK666_VIDEO_RESOLUTIONS
    : PRISM_VIDEO_RESOLUTIONS;
}

export const DEFAULT_VIDEO_SETTINGS = {
  aspectRatio: "9:16",
  resolution: "720p",
} as const satisfies {
  aspectRatio: VideoAspectRatio;
  resolution: VideoResolution;
};

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

/** Shared network deadline for media provider requests. */
export const MEDIA_REQUEST_TIMEOUT_MS = 60_000;

/** Prism model choices are product decisions; credentials remain environment settings. */
export const PRISM_MEDIA = {
  /** `quality` is only honoured by Prism's gpt-image-* family. */
  imageModel: "gpt-image-2",
  imageSize: "1K",
  imageQuality: "low",
  /** H3 takes up to nine reference images and a 1-15 second duration. */
  videoModel: "minimax-h3",
  maxVideoReferences: 9,
} as const;
