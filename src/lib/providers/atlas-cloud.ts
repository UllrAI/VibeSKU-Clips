/**
 * Atlas Cloud Provider implementation
 * Built on the Atlas Cloud REST API, supports image and video generation
 * Docs: https://www.atlascloud.ai/docs
 *
 * API protocol (confirmed via official MCP / docs, 2026-06):
 * - Submit image:   POST /model/generateImage  -> { code, data: { id } }
 * - Submit video:   POST /model/generateVideo  -> { code, data: { id } }
 * - Query result:   GET  /model/prediction/{id} -> { id, status, outputs: string[] }
 *   Status values: created | processing | completed | succeeded | failed | timeout
 */

import { BaseProvider, ProviderError } from './base'
import type {
  ProviderConfig,
  ImageOptions,
  ImageResult,
  VideoOptions,
  VideoResult,
  TaskStatus,
  TaskStatusEnum,
  Model,
  MediaType,
} from './types'
import {
  getVideoParamSpec,
  buildAtlasVideoBody,
  specFromOpenApiInput,
  type AtlasVideoParamSpec,
} from './atlas-video-params'
import {
  fetchAtlasCatalog,
  fetchAtlasInputSchema,
  getCachedAtlasEntry,
  modesFromCatalogEntry,
  dynamicVideoModels,
} from './atlas-catalog'

// ==================== Atlas Cloud API response types ====================

/** Create-task response (outer code/data wrapper) */
interface AtlasCreateResponse {
  code?: number
  message?: string
  data?: {
    id: string
    [key: string]: unknown
  }
  // some endpoints (enable_sync_mode) return the prediction object directly
  id?: string
  [key: string]: unknown
}

/** Task query response */
interface AtlasPredictionResponse {
  code?: number
  message?: string
  data?: AtlasPrediction
  // also compatible with a response that returns the prediction object directly
  id?: string
  status?: string
  outputs?: string[]
  [key: string]: unknown
}

/** Prediction task object */
interface AtlasPrediction {
  id: string
  model?: string
  status: string
  /** List of generated output URLs (images / videos) */
  outputs?: string[]
  error?: string | { message?: string; code?: string }
  created_at?: string
  has_nsfw_contents?: boolean[]
  [key: string]: unknown
}

// ==================== Model catalog ====================

/**
 * Static model catalog, confirmed from the Atlas Cloud official model list
 * (2026-06, verified via official MCP). Module-level so both listModels()
 * and the mode-capability guard share one source of truth.
 */
const ATLAS_MODELS: Array<Omit<Model, 'provider'>> = [
  // ==================== Video generation ====================
  // --- Doubao Seedance 2.5 (flagship: 4-30s, native speech; billed per second on top of base) ---
  { id: 'bytedance/seedance-2.5/text-to-video', name: 'Seedance 2.5 (文生视频)', description: '字节旗舰视频模型，原生音频/人声，4-30秒', modes: ['text-to-video'], mediaType: 'video', supportsAudio: true },
  { id: 'bytedance/seedance-2.5/image-to-video', name: 'Seedance 2.5 (图生视频)', description: '首帧/尾帧图生视频，原生音频/人声，4-30秒', modes: ['image-to-video'], mediaType: 'video', supportsAudio: true },
  { id: 'bytedance/seedance-2.5/reference-to-video', name: 'Seedance 2.5 (参考生视频)', description: '多模态参考生成（图≤30/视频/音频），4-30秒，多镜整片首选', modes: ['image-to-video', 'video-to-video'], mediaType: 'video', supportsAudio: true },
  // --- Doubao Seedance 2.0 (native audio) ---
  { id: 'bytedance/seedance-2.0/text-to-video', name: 'Seedance 2.0 (文生视频)', description: '字节最新视频模型，原生音频，4-15秒，最高1440p', modes: ['text-to-video'], mediaType: 'video', supportsAudio: true },
  { id: 'bytedance/seedance-2.0/image-to-video', name: 'Seedance 2.0 (图生视频)', description: '首帧/尾帧图生视频，原生音频', modes: ['image-to-video'], mediaType: 'video', supportsAudio: true },
  { id: 'bytedance/seedance-2.0/reference-to-video', name: 'Seedance 2.0 (参考生视频)', description: '多模态参考图/视频/音频生成，支持视频编辑', modes: ['image-to-video', 'video-to-video'], mediaType: 'video', supportsAudio: true },
  { id: 'bytedance/seedance-2.0-fast/text-to-video', name: 'Seedance 2.0 Fast (文生视频)', description: 'Seedance 2.0 快速版，原生音频', modes: ['text-to-video'], mediaType: 'video', supportsAudio: true },
  { id: 'bytedance/seedance-2.0-fast/image-to-video', name: 'Seedance 2.0 Fast (图生视频)', description: 'Seedance 2.0 快速版图生视频', modes: ['image-to-video'], mediaType: 'video', supportsAudio: true },
  // --- Doubao Seedance 1.5 ---
  { id: 'bytedance/seedance-v1.5-pro/text-to-video', name: 'Seedance 1.5 Pro (文生视频)', modes: ['text-to-video'], mediaType: 'video', supportsAudio: true },
  { id: 'bytedance/seedance-v1.5-pro/image-to-video', name: 'Seedance 1.5 Pro (图生视频)', modes: ['image-to-video'], mediaType: 'video', supportsAudio: true },
  // --- Kling 3.0 ---
  { id: 'kwaivgi/kling-v3.0-pro/text-to-video', name: 'Kling 3.0 Pro (文生视频)', modes: ['text-to-video'], mediaType: 'video' },
  { id: 'kwaivgi/kling-v3.0-pro/image-to-video', name: 'Kling 3.0 Pro (图生视频)', modes: ['image-to-video'], mediaType: 'video' },
  { id: 'kwaivgi/kling-v3.0-std/text-to-video', name: 'Kling 3.0 Std (文生视频)', modes: ['text-to-video'], mediaType: 'video' },
  { id: 'kwaivgi/kling-v3.0-std/image-to-video', name: 'Kling 3.0 Std (图生视频)', modes: ['image-to-video'], mediaType: 'video' },
  // --- Vidu Q3 ---
  { id: 'vidu/q3-pro/text-to-video', name: 'Vidu Q3 Pro (文生视频)', modes: ['text-to-video'], mediaType: 'video' },
  { id: 'vidu/q3-pro/image-to-video', name: 'Vidu Q3 Pro (图生视频)', modes: ['image-to-video'], mediaType: 'video' },
  { id: 'vidu/q3-pro/start-end-to-video', name: 'Vidu Q3 Pro (首尾帧过渡)', description: '指定首尾帧生成过渡视频', modes: ['image-to-video'], mediaType: 'video' },
  { id: 'vidu/q3-turbo/image-to-video', name: 'Vidu Q3 Turbo (图生视频)', modes: ['image-to-video'], mediaType: 'video' },
  // --- MiniMax H3 (Hailuo 3.0, launched 2026-07-31: omni-modal, native stereo, up to 2K/15s) ---
  { id: 'minimax/h3/text-to-video', name: 'MiniMax H3 (文生视频)', description: '海螺 3.0 全模态模型，原生立体声，2K，4-15秒', modes: ['text-to-video'], mediaType: 'video', supportsAudio: true },
  { id: 'minimax/h3/image-to-video', name: 'MiniMax H3 (图生视频)', description: '首帧/尾帧图生视频，原生立体声，2K', modes: ['image-to-video'], mediaType: 'video', supportsAudio: true },
  { id: 'minimax/h3/reference-to-video', name: 'MiniMax H3 (参考生视频)', description: '图/视频/音频混合参考，保主体一致，2K', modes: ['image-to-video', 'video-to-video'], mediaType: 'video', supportsAudio: true },
  // --- MiniMax Hailuo 2.3 (no native audio; 6/10s durations) ---
  { id: 'minimax/hailuo-2.3/t2v-standard', name: 'Hailuo 2.3 Std (文生视频)', description: '海螺 2.3，运动物理逼真，6/10秒', modes: ['text-to-video'], mediaType: 'video' },
  { id: 'minimax/hailuo-2.3/i2v-standard', name: 'Hailuo 2.3 Std (图生视频)', modes: ['image-to-video'], mediaType: 'video' },
  { id: 'minimax/hailuo-2.3/i2v-pro', name: 'Hailuo 2.3 Pro (图生视频)', description: '高保真场景演化与角色连续性', modes: ['image-to-video'], mediaType: 'video' },
  // --- Kling Video O3 (Kuaishou omni-modal, MVL) ---
  { id: 'kwaivgi/kling-video-o3-std/text-to-video', name: 'Kling O3 Std (文生视频)', description: '快手全模态视频模型，多镜头叙事，带声音', modes: ['text-to-video'], mediaType: 'video', supportsAudio: true },
  { id: 'kwaivgi/kling-video-o3-std/image-to-video', name: 'Kling O3 Std (图生视频)', description: '首帧/尾帧，带声音', modes: ['image-to-video'], mediaType: 'video', supportsAudio: true },
  { id: 'kwaivgi/kling-video-o3-std/reference-to-video', name: 'Kling O3 Std (参考生视频)', description: '角色/道具/场景参考生成', modes: ['image-to-video', 'video-to-video'], mediaType: 'video', supportsAudio: true },
  // --- Google Veo 3.1 ---
  { id: 'google/veo3.1/text-to-video', name: 'Veo 3.1 (文生视频)', description: 'Google 旗舰视频模型，4/6/8秒，最高 4K', modes: ['text-to-video'], mediaType: 'video', supportsAudio: true },
  { id: 'google/veo3.1/image-to-video', name: 'Veo 3.1 (图生视频)', description: '首帧/尾帧图生视频，可选音频', modes: ['image-to-video'], mediaType: 'video', supportsAudio: true },
  // --- Wan (Wanxiang) ---
  { id: 'alibaba/wan-2.7/text-to-video', name: '万相 2.7 (文生视频)', description: '多镜头叙事 + 音画同步', modes: ['text-to-video'], mediaType: 'video', supportsAudio: true },
  { id: 'alibaba/wan-2.7/image-to-video', name: '万相 2.7 (图生视频)', description: '首帧/尾帧/视频续写', modes: ['image-to-video'], mediaType: 'video', supportsAudio: true },
  { id: 'alibaba/wan-2.7/reference-to-video', name: '万相 2.7 (参考生视频)', description: '多主体参考 + 声音克隆', modes: ['image-to-video', 'video-to-video'], mediaType: 'video', supportsAudio: true },
  { id: 'alibaba/wan-2.6/image-to-video-flash', name: '万相 2.6 Flash (图生视频)', modes: ['image-to-video'], mediaType: 'video' },
  // --- Seedance 2.0 Mini (lightweight/economical, native audio) ---
  { id: 'bytedance/seedance-2.0-mini/text-to-video', name: 'Seedance 2.0 Mini (文生视频)', description: '轻量经济版，原生音频', modes: ['text-to-video'], mediaType: 'video', supportsAudio: true },
  { id: 'bytedance/seedance-2.0-mini/image-to-video', name: 'Seedance 2.0 Mini (图生视频)', modes: ['image-to-video'], mediaType: 'video', supportsAudio: true },
  { id: 'bytedance/seedance-2.0-mini/reference-to-video', name: 'Seedance 2.0 Mini (参考生视频)', modes: ['image-to-video', 'video-to-video'], mediaType: 'video', supportsAudio: true },
  // ==================== Image generation ====================
  // --- OpenAI GPT Image 2 (latest) ---
  { id: 'openai/gpt-image-2/text-to-image', name: 'GPT Image 2 (文生图)', description: 'OpenAI 最新生图模型，支持任意分辨率，商品图质感好', modes: ['text-to-image'], mediaType: 'image' },
  { id: 'openai/gpt-image-2/edit', name: 'GPT Image 2 (图片编辑)', description: '自然语言精准编辑：换背景、调光线、改文字', modes: ['image-to-image'], mediaType: 'image' },
  // --- Other image generation models ---
  { id: 'bytedance/seedream-v5.0-lite', name: 'Seedream 5.0 Lite (文生图)', modes: ['text-to-image'], mediaType: 'image' },
  { id: 'google/nano-banana-2/text-to-image', name: 'Nano Banana 2 (文生图)', modes: ['text-to-image'], mediaType: 'image' },
]

// ==================== Image size mapping (issue #18) ====================

/** Ratio tiers accepted by Atlas video APIs and nano-banana's aspect_ratio field */
const RATIO_TIERS: ReadonlyArray<[string, number]> = [
  ['16:9', 16 / 9],
  ['4:3', 4 / 3],
  ['1:1', 1],
  ['3:4', 3 / 4],
  ['9:16', 9 / 16],
  ['21:9', 21 / 9],
]

/** Pick the ratio-tier name closest to width/height */
function nearestRatio(width: number, height: number): string {
  const target = width / height
  let best = RATIO_TIERS[0]
  for (const c of RATIO_TIERS) {
    if (Math.abs(c[1] - target) < Math.abs(best[1] - target)) best = c
  }
  return best[0]
}

/**
 * Seedream v5 accepts ONLY these preset sizes, written with a `*` separator.
 * Free-form sizes are rejected (total pixels must also stay in [3.68M, 10.4M],
 * which rules out plain 1080x1920). 2K-tier presets are enough for video assets;
 * pricing is per request, so the smaller tier is strictly faster at equal cost.
 */
const SEEDREAM_V5_PRESETS: ReadonlyArray<[number, number]> = [
  [2048, 2048],
  [2304, 1728],
  [1728, 2304],
  [2848, 1600],
  [1600, 2848],
  [2496, 1664],
  [1664, 2496],
  [3136, 1344],
]

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b)
}

/** Documented hard cap for gpt-image-2 dimensions (max supported is 3840x2160) */
const GPT_IMAGE_MAX_SIDE = 3840

/**
 * gpt-image-2 accepts free-form "WxH" but both sides must be divisible by 16.
 * Prefer a size that keeps the requested aspect ratio EXACT while satisfying /16:
 * scale the reduced ratio a:b to the smallest /16-compatible base, then pick the
 * multiple nearest to the request. The common defaults land on OpenAI's own
 * standard sizes (1080x1920 -> 1152x2048, 1920x1080 -> 2048x1152), so composited
 * assets never get ratio distortion. Irrational-ish ratios fall back to plain
 * nearest-multiple-of-16 snapping (arbitrary /16 sizes are documented as valid).
 */
function gptImageSize(width: number, height: number): string {
  const snap16 = (v: number) =>
    Math.min(GPT_IMAGE_MAX_SIDE, Math.max(16, Math.round(v / 16) * 16))

  const g = gcd(width, height)
  const a = width / g
  const b = height / g
  // base = smallest W:H pair with the exact ratio where both sides are /16
  const s = lcm16(a, b)
  const baseW = a * s
  const baseH = b * s
  if (baseW > GPT_IMAGE_MAX_SIDE || baseH > GPT_IMAGE_MAX_SIDE) {
    // ratio terms too large to keep exact — fall back to per-side snapping
    return `${snap16(width)}x${snap16(height)}`
  }
  let k = Math.max(1, Math.round(width / baseW))
  // clamp to the documented maximum resolution
  k = Math.min(k, Math.floor(GPT_IMAGE_MAX_SIDE / Math.max(baseW, baseH)))
  return `${baseW * k}x${baseH * k}`
}

/** Smallest multiplier making both a*s and b*s divisible by 16 */
function lcm16(a: number, b: number): number {
  const sa = 16 / gcd(a, 16)
  const sb = 16 / gcd(b, 16)
  // lcm of the two per-side requirements
  return (sa * sb) / gcd(sa, sb)
}

/**
 * Build the per-model size params for Atlas image generation (issue #18).
 * Image models on Atlas disagree on how output dimensions are expressed:
 * - gpt-image-2 (t2i/edit): free-form "WxH" but both sides MUST be divisible by 16 —
 *   the raw 1080x1920 passthrough was rejected server-side AFTER billing;
 * - seedream v5: fixed preset list with a `*` separator;
 * - nano-banana: no size field at all, expects aspect_ratio + resolution;
 * - unknown/custom models: keep the legacy "WxH" passthrough unchanged.
 */
export function buildImageSizeParams(
  modelId: string,
  width?: number,
  height?: number
): Record<string, string> {
  if (!width || !height) return {}

  if (/gpt-image/i.test(modelId)) {
    return { size: gptImageSize(width, height) }
  }

  if (/seedream/i.test(modelId)) {
    const target = width / height
    let best = SEEDREAM_V5_PRESETS[0]
    for (const p of SEEDREAM_V5_PRESETS) {
      if (Math.abs(p[0] / p[1] - target) < Math.abs(best[0] / best[1] - target)) best = p
    }
    return { size: `${best[0]}*${best[1]}` }
  }

  if (/nano-banana/i.test(modelId)) {
    const minSide = Math.min(width, height)
    const resolution = minSide > 2048 ? '4k' : minSide > 1024 ? '2k' : '1k'
    return { aspect_ratio: nearestRatio(width, height), resolution }
  }

  return { size: `${width}x${height}` }
}

// ==================== Provider implementation ====================

export class AtlasCloudProvider extends BaseProvider {
  readonly name = 'atlas-cloud'
  readonly displayName = 'Atlas Cloud'

  constructor(config: ProviderConfig) {
    super({
      ...config,
      baseUrl: config.baseUrl || 'https://api.atlascloud.ai/api/v1',
    })
  }

  /**
   * Generate an image
   */
  async generateImage(options: ImageOptions): Promise<ImageResult> {
    const body = {
      model: options.modelId,
      prompt: options.prompt,
      // per-model size contract: gpt-image-2 needs /16 sizes, seedream needs `*` presets,
      // nano-banana needs aspect_ratio + resolution (issue #18)
      ...buildImageSizeParams(options.modelId, options.width, options.height),
      ...(options.negativePrompt && { negative_prompt: options.negativePrompt }),
      ...(options.seed !== undefined && { seed: options.seed }),
      // image-to-image / edit mode (e.g. openai/gpt-image-2/edit) passes the reference image as an images array
      ...(options.referenceImageUrl && {
        images: [options.referenceImageUrl],
      }),
      ...options.extra,
    }

    const startTime = Date.now()
    const response = await this.request<AtlasCreateResponse>('/model/generateImage', {
      method: 'POST',
      body,
    })

    const taskId = this.extractTaskId(response)

    // async task mode: poll until result is ready
    const finalStatus = await this.pollTaskStatus(taskId, { interval: 2000 })

    const outputs = this.extractOutputs(finalStatus)

    return {
      taskId,
      imageUrls: outputs,
      modelId: options.modelId,
      duration: Date.now() - startTime,
    }
  }

  /**
   * Upload a local media file to Atlas temporary hosting (multipart /model/uploadMedia)
   * and return its public download URL. Required for reference VIDEOS: the video APIs
   * take URLs/asset refs only (images may be Base64, videos may not).
   */
  async uploadLocalMedia(filePath: string): Promise<string> {
    const { readFile } = await import('fs/promises')
    const { basename } = await import('path')
    const buf = await readFile(filePath)
    const form = new FormData()
    form.append('file', new Blob([new Uint8Array(buf)]), basename(filePath))
    const res = await fetch(`${this.config.baseUrl}/model/uploadMedia`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.config.apiKey}` },
      body: form,
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new ProviderError(`参考素材上传失败: ${res.status} ${text.slice(0, 200)}`, 'UPLOAD_FAILED', this.name, res.status)
    }
    const data = (await res.json()) as { data?: { download_url?: string } }
    const url = data.data?.download_url
    if (!url) throw new ProviderError('参考素材上传成功但未返回地址', 'UPLOAD_FAILED', this.name)
    return url
  }

  /**
   * Submit a video generation task without waiting for the result (two-phase mode).
   * Validates/remaps the model against the requested mode BEFORE any billable call,
   * and returns the provider task ID as soon as Atlas acknowledges the task so the
   * caller can persist it before polling (issue #16).
   */
  async submitVideoTask(options: VideoOptions): Promise<{ taskId: string; modelId: string }> {
    // mode-capability guard: never bill a text-to-video model for an image-to-video request
    const modelId = this.resolveVideoModel(options)

    // models that support audio (e.g. Seedance 2.0) embed the voiceover copy into the prompt
    let prompt = options.prompt
    if (options.audioEnabled && options.voiceover) {
      prompt = `${options.prompt}. 旁白: "${options.voiceover}"`
    }

    const isReference = options.mode === 'video-to-video'
    // Param-spec path: curated new families (MiniMax H3 / Hailuo 2.3 / Kling O3 /
    // Veo 3.1 / Wan 2.7 / Seedance Mini) and dynamically discovered models get a body
    // built strictly from their published input schema — vendors disagree on field
    // names and enums, and foreign params risk post-billing rejections (issue #18).
    // Legacy families (no spec) keep the original hardcoded body byte-for-byte.
    const spec = await this.resolveParamSpec(modelId)
    const body = spec
      ? buildAtlasVideoBody(modelId, spec, options, prompt)
      : isReference
      ? {
          // multimodal reference generation (Seedance 2.0 reference-to-video):
          // reference_videos/reference_images arrays with ordinal prompt references
          model: modelId,
          prompt,
          ...(options.referenceVideoUrls?.length && { reference_videos: options.referenceVideoUrls }),
          ...(options.referenceImageUrls?.length && { reference_images: options.referenceImageUrls }),
          ...(options.duration && { duration: options.duration }),
          ...(options.width && options.height && {
            resolution: this.mapResolution(options.width, options.height),
            ratio: this.mapRatio(options.width, options.height),
          }),
          generate_audio: options.audioEnabled ?? false,
          watermark: false,
          ...options.extra,
        }
      : {
          model: modelId,
          prompt,
          // first frame for image-to-video mode
          ...(options.firstFrameUrl && { image: options.firstFrameUrl }),
          // last frame (Seedance 2.0 / Vidu start-end transition)
          ...(options.lastFrameUrl && { last_image: options.lastFrameUrl }),
          ...(options.duration && { duration: options.duration }),
          // Atlas Cloud video API uses resolution + ratio instead of width/height
          ...(options.width && options.height && {
            resolution: this.mapResolution(options.width, options.height),
            ratio: this.mapRatio(options.width, options.height),
          }),
          ...(options.seed !== undefined && { seed: options.seed }),
          // audio toggle (Seedance 2.0 generates audio by default; explicitly disable when not enabled)
          generate_audio: options.audioEnabled ?? false,
          watermark: false,
          ...options.extra,
        }

    // Task-creating POST: base.request() will NOT auto-retry it on timeout/network errors
    // (money safety, issue #16). Longer timeout than the 30s default — a slow acknowledge
    // must not be misreported as failure when the server may have accepted the task.
    const response = await this.request<AtlasCreateResponse>('/model/generateVideo', {
      method: 'POST',
      body,
      timeout: 60000,
    })

    return { taskId: this.extractTaskId(response), modelId }
  }

  /**
   * Generate a video (submit + wait). Prefer submitVideoTask + waitForTask when the
   * caller can persist the task ID in between.
   */
  async generateVideo(options: VideoOptions): Promise<VideoResult> {
    const startTime = Date.now()
    const { taskId, modelId } = await this.submitVideoTask(options)

    // video generation takes longer; use a longer polling interval
    const finalStatus = await this.pollTaskStatus(taskId, { interval: 5000 })

    const outputs = this.extractOutputs(finalStatus)

    return {
      taskId,
      videoUrls: outputs,
      duration: options.duration,
      processingTime: Date.now() - startTime,
      modelId,
      hasAudio: options.audioEnabled ?? false,
    }
  }

  /**
   * Query task status
   */
  async getTaskStatus(taskId: string): Promise<TaskStatus> {
    const response = await this.request<AtlasPredictionResponse>(
      `/model/prediction/${taskId}`
    )

    // compatible with both { code, data: {...} } wrapper format and direct prediction object
    const prediction: AtlasPrediction =
      (response.data as AtlasPrediction | undefined) ??
      (response as unknown as AtlasPrediction)

    const status = this.mapStatus(prediction.status)

    const taskStatus: TaskStatus = {
      taskId: prediction.id || taskId,
      status,
      createdAt: prediction.created_at,
    }

    // parse result when task completes (outputs is a URL array; caller distinguishes image vs video)
    if (status === 'completed' && prediction.outputs && prediction.outputs.length > 0) {
      const urls = prediction.outputs
      // infer media type from file extension; default to video
      const isImage = urls.every((u) => /\.(png|jpe?g|webp|gif|bmp)(\?|$)/i.test(u))
      taskStatus.result = isImage
        ? { taskId: taskStatus.taskId, imageUrls: urls, modelId: prediction.model ?? '' }
        : { taskId: taskStatus.taskId, videoUrls: urls, modelId: prediction.model ?? '' }
    }

    // populate error info when the task fails
    if (status === 'failed') {
      if (typeof prediction.error === 'string') {
        taskStatus.error = prediction.error
      } else if (prediction.error) {
        taskStatus.error = prediction.error.message
        taskStatus.errorCode = prediction.error.code
      } else {
        taskStatus.error = '生成失败'
      }
    }

    return taskStatus
  }

  /**
   * List available models: the curated static catalog first, then every additional
   * video model discovered from the live Atlas catalog (public endpoint, 10-min cache).
   * Discovery is strictly additive — offline or on any parse failure the static
   * catalog is returned unchanged.
   */
  async listModels(mediaType?: MediaType): Promise<Model[]> {
    let models: Model[] = ATLAS_MODELS.map((m) => ({ ...m, provider: this.name }))
    if (mediaType !== 'image') {
      try {
        const entries = await fetchAtlasCatalog(this.config.baseUrl, { apiKey: this.config.apiKey })
        const curatedIds = new Set(ATLAS_MODELS.map((m) => m.id))
        models = models.concat(
          dynamicVideoModels(entries, curatedIds).map((m) => ({ ...m, provider: this.name }))
        )
      } catch {
        // discovery must never break the static list
      }
    }
    if (mediaType) {
      models = models.filter((m) => m.mediaType === mediaType)
    }
    return models
  }

  /**
   * Find the request-param spec for a model. Curated specs win; legacy curated
   * families return undefined on purpose (their hardcoded body IS the contract);
   * unknown models (dynamic discovery / hand-typed custom IDs) derive a spec from
   * their published input schema, falling back to the legacy body when the schema
   * cannot be fetched — which matches the pre-discovery behavior for custom models.
   */
  private async resolveParamSpec(modelId: string): Promise<AtlasVideoParamSpec | undefined> {
    const curated = getVideoParamSpec(modelId)
    if (curated) return curated
    if (ATLAS_MODELS.some((m) => m.id === modelId)) return undefined
    // dynamic models: the picker flow always lists models first, so the catalog cache
    // is warm in any realistic submit; a cold process (e.g. direct MCP call with a
    // hand-typed ID) deliberately falls back to the legacy body — the pre-discovery
    // behavior for unknown models — instead of adding a network call to the pay path
    const entry = getCachedAtlasEntry(modelId)
    if (!entry?.schemaUrl) return undefined
    const input = await fetchAtlasInputSchema(entry.schemaUrl)
    return input ? specFromOpenApiInput(input) : undefined
  }

  // ==================== Private methods ====================

  /**
   * Validate the requested video model against the actual generation intent, remapping to
   * the matching sibling variant when possible. Atlas model IDs follow `family/model/mode`,
   * so the text-to-video and image-to-video variants of one family differ only in the last
   * segment — but they are DIFFERENT billable endpoints.
   *
   * Root cause of issue #16: the default video model auto-picked in settings is a
   * text-to-video variant, and submitting it with a first-frame image silently billed
   * text-to-video while the user clicked "convert image to motion". Now:
   * - first frame present + t2v-only model → remap to the sibling image-to-video model
   *   (throw before submitting if no sibling exists);
   * - image-to-video mode requested but no first frame available → throw before submitting;
   * - unknown/custom model IDs pass through unchanged (nothing to validate against).
   */
  private resolveVideoModel(options: VideoOptions): string {
    const { modelId, firstFrameUrl } = options
    const catalog = new Map(ATLAS_MODELS.map((m) => [m.id, m]))
    // capability info comes from the static catalog OR the cached dynamic catalog,
    // so discovered models get the same pre-billing guard as curated ones
    const knows = (id: string): boolean => catalog.has(id) || getCachedAtlasEntry(id) !== undefined
    const modesOf = (id: string): Model['modes'] | undefined => {
      const staticEntry = catalog.get(id)
      if (staticEntry) return staticEntry.modes
      const dynamicEntry = getCachedAtlasEntry(id)
      return dynamicEntry ? modesFromCatalogEntry(dynamicEntry) : undefined
    }

    // multimodal reference mode (reference-to-video): needs at least one reference
    // input, and a reference-capable model (remap the family sibling when an
    // image/text variant was configured) — all validated BEFORE any billable call
    if (options.mode === 'video-to-video') {
      if (!options.referenceVideoUrls?.length && !options.referenceImageUrls?.length) {
        throw new ProviderError(
          `参考生视频缺少参考素材：至少需要一条参考视频或一张参考图（模型 ${modelId} 未提交，未产生费用）`,
          'MISSING_REFERENCE',
          this.name
        )
      }
      if (modelId.includes('/reference-to-video')) return modelId
      const sibling = modelId.replace(/\/(?:text|image)-to-video$/, '/reference-to-video')
      if (sibling !== modelId && knows(sibling)) return sibling
      throw new ProviderError(
        `模型 ${modelId} 不支持参考生视频。请选择支持参考生视频的模型（Seedance 2.0 / MiniMax H3 / 万相 2.7 / Kling O3 系列；任务未提交，未产生费用）`,
        'MODEL_MODE_MISMATCH',
        this.name
      )
    }

    // image-to-video was requested but no usable first frame reached the provider —
    // submitting anyway would bill a video unrelated to the user's image
    if (options.mode === 'image-to-video' && !firstFrameUrl) {
      throw new ProviderError(
        `图生视频缺少首帧图片：请确认图片已生成且可访问（模型 ${modelId} 未提交，未产生费用）`,
        'MISSING_FIRST_FRAME',
        this.name
      )
    }

    const modes = modesOf(modelId)
    if (!modes) return modelId // custom model: no capability info, pass through

    if (firstFrameUrl && !modes.includes('image-to-video')) {
      // remap to the image-to-video sibling of the same family, covering both
      // naming conventions:
      //   bytedance/seedance-2.0/text-to-video -> .../image-to-video
      //   minimax/hailuo-2.3/t2v-standard      -> .../i2v-standard
      for (const [pattern, replacement] of AtlasCloudProvider.I2V_SIBLING_TRANSFORMS) {
        const sibling = modelId.replace(pattern, replacement)
        if (sibling !== modelId && knows(sibling)) return sibling
      }
      throw new ProviderError(
        `模型 ${modelId} 不支持图生视频，且没有对应的图生视频变体。请在设置中选择带「图生视频」标识的模型（任务未提交，未产生费用）`,
        'MODEL_MODE_MISMATCH',
        this.name
      )
    }

    if (!firstFrameUrl && !modes.includes('text-to-video')) {
      throw new ProviderError(
        `模型 ${modelId} 是图生视频模型，需要首帧图片才能生成（任务未提交，未产生费用）`,
        'MODEL_MODE_MISMATCH',
        this.name
      )
    }

    return modelId
  }

  /** Sibling ID rewrites used to find a family's image-to-video variant */
  private static readonly I2V_SIBLING_TRANSFORMS: ReadonlyArray<[RegExp, string]> = [
    [/\/text-to-video$/, '/image-to-video'],
    // MiniMax Hailuo 2.x naming scheme (t2v-standard / i2v-standard / i2v-pro)
    [/\/t2v-([a-z0-9-]+)$/, '/i2v-$1'],
  ]

  /** Extract task ID from the create-task response (compatible with both wrapped and unwrapped formats) */
  private extractTaskId(response: AtlasCreateResponse): string {
    const taskId = response.data?.id ?? response.id
    if (!taskId) {
      throw new ProviderError(
        `Atlas Cloud 未返回任务 ID: ${JSON.stringify(response).slice(0, 200)}`,
        'NO_TASK_ID',
        this.name
      )
    }
    return taskId
  }

  /** Extract the list of output URLs from the final task status */
  private extractOutputs(finalStatus: TaskStatus): string[] {
    const result = this.requireResult(finalStatus.result)
    const urls = 'imageUrls' in result ? result.imageUrls : result.videoUrls
    if (!urls || urls.length === 0) {
      throw new ProviderError('任务完成但输出为空', 'EMPTY_OUTPUT', this.name)
    }
    return urls
  }

  /** Map Atlas Cloud task status to the unified status enum */
  private mapStatus(atlasStatus: string): TaskStatusEnum {
    const statusMap: Record<string, TaskStatusEnum> = {
      created: 'pending',
      starting: 'pending',
      queued: 'pending',
      processing: 'processing',
      running: 'processing',
      succeeded: 'completed',
      completed: 'completed',
      failed: 'failed',
      timeout: 'failed',
      canceled: 'cancelled',
      cancelled: 'cancelled',
    }
    return statusMap[atlasStatus] ?? 'pending'
  }

  /** Map width/height to the Atlas Cloud resolution tier */
  private mapResolution(width: number, height: number): string {
    const minSide = Math.min(width, height)
    if (minSide >= 1080) return '1080p'
    if (minSide >= 720) return '720p'
    return '480p'
  }

  /** Map width/height to the nearest ratio tier */
  private mapRatio(width: number, height: number): string {
    return nearestRatio(width, height)
  }
}
