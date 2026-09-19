import { z } from "zod";

/**
 * Treats a blank variable as an absent one, and trims the rest.
 *
 * A variable left empty in `.env` arrives as "", not as `undefined`, and zod's
 * `.default()` only fires on `undefined`. Without this an empty line skips the
 * default and is validated as a value instead — so `VIDEO_GENERATION_PROVIDER=`
 * fails as "expected prism|lk666" rather than falling back to Prism, which is
 * exactly backwards for a field that has a default to fall back on.
 *
 * Surrounding whitespace is stripped for the same reason: `FOO=prism ` is a
 * typo the operator cannot see, and every string field in these schemas
 * already trims its own value.
 */
export const blankAsAbsent = (schema) =>
  z.preprocess((value) => {
    if (typeof value !== "string") return value ?? undefined;
    return value.trim() || undefined;
  }, schema);

const defaultPrismApiBaseUrl =
  process.env.NODE_ENV === "production"
    ? "https://prism.ullrai.com/api/v1"
    : "https://staging-prism.ullrai.com/api/v1";

export const databaseUrlSchema = z
  .url()
  .refine(
    (value) => ["postgres:", "postgresql:"].includes(new URL(value).protocol),
    "DATABASE_URL must use the postgres or postgresql protocol",
  );

// Web and Worker choose their pool defaults but share validation. Only the pool
// sizes are configurable; driver timing lives in `POOL_TIMING`.
export function databaseEnvFields(poolSize) {
  return {
    DATABASE_URL: blankAsAbsent(databaseUrlSchema),
    JOB_DATABASE_URL: blankAsAbsent(databaseUrlSchema.optional()),
    DB_POOL_SIZE: blankAsAbsent(
      z.coerce.number().int().positive().max(50).default(poolSize),
    ),
    JOB_DB_POOL_SIZE: blankAsAbsent(
      z.coerce.number().int().positive().max(20).default(3),
    ),
    // Must stay below the host's container stop window, which varies by platform.
    WORKER_GRACEFUL_TIMEOUT_MS: blankAsAbsent(
      z.coerce.number().int().positive().default(30_000),
    ),
  };
}

export const modelEnvFields = {
  LLM_BASE_URL: blankAsAbsent(z.url().default("https://openrouter.ai/api/v1")),
  AI_DEFAULT_MODEL: blankAsAbsent(
    z.string().trim().min(1).default("openai/gpt-5.6-luna"),
  ),
};

// Product-page imports run only in the Worker. Keeping these fields shared
// here gives the standalone artifact and tests one validation contract.
export const scrapingEnvFields = {
  FIRECRAWL_API_BASE_URL: blankAsAbsent(
    z.url().default("https://api.firecrawl.dev/v2"),
  ),
  FIRECRAWL_API_KEY: blankAsAbsent(z.string().trim().min(1).optional()),
};

// Media generation runs in both the Web process and the job worker, so the
// connection settings are shared rather than duplicated in each environment
// schema. Model choices remain product constants in `src/lib/ugc/constants.ts`.
export const mediaEnvFields = {
  VIDEO_GENERATION_PROVIDER: blankAsAbsent(
    z.enum(["prism", "lk666"]).default("prism"),
  ),
  PRISM_API_BASE_URL: blankAsAbsent(z.url().default(defaultPrismApiBaseUrl)),
  PRISM_API_KEY: blankAsAbsent(z.string().trim().min(1).optional()),
  PRISM_API_SECRET: blankAsAbsent(z.string().trim().min(1).optional()),
  LK666_API_BASE_URL: blankAsAbsent(z.url().default("https://api.lk888.ai")),
  LK666_API_KEY: blankAsAbsent(z.string().trim().min(1).optional()),
};

// Object storage is used by the Web process, the worker, and the renderer, so
// the fields live here rather than in one environment schema.
export const storageEnvFields = {
  R2_ENDPOINT: blankAsAbsent(z.url().optional()),
  R2_ACCESS_KEY_ID: blankAsAbsent(z.string().optional()),
  R2_SECRET_ACCESS_KEY: blankAsAbsent(z.string().optional()),
  R2_BUCKET_NAME: blankAsAbsent(z.string().optional()),
};
