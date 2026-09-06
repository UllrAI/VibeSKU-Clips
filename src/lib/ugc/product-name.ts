/**
 * Names a product from the link an operator pasted, so the composer can accept
 * a URL alone. The result is a starting point, not a claim: ingestion
 * overwrites it once the page has actually been read.
 */
const NOISE_SEGMENTS = new Set([
  "p",
  "product",
  "products",
  "item",
  "items",
  "dp",
  "detail",
  "goods",
  "shop",
  "store",
]);

const TRACKING_SUFFIX = /[-_](?:[0-9]{4,}|[0-9a-f]{8,})$/i;

function readable(segment: string): string {
  return decodeURIComponent(segment)
    .replace(/\.[a-z0-9]{2,5}$/i, "")
    .replace(TRACKING_SUFFIX, "")
    .replace(/[-_+]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isProductUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!/^https?:\/\//i.test(trimmed)) return false;
  try {
    return Boolean(new URL(trimmed).hostname);
  } catch {
    return false;
  }
}

export function productNameFromUrl(value: string, fallback: string): string {
  if (!isProductUrl(value)) return fallback;
  const url = new URL(value.trim());

  const segments = url.pathname
    .split("/")
    .map(readable)
    .filter(
      (segment) =>
        segment.length > 1 &&
        !NOISE_SEGMENTS.has(segment.toLowerCase()) &&
        !/^\d+$/.test(segment),
    );

  // The last meaningful segment is usually the product slug; a bare storefront
  // link has none, and the host is the most useful thing left to say.
  const candidate = segments.at(-1) ?? url.hostname.replace(/^www\./, "");
  // Sentence case: a slug is lowercase, and a product name that reads like one
  // looks unfinished next to names the operator typed.
  return (candidate.charAt(0).toUpperCase() + candidate.slice(1)).slice(0, 200);
}
