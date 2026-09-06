import { z } from "zod";

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
    DATABASE_URL: databaseUrlSchema,
    JOB_DATABASE_URL: z.preprocess(
      (value) => value || undefined,
      databaseUrlSchema.optional(),
    ),
    DB_POOL_SIZE: z.coerce.number().int().positive().max(50).default(poolSize),
    JOB_DB_POOL_SIZE: z.coerce.number().int().positive().max(20).default(3),
    // Must stay below the host's container stop window, which varies by platform.
    WORKER_GRACEFUL_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(30_000),
  };
}

export const modelEnvFields = {
  LLM_BASE_URL: z.url().default("https://openrouter.ai/api/v1"),
  AI_DEFAULT_MODEL: z.string().trim().min(1).default("openai/gpt-5.6-luna"),
};

// Media generation runs in both the Web process and the job worker, so the
// credentials are shared rather than duplicated in each environment schema.
// Everything else about the provider is a constant in `src/lib/ugc/constants.ts`.
export const mediaEnvFields = {
  PRISM_API_KEY: z.preprocess(
    (value) => value || undefined,
    z.string().trim().min(1).optional(),
  ),
  PRISM_API_SECRET: z.preprocess(
    (value) => value || undefined,
    z.string().trim().min(1).optional(),
  ),
};

// Object storage is used by the Web process, the worker, and the renderer, so
// the fields live here rather than in one environment schema.
export const storageEnvFields = {
  R2_ENDPOINT: z.url().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET_NAME: z.string().optional(),
};
