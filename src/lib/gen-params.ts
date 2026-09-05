/**
 * Pure mapping between the global defaults a user sets once and the per-request options the
 * provider layer understands (shared by client and server, no server-only dependencies).
 *
 * Aspect ratio and resolution are stored as human choices ("9:16", "1080p") and converted to
 * pixels here; the provider converts them back to whatever vocabulary its model uses. Keeping
 * the round trip in two named places beats scattering `width > height` checks through the app.
 */

export type GenAspectRatio = "9:16" | "16:9" | "1:1";
export type GenResolution = "720p" | "1080p";
export type GenMediaType = "image" | "video";

/**
 * Global defaults for image generation.
 *
 * Deliberately short: these are exactly the knobs Prism's `/image-gen` reads. Inference steps,
 * guidance scale and seed used to live here for platforms that took them — the image endpoint
 * has no such fields, and a control that silently does nothing is worse than no control.
 */
export interface ImageGenParams {
  aspectRatio: GenAspectRatio;
  /** How many images one generate action produces. */
  count: number;
  negativePrompt?: string;
}

/** Global defaults for video generation — again, only what `/video-gen` actually reads. */
export interface VideoGenParams {
  aspectRatio: GenAspectRatio;
  resolution: GenResolution;
  /** Seconds; snapped to the chosen model's allowed values before the call. */
  duration?: number;
  /** Leave empty to randomize each time. */
  seed?: number;
  negativePrompt?: string;
}

export const DEFAULT_IMAGE_PARAMS: ImageGenParams = {
  aspectRatio: "9:16",
  count: 1,
};

export const DEFAULT_VIDEO_PARAMS: VideoGenParams = {
  aspectRatio: "9:16",
  // The default model (MiniMax H3) tops out at 720p, so 1080p here would only ever be
  // silently snapped back down — better to state the truth the user will actually get.
  resolution: "720p",
  duration: 6,
};

export const ASPECT_RATIO_OPTIONS: { value: GenAspectRatio; label: string }[] = [
  { value: "9:16", label: "9:16 竖屏" },
  { value: "16:9", label: "16:9 横屏" },
  { value: "1:1", label: "1:1 方形" },
];

export const RESOLUTION_OPTIONS: { value: GenResolution; label: string }[] = [
  { value: "720p", label: "720p" },
  { value: "1080p", label: "1080p" },
];

/** Aspect ratio → image dimensions (portrait commerce mode defaults to higher resolution) */
export function imageSize(aspect: GenAspectRatio): { width: number; height: number } {
  switch (aspect) {
    case "16:9":
      return { width: 1920, height: 1080 };
    case "1:1":
      return { width: 1024, height: 1024 };
    case "9:16":
    default:
      return { width: 1080, height: 1920 };
  }
}

/** Resolution + aspect ratio → video dimensions */
export function videoSize(resolution: GenResolution, aspect: GenAspectRatio): { width: number; height: number } {
  const long = resolution === "1080p" ? 1920 : 1280;
  const short = resolution === "1080p" ? 1080 : 720;
  switch (aspect) {
    case "16:9":
      return { width: long, height: short };
    case "1:1":
      return { width: short, height: short };
    case "9:16":
    default:
      return { width: short, height: long };
  }
}

/**
 * Maps image parameters to the options object expected by /api/ai/image (field names aligned
 * with ImageOptions). `quality` comes from its own setting rather than from ImageGenParams
 * because it is a cost decision made once, not a per-shot framing choice.
 */
export function buildImageOptions(p: ImageGenParams | undefined, quality?: string): Record<string, unknown> {
  const params = p ?? DEFAULT_IMAGE_PARAMS;
  const { width, height } = imageSize(params.aspectRatio);
  return {
    width,
    height,
    count: params.count ?? 1,
    ...(quality ? { quality } : {}),
    ...(params.negativePrompt ? { negativePrompt: params.negativePrompt } : {}),
  };
}

/** Maps video parameters to the options object expected by /api/ai/video (field names aligned with VideoOptions) */
export function buildVideoOptions(p: VideoGenParams | undefined): Record<string, unknown> {
  const params = p ?? DEFAULT_VIDEO_PARAMS;
  const { width, height } = videoSize(params.resolution, params.aspectRatio);
  return {
    width,
    height,
    ...(params.duration != null && { duration: params.duration }),
    ...(params.seed != null && { seed: params.seed }),
    ...(params.negativePrompt ? { negativePrompt: params.negativePrompt } : {}),
  };
}

/** A resolved generation target: the Prism credentials plus the model to bill against. */
export interface GenModelTarget {
  provider: "prism";
  model: string;
  apiKey: string;
  apiSecret: string;
  baseUrl?: string;
}

/** Just enough of MediaSetting to resolve a target, without importing the store into server code. */
interface MediaLike {
  apiKey?: string;
  apiSecret?: string;
  baseUrl?: string;
}

/**
 * Resolve the configured model to a callable target, or null when media is not set up yet.
 *
 * This used to be an async round trip to /api/ai/models, because the model's owning platform
 * could only be discovered by asking every configured platform for its catalog. With one
 * gateway and a static catalog there is nothing to discover, so callers get a plain value and
 * lose a network hop on every generate.
 */
export function resolveModelTarget(media: MediaLike | undefined, model: string | undefined): GenModelTarget | null {
  const apiKey = media?.apiKey?.trim();
  const apiSecret = media?.apiSecret?.trim();
  if (!apiKey || !apiSecret || !model) return null;
  return {
    provider: "prism",
    model,
    apiKey,
    apiSecret,
    ...(media?.baseUrl?.trim() ? { baseUrl: media.baseUrl.trim() } : {}),
  };
}
