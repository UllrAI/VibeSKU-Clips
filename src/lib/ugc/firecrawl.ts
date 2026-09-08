import { z } from "zod";
import { scrapingEnvFields } from "@/lib/config/runtime-env.mjs";
import {
  UnreadableSourceError,
  validatePublicProductUrl,
} from "./source-fetch";

const REQUEST_TIMEOUT_MS = 70_000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_SOURCE_TEXT_LENGTH = 80_000;
const MAX_PRODUCT_IMAGES = 8;
const MAX_IMAGE_CANDIDATES_TO_CHECK = 32;
const IMAGE_CHECK_BATCH_SIZE = 8;
const IMAGE_CHECK_TIMEOUT_MS = 10_000;
const MAX_IMAGE_REDIRECTS = 3;
const SUPPORTED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const firecrawlEnvSchema = z.object(scrapingEnvFields);

const productImageSchema = z
  .object({
    url: z.string(),
    alt: z.string().optional(),
  })
  .passthrough();

const productVariantSchema = z
  .object({
    id: z.string().optional(),
    sku: z.string().optional(),
    title: z.string().optional(),
    values: z.record(z.string(), z.unknown()).optional(),
    images: z.array(productImageSchema).optional(),
  })
  .passthrough();

const scrapedProductSchema = z
  .object({
    title: z.string().optional(),
    brand: z.string().optional(),
    category: z.string().optional(),
    description: z.string().optional(),
    variants: z.array(productVariantSchema).optional(),
  })
  .passthrough();

const metadataSchema = z
  .object({
    title: z.string().optional(),
    description: z.string().optional(),
    ogImage: z.union([z.string(), z.array(z.string())]).optional(),
    "og:image": z.union([z.string(), z.array(z.string())]).optional(),
  })
  .passthrough();

const DECORATIVE_IMAGE_PATTERN =
  /(?:^|[._/-])(avatar|badge|favicon|flag|icon|logo|payment|placeholder|sprite|swatch)(?:[._/-]|$)/i;
const GENERIC_IMAGE_TOKENS = new Set([
  "image",
  "images",
  "photo",
  "photos",
  "product",
  "products",
  "resized",
]);

const firecrawlResponseSchema = z
  .object({
    success: z.boolean().optional(),
    data: z
      .object({
        markdown: z.string().optional(),
        images: z.array(z.string()).optional(),
        product: scrapedProductSchema.optional(),
        metadata: metadataSchema.optional(),
        warning: z.string().optional(),
      })
      .passthrough()
      .optional(),
    code: z.string().optional(),
    error: z.string().optional(),
  })
  .passthrough();

type FirecrawlFailureCode =
  | "FIRECRAWL_NOT_CONFIGURED"
  | "FIRECRAWL_AUTH_FAILED"
  | "FIRECRAWL_QUOTA_EXHAUSTED"
  | "FIRECRAWL_SITE_UNSUPPORTED"
  | "FIRECRAWL_REQUEST_REJECTED"
  | "FIRECRAWL_INVALID_RESPONSE"
  | "FIRECRAWL_UNAVAILABLE";

export class FirecrawlError extends Error {
  constructor(
    readonly code: FirecrawlFailureCode,
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "FirecrawlError";
  }
}

export interface ImportedProductSource {
  /** Firecrawl's best product title, suitable for replacing a URL slug. */
  name: string | null;
  /** Only set when the page identifies one unambiguous variant. */
  variant: string | null;
  /** Product-specific images, not every decorative image on the page. */
  images: string[];
  /** Structured product fields followed by cleaned page markdown. */
  text: string;
}

function firecrawlConfig(source: NodeJS.ProcessEnv) {
  const parsed = firecrawlEnvSchema.safeParse(source);
  if (!parsed.success || !parsed.data.FIRECRAWL_API_KEY) {
    throw new FirecrawlError(
      "FIRECRAWL_NOT_CONFIGURED",
      "FIRECRAWL_API_KEY must be configured before product links can be imported.",
      false,
    );
  }
  return {
    apiKey: parsed.data.FIRECRAWL_API_KEY,
    baseUrl: parsed.data.FIRECRAWL_API_BASE_URL.replace(/\/$/, ""),
  };
}

function normalizedHttpsUrl(value: string, baseUrl: URL): string | null {
  try {
    const url = new URL(value, baseUrl);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

function metadataImages(
  metadata: z.infer<typeof metadataSchema> | undefined,
): string[] {
  if (!metadata) return [];
  return [metadata.ogImage, metadata["og:image"]].flatMap((value) =>
    Array.isArray(value) ? value : value ? [value] : [],
  );
}

function productImages(
  product: z.infer<typeof scrapedProductSchema> | undefined,
): string[] {
  return (product?.variants ?? []).flatMap((variant) =>
    (variant.images ?? []).map((image) => image.url),
  );
}

function imageResolutionScore(url: URL): number {
  const dimensions = [
    url.searchParams.get("width"),
    url.searchParams.get("height"),
    url.searchParams.get("w"),
    url.searchParams.get("h"),
    ...[...url.search.matchAll(/(?:width|height|w|h)[:=](\d+)/gi)].map(
      (match) => match[1],
    ),
  ];
  return Math.max(
    0,
    ...dimensions.map((value) => Number.parseInt(value ?? "", 10) || 0),
  );
}

function uniqueImageAssets(candidates: string[], baseUrl: URL): string[] {
  const assets = new Map<string, { url: string; resolution: number }>();
  for (const candidate of candidates) {
    const normalized = normalizedHttpsUrl(candidate, baseUrl);
    if (!normalized) continue;

    const url = new URL(normalized);
    const key = `${url.origin}${url.pathname}`.toLowerCase();
    const resolution = imageResolutionScore(url);
    const current = assets.get(key);
    if (!current) {
      assets.set(key, { url: normalized, resolution });
    } else if (resolution > current.resolution) {
      assets.set(key, { url: normalized, resolution });
    }
  }
  return [...assets.values()].map((asset) => asset.url);
}

function imageTokens(value: string): string[] {
  return (value.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(
    (token) => token.length >= 5 && !GENERIC_IMAGE_TOKENS.has(token),
  );
}

function productImageTokens(
  product: z.infer<typeof scrapedProductSchema> | undefined,
): Set<string> {
  const values = [
    product?.title ?? "",
    product?.brand ?? "",
    ...productImages(product).map((image) => {
      try {
        return decodeURIComponent(
          new URL(image, "https://local.invalid").pathname.split("/").at(-1) ??
            "",
        );
      } catch {
        return "";
      }
    }),
  ];
  return new Set(values.flatMap(imageTokens));
}

function pageImages(
  images: string[] | undefined,
  product: z.infer<typeof scrapedProductSchema> | undefined,
): string[] {
  const tokens = productImageTokens(product);
  const candidates = (images ?? []).flatMap((image, index) => {
    try {
      const pathname = decodeURIComponent(
        new URL(image, "https://local.invalid").pathname,
      );
      if (DECORATIVE_IMAGE_PATTERN.test(pathname)) return [];
      const normalizedPath = pathname.toLowerCase().replace(/[^a-z0-9]+/g, "");
      const relevance = [...tokens].filter((token) =>
        normalizedPath.includes(token),
      ).length;
      return [{ image, index, relevance }];
    } catch {
      return [];
    }
  });
  const relevant = candidates.filter((candidate) => candidate.relevance > 0);
  const relevantAssetCount = new Set(
    relevant.map((candidate) => {
      const url = new URL(candidate.image, "https://local.invalid");
      return `${url.origin}${url.pathname}`.toLowerCase();
    }),
  ).size;
  const selected = relevantAssetCount >= 2 ? relevant : candidates;
  return selected
    .sort(
      (left, right) =>
        right.relevance - left.relevance || left.index - right.index,
    )
    .map((candidate) => candidate.image);
}

async function readableImageUrl(
  candidate: string,
  signal: AbortSignal | undefined,
): Promise<string | null> {
  let current: URL;
  try {
    current = await validatePublicProductUrl(candidate);
  } catch {
    return null;
  }
  const original = current.href;

  for (let redirect = 0; redirect <= MAX_IMAGE_REDIRECTS; redirect += 1) {
    const requestSignal = signal
      ? AbortSignal.any([signal, AbortSignal.timeout(IMAGE_CHECK_TIMEOUT_MS)])
      : AbortSignal.timeout(IMAGE_CHECK_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(current, {
        headers: { accept: "image/*", range: "bytes=0-15" },
        redirect: "manual",
        signal: requestSignal,
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      return null;
    }

    try {
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location || redirect === MAX_IMAGE_REDIRECTS) return null;
        try {
          current = await validatePublicProductUrl(
            new URL(location, current).href,
          );
        } catch {
          return null;
        }
        continue;
      }

      const contentType =
        response.headers
          .get("content-type")
          ?.split(";", 1)[0]
          ?.trim()
          .toLowerCase() ?? "";
      return response.ok && SUPPORTED_IMAGE_TYPES.has(contentType)
        ? original
        : null;
    } finally {
      if (response.body) {
        await response.body.cancel().catch(() => undefined);
      }
    }
  }
  return null;
}

async function readableProductImages(
  candidates: string[],
  signal: AbortSignal | undefined,
): Promise<string[]> {
  const images: string[] = [];
  const candidatesToCheck = candidates.slice(0, MAX_IMAGE_CANDIDATES_TO_CHECK);
  for (
    let offset = 0;
    offset < candidatesToCheck.length && images.length < MAX_PRODUCT_IMAGES;
    offset += IMAGE_CHECK_BATCH_SIZE
  ) {
    const batch = candidatesToCheck.slice(
      offset,
      offset + IMAGE_CHECK_BATCH_SIZE,
    );
    const checked = await Promise.all(
      batch.map((candidate) => readableImageUrl(candidate, signal)),
    );
    images.push(...checked.filter((image): image is string => Boolean(image)));
  }
  return images.slice(0, MAX_PRODUCT_IMAGES);
}

function variantLabel(
  product: z.infer<typeof scrapedProductSchema> | undefined,
): string | null {
  if (!product?.variants || product.variants.length !== 1) return null;
  const [variant] = product.variants;
  const values = Object.values(variant.values ?? {}).filter(
    (value): value is string | number | boolean =>
      ["string", "number", "boolean"].includes(typeof value),
  );
  if (values.length > 0) return values.join(" / ").slice(0, 200);

  const title = variant.title?.trim();
  if (!title || title === product.title?.trim()) return null;
  return title.slice(0, 200);
}

function sourceText(
  product: z.infer<typeof scrapedProductSchema> | undefined,
  metadata: z.infer<typeof metadataSchema> | undefined,
  markdown: string | undefined,
): string {
  const variants = (product?.variants ?? []).flatMap((variant, index) => {
    const values = Object.entries(variant.values ?? {})
      .filter((entry): entry is [string, string | number | boolean] =>
        ["string", "number", "boolean"].includes(typeof entry[1]),
      )
      .map(([key, value]) => `${key}: ${String(value)}`)
      .join(", ");
    const identifiers = [
      variant.title?.trim(),
      variant.sku?.trim() ? `SKU: ${variant.sku.trim()}` : "",
      values,
    ].filter(Boolean);
    return identifiers.length
      ? [`Variant ${index + 1}: ${identifiers.join("; ")}`]
      : [];
  });

  return [
    "Structured product page data:",
    product?.title?.trim() || metadata?.title?.trim()
      ? `Name: ${product?.title?.trim() || metadata?.title?.trim()}`
      : "",
    product?.brand?.trim() ? `Brand: ${product.brand.trim()}` : "",
    product?.category?.trim() ? `Category: ${product.category.trim()}` : "",
    product?.description?.trim() || metadata?.description?.trim()
      ? `Description: ${product?.description?.trim() || metadata?.description?.trim()}`
      : "",
    ...variants,
    markdown?.trim() ? `Product page content:\n${markdown.trim()}` : "",
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, MAX_SOURCE_TEXT_LENGTH);
}

function responseError(status: number, message: string): FirecrawlError {
  const normalizedMessage = message.toLowerCase().replace(/[_-]+/g, " ");
  if (
    /(?:do(?:es)? not support (?:this |the )?|unsupported |not supported )(?:site|website|domain)/.test(
      normalizedMessage,
    ) ||
    /(?:site|website|domain) (?:is )?not supported/.test(normalizedMessage)
  ) {
    return new FirecrawlError("FIRECRAWL_SITE_UNSUPPORTED", message, false);
  }
  if (status === 401 || status === 403) {
    return new FirecrawlError("FIRECRAWL_AUTH_FAILED", message, false);
  }
  if (status === 402) {
    return new FirecrawlError("FIRECRAWL_QUOTA_EXHAUSTED", message, false);
  }
  if (status === 429 || status >= 500) {
    return new FirecrawlError("FIRECRAWL_UNAVAILABLE", message, true);
  }
  return new FirecrawlError("FIRECRAWL_REQUEST_REJECTED", message, false);
}

/**
 * Reads one public product page through Firecrawl. Its deterministic `product`
 * format supplies catalog fields while markdown remains the evidence for the
 * existing fact extraction step.
 */
export async function importProductSource(
  rawUrl: string,
  options: {
    env?: NodeJS.ProcessEnv;
    signal?: AbortSignal;
  } = {},
): Promise<ImportedProductSource> {
  const config = firecrawlConfig(options.env ?? process.env);
  const url = await validatePublicProductUrl(rawUrl);
  const signal = options.signal
    ? AbortSignal.any([options.signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)])
    : AbortSignal.timeout(REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${config.baseUrl}/scrape`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        url: url.href,
        formats: ["markdown", "product", "images"],
        onlyMainContent: true,
        removeBase64Images: true,
        timeout: 60_000,
      }),
      signal,
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new FirecrawlError(
      "FIRECRAWL_UNAVAILABLE",
      "Firecrawl could not be reached.",
      true,
    );
  }

  const rawResponse = await response.text();
  if (rawResponse.length > MAX_RESPONSE_BYTES) {
    throw new FirecrawlError(
      "FIRECRAWL_INVALID_RESPONSE",
      "Firecrawl returned more product data than this import can accept.",
      false,
    );
  }

  let rawData: unknown;
  try {
    rawData = JSON.parse(rawResponse);
  } catch {
    throw new FirecrawlError(
      "FIRECRAWL_INVALID_RESPONSE",
      "Firecrawl returned an invalid response.",
      false,
    );
  }

  const parsed = firecrawlResponseSchema.safeParse(rawData);
  const externalMessage = parsed.success
    ? parsed.data.error || parsed.data.code || `HTTP ${response.status}`
    : `HTTP ${response.status}`;
  if (!response.ok) throw responseError(response.status, externalMessage);
  if (!parsed.success || !parsed.data.success || !parsed.data.data) {
    throw new FirecrawlError(
      "FIRECRAWL_INVALID_RESPONSE",
      "Firecrawl did not return usable product data.",
      false,
    );
  }

  const {
    images: scrapedImages,
    markdown,
    metadata,
    product,
  } = parsed.data.data;
  const text = sourceText(product, metadata, markdown);
  if (!text.trim() || (!product && !markdown?.trim())) {
    throw new UnreadableSourceError(
      "The product link did not contain readable product information.",
    );
  }

  const imageCandidates = uniqueImageAssets(
    [
      ...productImages(product),
      ...pageImages(scrapedImages, product),
      ...metadataImages(metadata),
    ],
    url,
  );
  const images = await readableProductImages(imageCandidates, options.signal);

  return {
    name:
      (product?.title?.trim() || metadata?.title?.trim() || null)?.slice(
        0,
        200,
      ) ?? null,
    variant: variantLabel(product),
    images,
    text,
  };
}
