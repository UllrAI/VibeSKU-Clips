/**
 * Prism model catalog and request-parameter mapping.
 *
 * Prism (https://prism.ullrai.com/docs) is the single media gateway this app talks to: one
 * credential pair, one request shape, its own provider fan-out and fallback behind the scenes.
 * What Prism does NOT hide is that each model still accepts a different slice of durations,
 * aspect ratios and resolutions — and it enforces those with a 422 rather than silently
 * clamping. A rejected request after the user already waited is the worst outcome, so every
 * constraint below is snapped client-side before the call.
 *
 * Every value here was read back from the live API (2026-09, staging) by sending deliberately
 * invalid parameters and transcribing the enum Prism named in its own error message. That is
 * the reason for the odd-looking entries: `/api/v1/openapi.json` describes `aspect_ratio` as a
 * seven-value enum for all models, but MiniMax H3 really answers
 * `不支持宽高比 21:9，可选值: ['16:9', '9:16', '1:1']`, and its published `resolution` list of
 * three tiers is really two. Trust this table over the prose in the schema.
 */

import type { GenResolution } from '@/lib/gen-params'
import type { MediaType, Model } from './types'

// ==================== video ====================

/** Aspect ratios Prism accepts, as written in its enums. */
export type PrismRatio = '16:9' | '9:16' | '1:1' | '4:3' | '3:4' | '21:9' | 'adaptive'

/** Resolution tiers Prism accepts for video. */
export type PrismResolution = '480p' | '720p' | '1080p'

export interface PrismVideoModel {
  id: string
  name: string
  /** Discrete durations in seconds; a request is snapped to the nearest entry. */
  durations: number[]
  ratios: PrismRatio[]
  resolutions: PrismResolution[]
  /**
   * Produces its own audio track and offers no way to turn it off. Prism 422s on
   * `generate_audio: false` for these, so the field is never sent.
   */
  nativeAudio: boolean
  /** Accepts `generate_audio` (Seedance) or `audio` (Wan) as an on/off toggle. */
  audioToggle?: 'generate_audio' | 'audio'
  /**
   * How a still image is attached.
   * - `frames`: dedicated `first_frame_url` / `last_frame_url` fields.
   * - `first-frame`: `reference_url` is used as a strict first frame (Wan).
   */
  imageInput: 'frames' | 'first-frame'
  /**
   * The frame fields only work as a pair. H3 answers
   * `首尾帧工作流必须同时提供 first_frame_url 和 last_frame_url` to a lone first frame, so a
   * single image has to travel as a reference instead. Seedance accepts a first frame alone.
   */
  requiresFramePair?: true
  /** Supports `last_frame_url` for keyframe chaining. */
  lastFrame: boolean
  /** Max entries for `reference_images`; 0 = the model takes none. */
  maxReferenceImages: number
  /** Max entries for `reference_videos` (video editing / extension); 0 = unsupported. */
  maxReferenceVideos: number
  /** Max entries for `reference_audios`; 0 = unsupported. */
  maxReferenceAudios: number
  /** Prism forwards `negative_prompt` to the model instead of rejecting it. */
  negativePrompt: boolean
  /** Lowest accepted seed; H3 rejects 0 and wants the field omitted for "random". */
  minSeed: number
  /** Short line shown in the model picker. */
  note: string
}

const SEEDANCE_RATIOS: PrismRatio[] = ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9', 'adaptive']
const WAN_RATIOS: PrismRatio[] = ['16:9', '9:16', '1:1', '4:3', '3:4']
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i)

/**
 * The default video model. H3 renders speech, ambience and motion in one pass, which is what
 * lets a shot survive on its own without a separately dubbed track laid over it.
 */
export const DEFAULT_VIDEO_MODEL = 'minimax-h3'

export const PRISM_VIDEO_MODELS: PrismVideoModel[] = [
  {
    id: 'minimax-h3',
    name: 'MiniMax H3',
    durations: range(1, 15),
    ratios: ['16:9', '9:16', '1:1'],
    resolutions: ['480p', '720p'],
    nativeAudio: true,
    imageInput: 'frames',
    requiresFramePair: true,
    lastFrame: true,
    maxReferenceImages: 9,
    maxReferenceVideos: 0,
    maxReferenceAudios: 3,
    negativePrompt: true,
    minSeed: 1,
    note: '音画同出，口播与环境声一次生成',
  },
  {
    id: 'minimax-h3-max',
    name: 'MiniMax H3 Max',
    durations: range(5, 15),
    // The upstream endpoint has no aspect_ratio at all: output follows the first frame, or
    // defaults to 16:9 for text-to-video. Prism 422s anything else, so only 16:9 is listed.
    ratios: ['16:9'],
    resolutions: ['480p', '720p'],
    nativeAudio: true,
    imageInput: 'frames',
    requiresFramePair: true,
    lastFrame: true,
    maxReferenceImages: 9,
    maxReferenceVideos: 0,
    maxReferenceAudios: 3,
    negativePrompt: true,
    minSeed: 1,
    note: 'H3 高配档，画面更稳，仅 16:9',
  },
  {
    id: 'seedance2.0',
    name: 'Seedance 2.0',
    durations: range(4, 15),
    ratios: SEEDANCE_RATIOS,
    resolutions: ['480p', '720p', '1080p'],
    nativeAudio: false,
    audioToggle: 'generate_audio',
    imageInput: 'frames',
    lastFrame: true,
    maxReferenceImages: 9,
    maxReferenceVideos: 3,
    maxReferenceAudios: 3,
    negativePrompt: false,
    minSeed: -1,
    note: '多模态参考最强，支持参考视频与视频续写',
  },
  {
    id: 'seedance2.0-fast',
    name: 'Seedance 2.0 Fast',
    durations: range(4, 15),
    ratios: SEEDANCE_RATIOS,
    resolutions: ['480p', '720p'],
    nativeAudio: false,
    audioToggle: 'generate_audio',
    imageInput: 'frames',
    lastFrame: true,
    maxReferenceImages: 9,
    maxReferenceVideos: 3,
    maxReferenceAudios: 3,
    negativePrompt: false,
    minSeed: -1,
    note: '出片更快，最高 720p',
  },
  {
    id: 'seedance2.0-mini',
    name: 'Seedance 2.0 Mini',
    durations: range(4, 15),
    ratios: SEEDANCE_RATIOS,
    resolutions: ['480p', '720p'],
    nativeAudio: false,
    audioToggle: 'generate_audio',
    imageInput: 'frames',
    lastFrame: true,
    maxReferenceImages: 9,
    maxReferenceVideos: 3,
    maxReferenceAudios: 3,
    negativePrompt: false,
    minSeed: -1,
    note: '成本最低的 Seedance 档位',
  },
  {
    id: 'seedance2.5',
    name: 'Seedance 2.5',
    durations: range(4, 30),
    ratios: SEEDANCE_RATIOS,
    resolutions: ['480p', '720p', '1080p'],
    nativeAudio: false,
    audioToggle: 'generate_audio',
    imageInput: 'frames',
    lastFrame: true,
    maxReferenceImages: 30,
    maxReferenceVideos: 10,
    maxReferenceAudios: 10,
    negativePrompt: false,
    minSeed: -1,
    note: '单镜可到 30 秒，参考素材上限最高',
  },
  {
    id: 'wan2.6',
    name: 'Wan 2.6',
    durations: [5, 10, 15],
    ratios: WAN_RATIOS,
    resolutions: ['480p', '720p', '1080p'],
    nativeAudio: false,
    audioToggle: 'audio',
    imageInput: 'first-frame',
    lastFrame: false,
    maxReferenceImages: 0,
    maxReferenceVideos: 0,
    maxReferenceAudios: 0,
    negativePrompt: true,
    minSeed: 0,
    note: '参考图即严格首帧，支持负向提示词',
  },
  {
    id: 'wan2.6-flash',
    name: 'Wan 2.6 Flash',
    durations: [5, 10, 15],
    ratios: WAN_RATIOS,
    resolutions: ['480p', '720p', '1080p'],
    nativeAudio: false,
    audioToggle: 'audio',
    imageInput: 'first-frame',
    lastFrame: false,
    maxReferenceImages: 0,
    maxReferenceVideos: 0,
    maxReferenceAudios: 0,
    negativePrompt: true,
    minSeed: 0,
    note: 'Wan 的快速档位',
  },
]

// ==================== image ====================

/** Aspect ratios the image endpoint accepts. `auto` lets the model decide. */
export type PrismImageRatio =
  | 'auto' | '1:1' | '16:9' | '9:16' | '4:3' | '3:4' | '3:2' | '2:3' | '5:4' | '4:5' | '21:9'

/** Pixel budget tier. Only `1K` is valid for nano-banana-2-lite. */
export type PrismImageSize = '1K' | '2K' | '4K'

/** `quality` is read by the gpt-image-* family only; other models ignore it. */
export type PrismImageQuality = 'auto' | 'low' | 'medium' | 'high'

export interface PrismImageModel {
  id: string
  name: string
  /** Honours `quality`. */
  quality: boolean
  /** Tiers this model can output; lite is locked to 1K and 422s on anything larger. */
  sizes: PrismImageSize[]
  note: string
}

/**
 * The default image model, at `low` quality. Storyboard frames are drafts: they exist to be
 * judged, regenerated and only then promoted into a video, so the cheap tier is the honest
 * default. Quality is a one-field change in Settings when a frame is going to ship as a cover.
 */
export const DEFAULT_IMAGE_MODEL = 'gpt-image-2'
export const DEFAULT_IMAGE_QUALITY: PrismImageQuality = 'low'

const ALL_SIZES: PrismImageSize[] = ['1K', '2K', '4K']

export const PRISM_IMAGE_MODELS: PrismImageModel[] = [
  { id: 'gpt-image-2', name: 'GPT Image 2', quality: true, sizes: ALL_SIZES, note: '商品还原准，质量档位可调' },
  { id: 'gpt-image-2-vip', name: 'GPT Image 2 VIP', quality: true, sizes: ALL_SIZES, note: '同 GPT Image 2，走高优先级通道' },
  { id: 'gpt-image-1.5', name: 'GPT Image 1.5', quality: true, sizes: ALL_SIZES, note: '上一代，成本更低' },
  { id: 'gpt-image-1', name: 'GPT Image 1', quality: true, sizes: ALL_SIZES, note: '最早一代，兜底可用' },
  { id: 'nano-banana', name: 'Nano Banana', quality: false, sizes: ALL_SIZES, note: '出图快，适合大批量草稿' },
  { id: 'nano-banana-pro', name: 'Nano Banana Pro', quality: false, sizes: ALL_SIZES, note: '细节更好，支持 4K' },
  { id: 'nano-banana-2', name: 'Nano Banana 2', quality: false, sizes: ALL_SIZES, note: '新一代 Nano Banana' },
  { id: 'nano-banana-2-lite', name: 'Nano Banana 2 Lite', quality: false, sizes: ['1K'], note: '仅 1K，最省' },
]

/** Prism caps `reference_urls` at 14 images per request. */
export const MAX_IMAGE_REFERENCES = 14

// ==================== lookups ====================

export function findVideoModel(modelId: string): PrismVideoModel | undefined {
  return PRISM_VIDEO_MODELS.find((m) => m.id === modelId)
}

export function findImageModel(modelId: string): PrismImageModel | undefined {
  return PRISM_IMAGE_MODELS.find((m) => m.id === modelId)
}

/** The catalog in the shape the model pickers consume. */
export function prismModels(mediaType?: MediaType): Model[] {
  const images: Model[] = PRISM_IMAGE_MODELS.map((m) => ({
    id: m.id,
    name: m.name,
    description: m.note,
    modes: ['text-to-image', 'image-to-image'],
    mediaType: 'image',
    provider: 'prism',
  }))
  const videos: Model[] = PRISM_VIDEO_MODELS.map((m) => ({
    id: m.id,
    name: m.name,
    description: m.note,
    modes: m.maxReferenceVideos > 0
      ? ['text-to-video', 'image-to-video', 'video-to-video']
      : ['text-to-video', 'image-to-video'],
    mediaType: 'video',
    provider: 'prism',
    supportsAudio: m.nativeAudio || Boolean(m.audioToggle),
  }))
  if (mediaType === 'image') return images
  if (mediaType === 'video') return videos
  return [...images, ...videos]
}

// ==================== parameter snapping ====================

/** Nearest allowed duration; ties go to the longer clip so a shot is never cut short. */
export function snapDuration(allowed: number[], want: number | undefined, fallback: number): number {
  const target = want ?? fallback
  return allowed.reduce((best, current) =>
    Math.abs(current - target) < Math.abs(best - target) ||
    (Math.abs(current - target) === Math.abs(best - target) && current > best)
      ? current
      : best
  )
}

/** Proportion of a `w:h` label, e.g. `16:9` → 1.78. */
function ratioValue(label: string): number {
  const [w, h] = label.split(':').map(Number)
  return w / h
}

/**
 * Nearest allowed aspect ratio for a pixel size. `adaptive` is never auto-selected — it means
 * "follow the input", which silently discards the framing the project asked for.
 *
 * Callers hand over pixels rather than a `GenAspectRatio` because that is what VideoOptions
 * actually carries: gen-params maps the user's ratio + resolution into width/height long before
 * a provider sees it, and re-deriving the label here keeps one source of truth.
 */
export function snapRatio(allowed: PrismRatio[], width?: number, height?: number): PrismRatio {
  const candidates = allowed.filter((r) => r !== 'adaptive')
  const pool = candidates.length > 0 ? candidates : allowed
  if (!width || !height) return pool[0]
  const target = width / height
  return pool.reduce((best, current) =>
    Math.abs(ratioValue(current) - target) < Math.abs(ratioValue(best) - target) ? current : best
  )
}

const RESOLUTION_ORDER: PrismResolution[] = ['480p', '720p', '1080p']

/** Short edge in pixels → the tier the user effectively asked for. */
export function resolutionTier(width?: number, height?: number): PrismResolution {
  const shortEdge = Math.min(width || 0, height || 0)
  if (shortEdge >= 1080) return '1080p'
  if (shortEdge >= 720) return '720p'
  return shortEdge > 0 ? '480p' : '720p'
}

/** Highest allowed tier that does not exceed the requested one, else the lowest on offer. */
export function snapResolution(allowed: PrismResolution[], want: PrismResolution | GenResolution): PrismResolution {
  const wantIndex = RESOLUTION_ORDER.indexOf(want as PrismResolution)
  const affordable = allowed.filter((r) => RESOLUTION_ORDER.indexOf(r) <= wantIndex)
  const pool = affordable.length > 0 ? affordable : allowed
  return pool.reduce((best, current) =>
    RESOLUTION_ORDER.indexOf(current) > RESOLUTION_ORDER.indexOf(best) ? current : best
  )
}

/** Pixel dimensions → the tier whose long edge is closest without rounding a 4K ask down to 1K. */
export function sizeTier(allowed: PrismImageSize[], width?: number, height?: number): PrismImageSize {
  const longEdge = Math.max(width ?? 0, height ?? 0)
  const tier: PrismImageSize = longEdge >= 3000 ? '4K' : longEdge >= 1600 ? '2K' : '1K'
  if (allowed.includes(tier)) return tier
  const order: PrismImageSize[] = ['1K', '2K', '4K']
  const affordable = allowed.filter((s) => order.indexOf(s) <= order.indexOf(tier))
  const pool = affordable.length > 0 ? affordable : allowed
  return pool.reduce((best, current) => (order.indexOf(current) > order.indexOf(best) ? current : best))
}

/** Pixel dimensions → the closest image aspect ratio Prism accepts; `auto` when unspecified. */
export function imageRatio(width?: number, height?: number): PrismImageRatio {
  if (!width || !height) return 'auto'
  const ratios: PrismImageRatio[] = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '5:4', '4:5', '21:9']
  const target = width / height
  return ratios.reduce((best, current) =>
    Math.abs(ratioValue(current) - target) < Math.abs(ratioValue(best) - target) ? current : best
  )
}
