import { z } from "zod";
import { storageEnvFields } from "@/lib/config/runtime-env.mjs";
import type { AppDatabase } from "@/database/client";
import { createFileStorage } from "@/lib/uploads/store";

const storageEnvSchema = z.object(storageEnvFields);

export type ClipStorage = ReturnType<typeof createFileStorage>;

export class StorageUnavailableError extends Error {
  constructor() {
    super("Object storage must be configured before clips can be delivered.");
    this.name = "StorageUnavailableError";
  }
}

/**
 * Built per call from the process environment so the same renderer works in the
 * Web process and in the standalone worker, which validate env separately.
 */
export function createClipStorage(
  db: AppDatabase,
  source: NodeJS.ProcessEnv = process.env,
): ClipStorage {
  const parsed = storageEnvSchema.safeParse(source);
  if (
    !parsed.success ||
    !parsed.data.R2_ENDPOINT ||
    !parsed.data.R2_ACCESS_KEY_ID ||
    !parsed.data.R2_SECRET_ACCESS_KEY ||
    !parsed.data.R2_BUCKET_NAME
  ) {
    throw new StorageUnavailableError();
  }

  return createFileStorage(db, {
    endpoint: parsed.data.R2_ENDPOINT,
    accessKeyId: parsed.data.R2_ACCESS_KEY_ID,
    secretAccessKey: parsed.data.R2_SECRET_ACCESS_KEY,
    bucketName: parsed.data.R2_BUCKET_NAME,
    UPLOAD_DAILY_QUOTA_BYTES: parsed.data.UPLOAD_DAILY_QUOTA_BYTES,
    UPLOAD_TOTAL_QUOTA_BYTES: parsed.data.UPLOAD_TOTAL_QUOTA_BYTES,
  });
}
