/**
 * Runtime discovery of the Atlas Cloud model catalog ("dynamic import" of video models).
 *
 * GET {baseUrl}/models is a public endpoint (returns 2xx even without a valid key —
 * see api/ai/test-provider) listing every hosted model with display metadata, a
 * category taxonomy (TEXT-TO-VIDEO / IMAGE-TO-VIDEO / VIDEO-TO-VIDEO / AUDIO-TO-VIDEO),
 * per-request pricing, and a URL to the model's published input schema. Merging it into
 * listModels() means brand-new video models (e.g. the MiniMax H3 launch) show up in the
 * picker without a code change; their request bodies are then derived from the published
 * schema via specFromOpenApiInput().
 *
 * Mirrors the LLM-side discovery pattern (llm-models.ts): short timeout, module-level
 * TTL cache, and [] on any failure so the static curated catalog is always the floor.
 */

import type { Model } from './types'

export interface AtlasCatalogEntry {
  model: string
  type: string
  displayName?: string
  profile?: string
  categories: string[]
  schemaUrl?: string
  /** Per-request base price in USD, when Atlas publishes one */
  priceBase?: string
  /** Atlas's own popularity ranking (higher = more prominent) */
  priority?: number
}

interface RawCatalogEntry {
  model?: string
  type?: string
  displayName?: string
  profile?: string
  categories?: unknown
  schema?: string
  priority?: number
  price?: { actual?: { base_price?: string } }
}

const CATALOG_TTL_MS = 10 * 60_000
const FETCH_TIMEOUT_MS = 6_000

interface CatalogCache {
  key: string
  at: number
  entries: AtlasCatalogEntry[]
  byId: Map<string, AtlasCatalogEntry>
}

let catalogCache: CatalogCache | null = null
/** Parsed Input schemas keyed by schema URL (immutable static files) */
const inputSchemaCache = new Map<string, unknown>()

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  fetchImpl: typeof fetch
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

function toEntry(raw: RawCatalogEntry): AtlasCatalogEntry | undefined {
  if (!raw?.model || !raw.type) return undefined
  return {
    model: raw.model,
    type: raw.type,
    displayName: raw.displayName,
    profile: raw.profile,
    categories: Array.isArray(raw.categories)
      ? raw.categories.filter((c): c is string => typeof c === 'string')
      : [],
    schemaUrl: raw.schema,
    priceBase: raw.price?.actual?.base_price,
    priority: typeof raw.priority === 'number' ? raw.priority : undefined,
  }
}

/**
 * Fetch (with cache) the full Atlas model catalog. Returns [] on any failure —
 * discovery is strictly additive and must never break the static catalog.
 */
export async function fetchAtlasCatalog(
  baseUrl: string,
  opts?: { apiKey?: string; ttlMs?: number; timeoutMs?: number; fetchImpl?: typeof fetch }
): Promise<AtlasCatalogEntry[]> {
  const key = baseUrl.replace(/\/+$/, '')
  const ttl = opts?.ttlMs ?? CATALOG_TTL_MS
  if (catalogCache && catalogCache.key === key && Date.now() - catalogCache.at < ttl) {
    return catalogCache.entries
  }

  const fetchImpl = opts?.fetchImpl ?? globalThis.fetch
  try {
    const res = await fetchWithTimeout(
      `${key}/models`,
      { headers: opts?.apiKey ? { Authorization: `Bearer ${opts.apiKey}` } : {} },
      opts?.timeoutMs ?? FETCH_TIMEOUT_MS,
      fetchImpl
    )
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = (await res.json()) as { data?: RawCatalogEntry[] } | RawCatalogEntry[]
    const rows = Array.isArray(json) ? json : Array.isArray(json?.data) ? json.data : []
    const entries = rows
      .map(toEntry)
      .filter((e): e is AtlasCatalogEntry => e !== undefined)
    if (entries.length === 0) throw new Error('empty catalog')
    catalogCache = {
      key,
      at: Date.now(),
      entries,
      byId: new Map(entries.map((e) => [e.model, e])),
    }
    return entries
  } catch {
    // stale cache beats nothing; otherwise fall back to the static catalog
    return catalogCache?.key === key ? catalogCache.entries : []
  }
}

/** Synchronous lookup into the last fetched catalog (used by the pre-billing guard) */
export function getCachedAtlasEntry(modelId: string): AtlasCatalogEntry | undefined {
  return catalogCache?.byId.get(modelId)
}

/** Test hook: drop all catalog/schema caches */
export function clearAtlasCatalogCache(): void {
  catalogCache = null
  inputSchemaCache.clear()
}

/**
 * Fetch (with cache) a model's published input schema and return
 * components.schemas.Input, or undefined on any failure.
 */
export async function fetchAtlasInputSchema(
  schemaUrl: string,
  fetchImpl?: typeof fetch
): Promise<unknown | undefined> {
  if (inputSchemaCache.has(schemaUrl)) return inputSchemaCache.get(schemaUrl)
  try {
    const res = await fetchWithTimeout(schemaUrl, {}, FETCH_TIMEOUT_MS, fetchImpl ?? globalThis.fetch)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = (await res.json()) as {
      components?: { schemas?: { Input?: unknown } }
    }
    const input = json?.components?.schemas?.Input
    if (input) inputSchemaCache.set(schemaUrl, input)
    return input
  } catch {
    return undefined
  }
}

/** Generation categories our pipeline can drive (t2v prompts / i2v first frames) */
const USABLE_CATEGORIES = new Set(['TEXT-TO-VIDEO', 'IMAGE-TO-VIDEO'])

/** Derive unified generation modes from Atlas categories + ID convention */
export function modesFromCatalogEntry(entry: AtlasCatalogEntry): Model['modes'] {
  const modes: Model['modes'] = []
  if (entry.categories.includes('TEXT-TO-VIDEO')) modes.push('text-to-video')
  if (entry.categories.includes('IMAGE-TO-VIDEO')) modes.push('image-to-video')
  if (entry.model.endsWith('/reference-to-video')) modes.push('video-to-video')
  return modes
}

/**
 * Map catalog entries to picker-ready video models: Video type only, restricted to
 * categories our pipeline can drive (video-edit / lipsync / avatar models need inputs
 * the generation flow doesn't produce), minus everything the curated catalog already
 * covers, ordered by Atlas's own popularity ranking.
 */
export function dynamicVideoModels(
  entries: AtlasCatalogEntry[],
  excludeIds: ReadonlySet<string>
): Array<Omit<Model, 'provider'>> {
  return entries
    .filter(
      (e) =>
        e.type === 'Video' &&
        !excludeIds.has(e.model) &&
        e.categories.some((c) => USABLE_CATEGORIES.has(c))
    )
    .sort((a, b) => (b.priority ?? -1) - (a.priority ?? -1))
    .map((e) => ({
      id: e.model,
      name: e.displayName || e.model,
      description: [e.priceBase ? `$${e.priceBase}/次` : undefined, e.profile]
        .filter(Boolean)
        .join(' · ') || undefined,
      modes: modesFromCatalogEntry(e),
      mediaType: 'video' as const,
      extra: { dynamic: true, ...(e.schemaUrl && { schemaUrl: e.schemaUrl }) },
    }))
}
