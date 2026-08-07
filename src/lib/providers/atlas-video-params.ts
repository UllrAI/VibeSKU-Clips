/**
 * Per-model video request params for Atlas Cloud (mirrors buildImageSizeParams, issue #18).
 *
 * Atlas video models disagree on how the same intent is expressed:
 * - last frame:  `last_image` (Seedance / Veo / Wan) vs `end_image` (MiniMax H3 / Kling O3)
 * - duration:    integer enums with different ranges (H3 4-15, Kling O3 3-15, Veo {4,6,8},
 *                Hailuo 2.3 {6,10}, Hailuo i2v-pro has NO duration param at all)
 * - resolution:  different tier vocabularies ("480p/720p/1080p", "768P/2K", "720p/1080p/4k")
 * - aspect:      `ratio` vs `aspect_ratio`, some enums include "adaptive"
 * - audio:       `generate_audio` vs `sound` vs none (H3 always generates native stereo)
 * - references:  paired arrays (Seedance), one mixed `refers` array (H3),
 *                `images` + single `video` (Kling O3), `images` + `videos` (Wan 2.7)
 *
 * Every spec below was transcribed from the model's published input schema
 * (static.atlascloud.ai/model/schema/*.json, fetched 2026-08). Legacy families that the
 * original hardcoded body already serves (seedance-2.0/-fast, v1.5-pro, kling-v3.0,
 * vidu q3, wan-2.6) intentionally have NO spec so their request bodies stay byte-identical.
 *
 * Unknown models discovered at runtime get a spec derived from the same published
 * schema via specFromOpenApiInput() — this is what makes new Atlas models usable
 * without a code change.
 */

import type { VideoOptions } from './types'

// ==================== Spec type ====================

/** How a model expects reference materials for reference-to-video generation */
export type ReferenceShape =
  | 'paired-arrays' // reference_images[] + reference_videos[] (Seedance family)
  | 'refers' // one mixed refers[] of image/video/audio URLs (MiniMax H3)
  | 'images-plus-video' // images[] + a single video string (Kling O3)
  | 'images-videos' // images[] + videos[] (Wan 2.7)

export interface AtlasVideoParamSpec {
  /** Field carrying the first-frame image (present on i2v variants) */
  firstFrameKey?: 'image'
  /** Field carrying the pinned last frame, when the model supports one */
  lastFrameKey?: 'last_image' | 'end_image'
  /** Allowed integer durations in seconds; omit for free-form integer duration */
  durationEnum?: number[]
  /** Model exposes no duration parameter at all (e.g. Hailuo 2.3 i2v-pro) */
  noDuration?: boolean
  /** Allowed resolution tier strings, verbatim from the schema */
  resolutionEnum?: string[]
  /** Aspect-ratio field name and its allowed values */
  ratioKey?: 'ratio' | 'aspect_ratio'
  ratioEnum?: string[]
  /** Audio on/off boolean field, when the model exposes one */
  audioKey?: 'generate_audio' | 'sound'
  /** How reference materials are expressed (reference-to-video variants only) */
  referenceShape?: ReferenceShape
  supportsSeed?: boolean
  supportsWatermark?: boolean
  /**
   * Schema-required params with their schema defaults, applied when the caller
   * provided nothing to derive them from (e.g. H3 requires resolution+duration).
   */
  requiredDefaults?: { resolution?: string; duration?: number }
}

// ==================== Curated specs (transcribed from published schemas) ====================

const H3_DURATIONS = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]
const KLING_O3_DURATIONS = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]
const SEEDANCE_MINI_DURATIONS = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]
const SEEDANCE_MINI_RESOLUTIONS = ['480p', '720p', '720p-SR', '1080p-SR', '1440p-SR']
const SEEDANCE_MINI_RATIOS = ['16:9', '4:3', '1:1', '3:4', '9:16', '21:9', 'adaptive']

export const ATLAS_VIDEO_PARAM_SPECS: Record<string, AtlasVideoParamSpec> = {
  // --- MiniMax H3 (Hailuo 3.0): native stereo audio, no audio toggle ---
  'minimax/h3/text-to-video': {
    durationEnum: H3_DURATIONS,
    resolutionEnum: ['768P', '2K'],
    ratioKey: 'ratio',
    ratioEnum: ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16'],
    requiredDefaults: { resolution: '2K', duration: 8 },
  },
  'minimax/h3/image-to-video': {
    firstFrameKey: 'image',
    lastFrameKey: 'end_image',
    durationEnum: H3_DURATIONS,
    resolutionEnum: ['768P', '2K'],
    ratioKey: 'ratio',
    ratioEnum: ['adaptive'],
    requiredDefaults: { resolution: '2K', duration: 8 },
  },
  'minimax/h3/reference-to-video': {
    referenceShape: 'refers',
    durationEnum: H3_DURATIONS,
    resolutionEnum: ['768P', '2K'],
    ratioKey: 'ratio',
    ratioEnum: ['adaptive', '21:9', '16:9', '4:3', '1:1', '3:4', '9:16'],
    requiredDefaults: { resolution: '2K', duration: 8 },
  },
  // --- MiniMax Hailuo 2.3 (no audio params, no resolution/ratio params) ---
  'minimax/hailuo-2.3/t2v-standard': { durationEnum: [6, 10] },
  'minimax/hailuo-2.3/i2v-standard': { firstFrameKey: 'image', durationEnum: [6, 10] },
  'minimax/hailuo-2.3/i2v-pro': { firstFrameKey: 'image', noDuration: true },
  // --- Kling Video O3 Std (sound boolean, i2v has no aspect_ratio) ---
  'kwaivgi/kling-video-o3-std/text-to-video': {
    durationEnum: KLING_O3_DURATIONS,
    ratioKey: 'aspect_ratio',
    ratioEnum: ['16:9', '9:16', '1:1'],
    audioKey: 'sound',
  },
  'kwaivgi/kling-video-o3-std/image-to-video': {
    firstFrameKey: 'image',
    lastFrameKey: 'end_image',
    durationEnum: KLING_O3_DURATIONS,
    audioKey: 'sound',
  },
  'kwaivgi/kling-video-o3-std/reference-to-video': {
    referenceShape: 'images-plus-video',
    durationEnum: KLING_O3_DURATIONS,
    ratioKey: 'aspect_ratio',
    ratioEnum: ['16:9', '9:16', '1:1'],
    audioKey: 'sound',
  },
  // --- Google Veo 3.1 ---
  'google/veo3.1/text-to-video': {
    durationEnum: [4, 6, 8],
    resolutionEnum: ['720p', '1080p', '4k'],
    ratioKey: 'aspect_ratio',
    ratioEnum: ['16:9', '9:16'],
    audioKey: 'generate_audio',
    supportsSeed: true,
  },
  'google/veo3.1/image-to-video': {
    firstFrameKey: 'image',
    lastFrameKey: 'last_image',
    durationEnum: [4, 6, 8],
    resolutionEnum: ['720p', '1080p', '4k'],
    ratioKey: 'aspect_ratio',
    ratioEnum: ['16:9', '9:16'],
    audioKey: 'generate_audio',
    supportsSeed: true,
  },
  // --- Alibaba Wan 2.7 (free-form integer duration; audio param is a voice URL, not a toggle) ---
  'alibaba/wan-2.7/text-to-video': {
    resolutionEnum: ['720P', '1080P', '1080P-SR', '1440P-SR'],
    ratioKey: 'ratio',
    ratioEnum: ['16:9', '9:16', '1:1', '4:3', '3:4'],
    supportsSeed: true,
  },
  'alibaba/wan-2.7/image-to-video': {
    firstFrameKey: 'image',
    lastFrameKey: 'last_image',
    resolutionEnum: ['720P', '1080P'],
    supportsSeed: true,
  },
  'alibaba/wan-2.7/reference-to-video': {
    referenceShape: 'images-videos',
    resolutionEnum: ['720P', '1080P'],
    ratioKey: 'ratio',
    ratioEnum: ['16:9', '9:16', '1:1', '4:3', '3:4'],
    supportsSeed: true,
  },
  // --- ByteDance Seedance 2.0 Mini (Seedance protocol but resolution enum has no plain "1080p") ---
  'bytedance/seedance-2.0-mini/text-to-video': {
    durationEnum: SEEDANCE_MINI_DURATIONS,
    resolutionEnum: SEEDANCE_MINI_RESOLUTIONS,
    ratioKey: 'ratio',
    ratioEnum: SEEDANCE_MINI_RATIOS,
    audioKey: 'generate_audio',
    supportsSeed: true,
    supportsWatermark: true,
  },
  'bytedance/seedance-2.0-mini/image-to-video': {
    firstFrameKey: 'image',
    lastFrameKey: 'last_image',
    durationEnum: SEEDANCE_MINI_DURATIONS,
    resolutionEnum: SEEDANCE_MINI_RESOLUTIONS,
    ratioKey: 'ratio',
    ratioEnum: SEEDANCE_MINI_RATIOS,
    audioKey: 'generate_audio',
    supportsSeed: true,
    supportsWatermark: true,
  },
  'bytedance/seedance-2.0-mini/reference-to-video': {
    referenceShape: 'paired-arrays',
    durationEnum: SEEDANCE_MINI_DURATIONS,
    resolutionEnum: SEEDANCE_MINI_RESOLUTIONS,
    ratioKey: 'ratio',
    ratioEnum: SEEDANCE_MINI_RATIOS,
    audioKey: 'generate_audio',
    supportsSeed: true,
    supportsWatermark: true,
  },
}

/** Curated spec lookup by exact model ID */
export function getVideoParamSpec(modelId: string): AtlasVideoParamSpec | undefined {
  return ATLAS_VIDEO_PARAM_SPECS[modelId]
}

// ==================== Value pickers ====================

/** Nearest allowed duration; ties break toward the shorter (cheaper/faster) option */
export function pickEnumDuration(allowed: number[], want: number): number | undefined {
  const candidates = allowed.filter((v) => Number.isFinite(v) && v > 0)
  if (candidates.length === 0) return undefined
  let best = candidates[0]
  for (const c of candidates) {
    const d = Math.abs(c - want)
    const bd = Math.abs(best - want)
    if (d < bd || (d === bd && c < best)) best = c
  }
  return best
}

/**
 * Parse a resolution tier string into a comparable pixel-height class.
 * Handles "480p" / "768P" / "1080p-SR" (leading digits) and "2K" / "4k" shorthands.
 */
function parseResTier(value: string): number | undefined {
  const lower = value.toLowerCase()
  if (lower === '2k') return 1440
  if (lower === '4k') return 2160
  if (lower === '1k') return 1080
  const m = lower.match(/^(\d+)\s*p/)
  return m ? Number(m[1]) : undefined
}

/**
 * Pick the smallest tier that still covers the requested short side (quality-first
 * ceiling; equal-cost per-request pricing means never silently downgrading).
 * Plain tiers win over suffixed variants of the same class (720p over 720p-SR).
 */
export function pickResolution(allowed: string[], width: number, height: number): string | undefined {
  const minSide = Math.min(width, height)
  const parsed = allowed
    .map((v) => ({ v, tier: parseResTier(v) }))
    .filter((e): e is { v: string; tier: number } => e.tier !== undefined)
    .sort((a, b) => a.tier - b.tier || a.v.length - b.v.length)
  if (parsed.length === 0) return undefined
  const covering = parsed.find((e) => e.tier >= minSide)
  return (covering ?? parsed[parsed.length - 1]).v
}

/**
 * Pick the allowed aspect value nearest to width/height. Numeric "a:b" entries are
 * preferred over "adaptive" when dimensions are known (deterministic output framing);
 * an enum that only offers "adaptive" returns it as-is.
 */
export function pickRatio(allowed: string[], width: number, height: number): string | undefined {
  if (allowed.length === 0) return undefined
  const target = width / height
  let best: string | undefined
  let bestDiff = Infinity
  for (const value of allowed) {
    const m = value.match(/^(\d+):(\d+)$/)
    if (!m) continue
    const diff = Math.abs(Number(m[1]) / Number(m[2]) - target)
    if (diff < bestDiff) {
      bestDiff = diff
      best = value
    }
  }
  return best ?? (allowed.includes('adaptive') ? 'adaptive' : allowed[0])
}

// ==================== Body builder ====================

/**
 * Build the /model/generateVideo request body for a model with a known param spec.
 * Only fields the model's schema actually declares are emitted, so vendors with
 * strict input validation never see foreign params (the pre-billing failure mode
 * of issue #18, now avoided for video too).
 */
export function buildAtlasVideoBody(
  modelId: string,
  spec: AtlasVideoParamSpec,
  options: VideoOptions,
  prompt: string
): Record<string, unknown> {
  const body: Record<string, unknown> = { model: modelId, prompt }
  const { width, height, duration } = options

  if (options.mode === 'video-to-video' && spec.referenceShape) {
    const images = options.referenceImageUrls ?? []
    const videos = options.referenceVideoUrls ?? []
    switch (spec.referenceShape) {
      case 'refers':
        // H3 takes one mixed array; keep videos first so ordinal prompt references
        // ("视频1 … 图1…") keep pointing at the reference clip before product photos
        body.refers = [...videos, ...images]
        break
      case 'paired-arrays':
        if (images.length) body.reference_images = images
        if (videos.length) body.reference_videos = videos
        break
      case 'images-plus-video':
        if (images.length) body.images = images
        if (videos.length) body.video = videos[0]
        break
      case 'images-videos':
        if (images.length) body.images = images
        if (videos.length) body.videos = videos
        break
    }
  } else {
    if (spec.firstFrameKey && options.firstFrameUrl) body[spec.firstFrameKey] = options.firstFrameUrl
    if (spec.lastFrameKey && options.lastFrameUrl) body[spec.lastFrameKey] = options.lastFrameUrl
  }

  if (!spec.noDuration) {
    if (duration) {
      body.duration = spec.durationEnum
        ? pickEnumDuration(spec.durationEnum, duration)
        : Math.round(duration)
    } else if (spec.requiredDefaults?.duration !== undefined) {
      body.duration = spec.requiredDefaults.duration
    }
  }

  if (spec.resolutionEnum) {
    const resolution =
      width && height ? pickResolution(spec.resolutionEnum, width, height) : undefined
    const fallback = spec.requiredDefaults?.resolution
    if (resolution) body.resolution = resolution
    else if (fallback) body.resolution = fallback
  }

  if (spec.ratioKey && spec.ratioEnum?.length) {
    const ratio = width && height ? pickRatio(spec.ratioEnum, width, height) : undefined
    if (ratio) body[spec.ratioKey] = ratio
  }

  if (spec.audioKey) body[spec.audioKey] = options.audioEnabled ?? false
  if (spec.supportsSeed && options.seed !== undefined) body.seed = options.seed
  if (spec.supportsWatermark) body.watermark = false

  return { ...body, ...options.extra }
}

// ==================== Runtime spec derivation (dynamic discovery) ====================

interface OpenApiProperty {
  type?: string
  enum?: unknown[]
  default?: unknown
}

interface OpenApiInput {
  properties?: Record<string, OpenApiProperty>
  required?: string[]
}

/**
 * Derive a param spec from a model's published input schema
 * (components.schemas.Input of static.atlascloud.ai/model/schema/<id>.json).
 * Returns undefined when the JSON doesn't look like an input schema, in which
 * case the caller falls back to the legacy request body.
 */
export function specFromOpenApiInput(input: unknown): AtlasVideoParamSpec | undefined {
  const schema = input as OpenApiInput | undefined
  const props = schema?.properties
  if (!props || typeof props !== 'object') return undefined

  const spec: AtlasVideoParamSpec = {}

  if ('image' in props) spec.firstFrameKey = 'image'
  if ('end_image' in props) spec.lastFrameKey = 'end_image'
  else if ('last_image' in props) spec.lastFrameKey = 'last_image'

  const durationProp = props.duration
  if (!durationProp) {
    spec.noDuration = true
  } else if (Array.isArray(durationProp.enum)) {
    const values = durationProp.enum.filter((v): v is number => typeof v === 'number' && v > 0)
    if (values.length) spec.durationEnum = values
  }

  const resolutionEnum = props.resolution?.enum
  if (Array.isArray(resolutionEnum)) {
    spec.resolutionEnum = resolutionEnum.filter((v): v is string => typeof v === 'string')
  }

  const ratioKey = 'ratio' in props ? 'ratio' : 'aspect_ratio' in props ? 'aspect_ratio' : undefined
  if (ratioKey) {
    const ratioEnum = props[ratioKey]?.enum
    if (Array.isArray(ratioEnum)) {
      spec.ratioKey = ratioKey
      spec.ratioEnum = ratioEnum.filter((v): v is string => typeof v === 'string')
    }
  }

  if (props.generate_audio?.type === 'boolean') spec.audioKey = 'generate_audio'
  else if (props.sound?.type === 'boolean') spec.audioKey = 'sound'

  if ('refers' in props) spec.referenceShape = 'refers'
  else if ('reference_images' in props || 'reference_videos' in props) spec.referenceShape = 'paired-arrays'
  else if ('images' in props && 'videos' in props) spec.referenceShape = 'images-videos'
  else if ('images' in props && 'video' in props) spec.referenceShape = 'images-plus-video'

  if ('seed' in props) spec.supportsSeed = true
  if ('watermark' in props) spec.supportsWatermark = true

  const required = Array.isArray(schema?.required) ? schema.required : []
  const requiredDefaults: AtlasVideoParamSpec['requiredDefaults'] = {}
  if (required.includes('resolution') && typeof props.resolution?.default === 'string') {
    requiredDefaults.resolution = props.resolution.default
  }
  if (required.includes('duration') && typeof durationProp?.default === 'number') {
    requiredDefaults.duration = durationProp.default
  }
  if (requiredDefaults.resolution || requiredDefaults.duration !== undefined) {
    spec.requiredDefaults = requiredDefaults
  }

  return spec
}
