import { z } from "zod";

export const databaseUrlSchema = z
  .url()
  .refine(
    (value) => ["postgres:", "postgresql:"].includes(new URL(value).protocol),
    "DATABASE_URL must use the postgres or postgresql protocol",
  );

// Web and Worker choose their pool defaults, but share validation and timing.
export function databaseEnvFields(poolSize) {
  return {
    DATABASE_URL: databaseUrlSchema,
    JOB_DATABASE_URL: z.preprocess(
      (value) => value || undefined,
      databaseUrlSchema.optional(),
    ),
    DB_POOL_SIZE: z.coerce.number().int().positive().max(50).default(poolSize),
    DB_IDLE_TIMEOUT: z.coerce.number().int().nonnegative().default(300),
    DB_MAX_LIFETIME: z.coerce.number().int().nonnegative().default(14_400),
    DB_CONNECT_TIMEOUT: z.coerce.number().int().positive().max(4).default(4),
    JOB_DB_POOL_SIZE: z.coerce.number().int().positive().max(20).default(3),
    WORKER_GRACEFUL_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(30_000),
  };
}

export const modelEnvFields = {
  LLM_BASE_URL: z.url().default("https://api.openai.com/v1"),
  AI_DEFAULT_MODEL: z.string().trim().min(1).default("gpt-5.6-luna"),
};

// Media generation runs in both the Web process and the job worker, so the
// provider fields are shared rather than duplicated in each environment schema.
export const mediaEnvFields = {
  PRISM_API_BASE_URL: z.url().default("https://prism.ullrai.com/api/v1"),
  PRISM_API_KEY: z.preprocess(
    (value) => value || undefined,
    z.string().trim().min(1).optional(),
  ),
  PRISM_API_SECRET: z.preprocess(
    (value) => value || undefined,
    z.string().trim().min(1).optional(),
  ),
  PRISM_IMAGE_MODEL: z.string().trim().min(1).default("nano-banana-pro"),
  PRISM_VIDEO_MODEL: z.string().trim().min(1).default("sora2"),
};

// Object storage is used by the Web process, the worker, and the renderer, so
// the fields live here rather than in one environment schema.
export const storageEnvFields = {
  R2_ENDPOINT: z.url().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET_NAME: z.string().optional(),
  UPLOAD_DAILY_QUOTA_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(1024 * 1024 * 1024),
  UPLOAD_TOTAL_QUOTA_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(5 * 1024 * 1024 * 1024),
};
