/**
 * Trending topics — fetches what is trending right now, suggests "what to make a video about",
 * and feeds the result into one-shot video generation.
 *
 * Solves the creator's "I don't know what to make" problem with two keyless source families:
 * - Domestic (Chinese-first default): Douyin hot search + Toutiao hot board JSON endpoints,
 *   with real-time hot values — this is what mass-market Chinese creators actually chase.
 * - Global: Google Trends daily trending RSS (traffic estimates + related news headlines),
 *   best for overseas/English content; China coverage is limited.
 * Parsing is pure/unit-testable; network calls have timeout guards; results go through a
 * shared in-memory TTL cache so free endpoints are never hammered per page view.
 */

export type TrendSource = "douyin" | "toutiao" | "google";

export interface TrendTopic {
  /** Trending keyword, can be used directly as a one-sentence topic */
  title: string;
  /** Human-readable traffic/heat (e.g. "2000+" or "1150万"), optional */
  traffic?: string;
  /** A related news headline providing context for why this term is trending, optional */
  context?: string;
  /** 1-based rank on the source board (domestic boards), optional */
  rank?: number;
  /** Raw hot value from the source board (domestic boards), optional */
  hotValue?: number;
  /** Which board this topic came from, optional */
  source?: TrendSource;
}

function stripCdata(s: string): string {
  const c = s.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
  return c ? c[1] : s;
}

function decodeXml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"');
}

/** Get the first text content of a tag in an XML fragment (handles CDATA + entities). Tag may contain a colon (e.g. ht:approx_traffic). */
function firstTag(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const m = xml.match(re);
  return m ? decodeXml(stripCdata(m[1])).trim() : null;
}

/** Parse Google Trends daily trending RSS → topic candidates (skip channel header, only process <item> entries). Pure function. */
export function parseTrendsRss(xml: string): TrendTopic[] {
  const blocks = xml.split(/<item>/i).slice(1); // first segment is the channel header, discard it
  const out: TrendTopic[] = [];
  for (const block of blocks) {
    const body = block.split(/<\/item>/i)[0];
    const title = firstTag(body, "title");
    if (!title) continue;
    out.push({
      title,
      traffic: firstTag(body, "ht:approx_traffic") || undefined,
      context: firstTag(body, "ht:news_item_title") || undefined,
    });
  }
  return out;
}

/** Fetch trending topic candidates for a region; falls back to US for invalid regions, returns [] on network failure (non-blocking). */
export async function fetchTrendingTopics(geo = "US", opts: { limit?: number } = {}): Promise<TrendTopic[]> {
  const g = /^[a-z]{2}$/i.test(geo) ? geo.toUpperCase() : "US";
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(`https://trends.google.com/trending/rss?geo=${g}`, { signal: ctrl.signal });
    if (!res.ok) return [];
    const topics = parseTrendsRss(await res.text());
    return opts.limit ? topics.slice(0, opts.limit) : topics;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/** Normalize a region code (falls back to US for invalid values). */
export function normalizeGeo(geo: string | null | undefined): string {
  return geo && /^[a-z]{2}$/i.test(geo) ? geo.toUpperCase() : "US";
}

// ---------------------------------------------------------------------------
// Domestic boards (Douyin hot search / Toutiao hot board) — keyless JSON APIs
// ---------------------------------------------------------------------------

/** Format a raw hot value into a compact Chinese reading: 11504605 → "1150万", 170276700 → "1.7亿". */
export function formatHotValue(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "";
  if (n >= 1e8) {
    const yi = n / 1e8;
    return `${yi >= 10 ? Math.round(yi) : Math.round(yi * 10) / 10}亿`;
  }
  if (n >= 1e4) return `${Math.round(n / 1e4)}万`;
  return String(Math.round(n));
}

/** Read a numeric field that sources deliver as either number or numeric string. */
function toNumber(v: unknown): number | undefined {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** Parse the Douyin hot-search response ({data:{word_list:[{word,hot_value,...}]}}) → topics. Pure function; junk input → []. */
export function parseDouyinHotSearch(json: unknown): TrendTopic[] {
  const data = (json as { data?: { word_list?: unknown } })?.data;
  const list = Array.isArray(data?.word_list) ? data.word_list : [];
  const out: TrendTopic[] = [];
  for (const raw of list) {
    const word = (raw as { word?: unknown })?.word;
    if (typeof word !== "string" || !word.trim()) continue;
    const hotValue = toNumber((raw as { hot_value?: unknown }).hot_value);
    out.push({
      title: word.trim(),
      hotValue,
      traffic: hotValue ? formatHotValue(hotValue) : undefined,
      rank: out.length + 1,
      source: "douyin",
    });
  }
  return out;
}

/** Parse the Toutiao hot-board response ({data:[{Title,HotValue,...}]}) → topics. Pure function; junk input → []. */
export function parseToutiaoHotBoard(json: unknown): TrendTopic[] {
  const list = (json as { data?: unknown })?.data;
  const items = Array.isArray(list) ? list : [];
  const out: TrendTopic[] = [];
  for (const raw of items) {
    const title = (raw as { Title?: unknown })?.Title;
    if (typeof title !== "string" || !title.trim()) continue;
    const hotValue = toNumber((raw as { HotValue?: unknown }).HotValue);
    out.push({
      title: title.trim(),
      hotValue,
      traffic: hotValue ? formatHotValue(hotValue) : undefined,
      rank: out.length + 1,
      source: "toutiao",
    });
  }
  return out;
}

/** Fetch one JSON endpoint with a timeout; returns null on any failure (caller decides the fallback). */
async function fetchJson(url: string, headers: Record<string, string>): Promise<unknown | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers, cache: "no-store" });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch domestic trending topics: Douyin hot search first (what short-video creators actually chase),
 * falling back to the Toutiao hot board when Douyin returns nothing usable. Returns [] only if both fail.
 */
export async function fetchDomesticTrends(): Promise<{ source: TrendSource; topics: TrendTopic[] }> {
  const douyin = await fetchJson(
    "https://www.douyin.com/aweme/v1/web/hot/search/list/?device_platform=webapp&aid=6383",
    {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      Referer: "https://www.douyin.com/",
    }
  );
  const douyinTopics = parseDouyinHotSearch(douyin);
  if (douyinTopics.length >= 5) return { source: "douyin", topics: douyinTopics };

  const toutiao = await fetchJson("https://www.toutiao.com/hot-event/hot-board/?origin=toutiao_pc", {
    "User-Agent": "Mozilla/5.0",
  });
  const toutiaoTopics = parseToutiaoHotBoard(toutiao);
  if (toutiaoTopics.length > 0) return { source: "toutiao", topics: toutiaoTopics };
  return { source: "douyin", topics: douyinTopics };
}

// ---------------------------------------------------------------------------
// Shared TTL cache — free endpoints must not be hit once per page view
// ---------------------------------------------------------------------------

export const TRENDS_CACHE_TTL_MS = 10 * 60 * 1000;

const trendsCache = new Map<string, { at: number; value: unknown }>();

/** True when a cached value is "empty" (no topics) — empty results are not cached so transient failures retry quickly. */
function isEmptyResult(value: unknown): boolean {
  if (Array.isArray(value)) return value.length === 0;
  const topics = (value as { topics?: unknown })?.topics;
  return Array.isArray(topics) && topics.length === 0;
}

/**
 * Memoize a trends fetcher under a key for TRENDS_CACHE_TTL_MS.
 * `now` is injectable for tests; empty results pass through uncached.
 */
export async function cachedTrends<T>(
  key: string,
  fetcher: () => Promise<T>,
  opts: { ttlMs?: number; now?: () => number } = {}
): Promise<T> {
  const now = opts.now ?? Date.now;
  const ttl = opts.ttlMs ?? TRENDS_CACHE_TTL_MS;
  const hit = trendsCache.get(key);
  if (hit && now() - hit.at < ttl) return hit.value as T;
  const value = await fetcher();
  if (!isEmptyResult(value)) trendsCache.set(key, { at: now(), value });
  return value;
}

/** Test helper: reset the shared cache between cases. */
export function clearTrendsCache(): void {
  trendsCache.clear();
}
