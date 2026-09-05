/**
 * Prism provider — the app's only media gateway.
 *
 * Prism owns the multi-vendor problem this codebase used to solve itself: it races and falls
 * back across upstream vendors, normalises their responses, and hands back one task shape for
 * both images and video. What is left here is the mapping between this project's
 * ImageOptions/VideoOptions and Prism's request body, plus the per-model constraint snapping
 * that keeps a paid request from dying on a 422 (see prism-catalog.ts).
 *
 * Money safety is inherited from BaseProvider and matters more here than anywhere else: the
 * submit POST is non-idempotent, so it is never auto-retried, and `submitVideoTask` returns the
 * moment Prism acknowledges the task so the caller can persist the ID before any polling starts.
 */

import { BaseProvider, ProviderError } from './base'
import type {
  ImageOptions,
  ImageResult,
  MediaType,
  Model,
  ProviderConfig,
  TaskStatus,
  TaskStatusEnum,
  VideoOptions,
  VideoResult,
} from './types'
import {
  DEFAULT_IMAGE_QUALITY,
  MAX_IMAGE_REFERENCES,
  findImageModel,
  findVideoModel,
  imageRatio,
  prismModels,
  resolutionTier,
  sizeTier,
  snapDuration,
  snapRatio,
  snapResolution,
  type PrismImageQuality,
} from './prism-catalog'

/** Production gateway. Overridable in Settings for staging or a self-hosted deployment. */
export const PRISM_DEFAULT_BASE_URL = 'https://prism.ullrai.com/api/v1'

/** Where a user gets the key/secret pair. */
export const PRISM_CONSOLE_URL = 'https://prism.ullrai.com'

/** Prism's own task lifecycle, mapped onto this project's TaskStatusEnum. */
const TASK_STATUS: Record<string, TaskStatusEnum> = {
  pending: 'pending',
  pre_processing: 'pending',
  processing: 'processing',
  post_processing: 'processing',
  completed: 'completed',
  failed: 'failed',
}

interface PrismTask {
  id: string
  status: string
  capability?: string
  output_url?: string | null
  error_message?: string | null
  error_code?: string | null
  progress?: number | null
  created_at?: string
  completed_at?: string | null
  successful_provider?: string | null
  extra_data?: Record<string, unknown> | null
}

interface PrismSubmitResponse {
  success?: boolean
  data?: { task_id?: string; request_id?: string; status?: string }
}

/** Video generation is the slow path — a 6s H3 clip takes ~4 minutes end to end. */
const VIDEO_POLL_INTERVAL_MS = 5000
const VIDEO_POLL_MAX_ATTEMPTS = 240
const IMAGE_POLL_INTERVAL_MS = 3000
const IMAGE_POLL_MAX_ATTEMPTS = 100

export class PrismProvider extends BaseProvider {
  readonly name = 'prism'
  readonly displayName = 'Prism'

  constructor(config: ProviderConfig) {
    super({ ...config, baseUrl: config.baseUrl?.trim() || PRISM_DEFAULT_BASE_URL })
  }

  protected getAuthHeaders(): Record<string, string> {
    return {
      'X-API-Key': this.config.apiKey,
      'X-API-Secret': this.config.apiSecret ?? '',
    }
  }

  /**
   * Unwrap FastAPI's error envelope. Validation failures arrive as
   * `{"detail":[{"msg":"Value error, 模型 minimax-h3 不支持时长 20 秒，可选值: [...]"}]}` — the
   * message inside already names the fix, so surfacing it beats any wording invented here.
   */
  protected formatErrorBody(body: string): string {
    try {
      const parsed = JSON.parse(body) as { detail?: unknown }
      const { detail } = parsed
      if (typeof detail === 'string') return detail
      if (Array.isArray(detail)) {
        const messages = detail
          .map((entry) => (entry as { msg?: unknown })?.msg)
          .filter((msg): msg is string => typeof msg === 'string')
          .map((msg) => msg.replace(/^Value error,\s*/, ''))
        if (messages.length > 0) return messages.join('；')
      }
    } catch {
      /* not JSON — fall through to the raw body */
    }
    return body.trim().slice(0, 300)
  }

  // ==================== images ====================

  async generateImage(options: ImageOptions): Promise<ImageResult> {
    const model = findImageModel(options.modelId)
    if (!model) throw this.unknownModel(options.modelId, 'image')

    const references = [
      ...(options.referenceImageUrls ?? []),
      ...(options.referenceImageUrl ? [options.referenceImageUrl] : []),
    ]
      .filter(Boolean)
      .slice(0, MAX_IMAGE_REFERENCES)

    const quality = model.quality ? normalizeQuality(options.quality) : undefined
    const body = {
      prompt: options.prompt,
      model: model.id,
      aspect_ratio: imageRatio(options.width, options.height),
      image_size: sizeTier(model.sizes, options.width, options.height),
      ...(options.negativePrompt && { negative_prompt: options.negativePrompt }),
      ...(references.length > 0 && { reference_urls: references }),
      ...(quality && { quality }),
    }

    // Prism produces one image per task, so a multi-image request fans out. They are
    // independent tasks: one failing does not invalidate the others already paid for.
    const count = Math.max(1, Math.min(options.count ?? 1, 4))
    const started = Date.now()
    const tasks = await Promise.all(
      Array.from({ length: count }, () => this.submitTask('/image-gen', body))
    )
    const settled = await Promise.allSettled(
      tasks.map((taskId) =>
        this.pollTaskStatus(taskId, {
          interval: IMAGE_POLL_INTERVAL_MS,
          maxAttempts: IMAGE_POLL_MAX_ATTEMPTS,
        })
      )
    )

    const imageUrls = settled
      .flatMap((r) => (r.status === 'fulfilled' ? [(r.value.result as ImageResult | undefined)?.imageUrls ?? []] : []))
      .flat()
    if (imageUrls.length === 0) {
      const reason = settled.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined
      if (reason) throw reason.reason
      throw new ProviderError('任务完成但未返回图片地址', 'NO_RESULT', this.name)
    }

    return {
      taskId: tasks[0],
      imageUrls,
      modelId: model.id,
      duration: Date.now() - started,
    }
  }

  // ==================== video ====================

  async submitVideoTask(options: VideoOptions): Promise<{ taskId: string; modelId: string }> {
    const model = findVideoModel(options.modelId)
    if (!model) throw this.unknownModel(options.modelId, 'video')
    const taskId = await this.submitTask('/video-gen', buildPrismVideoBody(options, options.modelId))
    return { taskId, modelId: model.id }
  }

  async generateVideo(options: VideoOptions): Promise<VideoResult> {
    const started = Date.now()
    const { taskId, modelId } = await this.submitVideoTask(options)
    const status = await this.pollTaskStatus(taskId, {
      interval: VIDEO_POLL_INTERVAL_MS,
      maxAttempts: VIDEO_POLL_MAX_ATTEMPTS,
    })
    const result = this.requireResult(status.result as VideoResult | undefined, '任务完成但未返回视频地址')
    return { ...result, modelId, processingTime: Date.now() - started }
  }

  // ==================== tasks ====================

  async getTaskStatus(taskId: string): Promise<TaskStatus> {
    const task = await this.request<PrismTask>(`/tasks/${encodeURIComponent(taskId)}`)
    const status = TASK_STATUS[task.status] ?? 'processing'
    const output = task.output_url ?? undefined
    const isVideo = task.capability !== 'image-gen'

    return {
      taskId,
      status,
      ...(task.progress != null && { progress: task.progress }),
      ...(task.error_message && { error: task.error_message }),
      ...(task.error_code && { errorCode: task.error_code }),
      ...(task.created_at && { createdAt: task.created_at }),
      ...(task.completed_at && { updatedAt: task.completed_at }),
      ...(status === 'completed' && output
        ? {
            result: isVideo
              ? ({
                  taskId,
                  videoUrls: [output],
                  modelId: '',
                  ...(lastFrameOf(task) && { lastFrameUrl: lastFrameOf(task) }),
                } satisfies VideoResult)
              : ({ taskId, imageUrls: [output], modelId: '' } satisfies ImageResult),
          }
        : {}),
      ...(task.successful_provider && { extra: { successfulProvider: task.successful_provider } }),
    }
  }

  async listModels(mediaType?: MediaType): Promise<Model[]> {
    return prismModels(mediaType)
  }

  // ==================== internals ====================

  /** POST a generation request and return the accepted task ID. Never auto-retried. */
  private async submitTask(path: string, body: Record<string, unknown>): Promise<string> {
    const response = await this.request<PrismSubmitResponse>(path, {
      method: 'POST',
      body,
      idempotent: false,
      timeout: 60000,
    })
    const taskId = response.data?.task_id
    if (!taskId) throw new ProviderError('Prism 未返回任务 ID', 'NO_TASK_ID', this.name)
    return taskId
  }

  private unknownModel(modelId: string, mediaType: MediaType): ProviderError {
    const available = prismModels(mediaType).map((m) => m.id).join('、')
    return new ProviderError(
      `Prism 没有名为「${modelId}」的${mediaType === 'video' ? '视频' : '图片'}模型。可选：${available}`,
      'UNKNOWN_MODEL',
      this.name
    )
  }
}

/** Seedance can return the clip's final frame, which the keyframe chain uses as the next start. */
function lastFrameOf(task: PrismTask): string | undefined {
  const seedance = task.extra_data?.seedance as { last_frame_url?: unknown } | undefined
  return typeof seedance?.last_frame_url === 'string' ? seedance.last_frame_url : undefined
}

/** Accept both the current vocabulary and the legacy hd/standard pair Prism still honours. */
function normalizeQuality(raw: unknown): PrismImageQuality {
  const value = typeof raw === 'string' ? raw.toLowerCase() : ''
  if (value === 'hd') return 'high'
  if (value === 'standard') return 'medium'
  if (value === 'auto' || value === 'low' || value === 'medium' || value === 'high') return value
  return DEFAULT_IMAGE_QUALITY
}

/**
 * Map VideoOptions onto a Prism `/video-gen` body, snapping every model-constrained field.
 *
 * Exported for tests: the constraint table is the part most likely to drift when Prism adds a
 * model, and a wrong body here costs real money rather than failing loudly in review.
 */
export function buildPrismVideoBody(options: VideoOptions, modelId: string): Record<string, unknown> {
  const model = findVideoModel(modelId)
  if (!model) throw new Error(`未知的 Prism 视频模型: ${modelId}`)

  const duration = snapDuration(model.durations, options.duration, 6)
  const body: Record<string, unknown> = {
    prompt: options.prompt || '',
    model: model.id,
    duration,
    aspect_ratio: snapRatio(model.ratios, options.width, options.height),
    resolution: snapResolution(model.resolutions, resolutionTier(options.width, options.height)),
  }

  // Still images. Which field carries them is the single biggest source of silent quality loss:
  // sending a product photo as a style reference when the model has a real first-frame slot
  // produces a video that merely resembles the product.
  const first = options.firstFrameUrl
  const last = options.lastFrameUrl
  if (model.imageInput === 'frames') {
    if (first && last && model.lastFrame) {
      body.first_frame_url = first
      body.last_frame_url = last
    } else if (first && !model.requiresFramePair) {
      body.first_frame_url = first
    } else if (first) {
      // H3 refuses a lone first frame; its documented single-image path is a reference image.
      body.reference_url = first
    }
  } else if (first) {
    // `first-frame` models (Wan) take the still through `reference_url`.
    body.reference_url = first
  }

  const references = (options.referenceImageUrls ?? []).filter(Boolean)
  if (references.length > 0 && model.maxReferenceImages > 0) {
    body.reference_images = references.slice(0, model.maxReferenceImages)
  }
  const videos = (options.referenceVideoUrls ?? []).filter(Boolean)
  if (videos.length > 0 && model.maxReferenceVideos > 0) {
    body.reference_videos = videos.slice(0, model.maxReferenceVideos)
  }
  const audios = (options.referenceAudioUrls ?? []).filter(Boolean)
  if (audios.length > 0 && model.maxReferenceAudios > 0) {
    body.reference_audios = audios.slice(0, model.maxReferenceAudios)
  }

  // Audio. A model with native audio has no switch at all and 422s on `generate_audio: false`,
  // so the field is only ever sent for models that actually expose a toggle.
  if (!model.nativeAudio && model.audioToggle && options.audioEnabled != null) {
    body[model.audioToggle] = options.audioEnabled
  }

  if (options.negativePrompt && model.negativePrompt) body.negative_prompt = options.negativePrompt
  // "Random" is expressed by omitting the field; H3 rejects the 0 that usually means it.
  if (options.seed != null && options.seed >= model.minSeed && options.seed > 0) body.seed = options.seed

  return body
}
