/**
 * Media provider factory.
 *
 * There is exactly one provider — Prism. It is itself a gateway that races and falls back
 * across upstream vendors, so the per-vendor adapters this project used to carry (Atlas, fal,
 * Replicate, Volcengine, Alibaba, SiliconFlow, OpenAI) were doing the same job twice, each with
 * its own model-id vocabulary, its own quirks and its own key for the user to obtain.
 *
 * The factory shape is kept because ~20 API routes construct a provider from a request body,
 * and because the `AIProvider` contract — two-phase submit/wait, task recovery — is what makes
 * paid generation safe to resume. `createProvider` therefore still takes a name and validates
 * it, rather than silently serving Prism for whatever a caller asks for.
 */

import { PrismProvider } from './prism'
import type { AIProvider, ProviderConfig } from './types'

/** The provider identifier stored in settings and sent by every generation request. */
export const PROVIDER_NAME = 'prism'

/**
 * Create the media provider.
 *
 * Both halves of the credential pair are required here rather than at each of the ~20 call
 * sites: a missing secret otherwise reaches Prism as an empty header and comes back as a bare
 * 401, which reads like a wrong key and sends people to re-copy the one part that was fine.
 *
 * @throws when `config.name` is anything other than `prism` (a stale persisted setting), or
 * when either credential is missing.
 */
export function createProvider(config: ProviderConfig): AIProvider {
  if (config.name !== PROVIDER_NAME) {
    throw new Error(`未知的媒体平台「${config.name}」，当前版本只支持 Prism`)
  }
  if (!config.apiKey?.trim() || !config.apiSecret?.trim()) {
    throw new Error('Prism 需要 API Key 和 API Secret 两项，请到设置里补全')
  }
  return new PrismProvider(config)
}

/**
 * Whether the gateway can ingest a file from this machine.
 *
 * Precise repair has to send the ORIGINAL clip back to the model, which only works if the
 * provider offers upload; Prism fetches reference media by URL and offers none. Derived from the
 * class rather than hand-maintained, so adding `uploadLocalMedia` is all it takes to flip.
 */
export const PROVIDER_UPLOADS_LOCAL_MEDIA =
  typeof (PrismProvider.prototype as Partial<AIProvider>).uploadLocalMedia === 'function'

export type {
  AIProvider,
  ProviderConfig,
  ImageOptions,
  ImageResult,
  VideoOptions,
  VideoResult,
  TaskStatus,
  TaskStatusEnum,
  Model,
  MediaType,
  GenerationMode,
} from './types'

export { BaseProvider, ProviderError } from './base'
export { PrismProvider, PRISM_DEFAULT_BASE_URL, PRISM_CONSOLE_URL } from './prism'
