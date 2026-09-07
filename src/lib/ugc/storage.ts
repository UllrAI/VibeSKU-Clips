import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { storageEnvFields } from "@/lib/config/runtime-env.mjs";
import { UPLOAD_CONFIG } from "@/lib/config/upload";
import type { AppDatabase } from "@/database/client";
import { uploads } from "@/database/schema";
import { createFileStorage } from "@/lib/uploads/store";
import { fileKeyFromUrl } from "@/lib/uploads/url";

const storageEnvSchema = z.object(storageEnvFields);

export type ClipStorage = ReturnType<typeof createFileStorage>;

export class StorageUnavailableError extends Error {
  constructor() {
    super("Object storage must be configured before clips can be delivered.");
    this.name = "StorageUnavailableError";
  }
}

export class ReferenceMediaUnavailableError extends Error {
  constructor() {
    super("A reference image is unavailable. Remove it or upload it again.");
    this.name = "ReferenceMediaUnavailableError";
  }
}

function storageConfig(source: NodeJS.ProcessEnv) {
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
  return {
    endpoint: parsed.data.R2_ENDPOINT,
    accessKeyId: parsed.data.R2_ACCESS_KEY_ID,
    secretAccessKey: parsed.data.R2_SECRET_ACCESS_KEY,
    bucketName: parsed.data.R2_BUCKET_NAME,
  };
}

function storageClient(config: ReturnType<typeof storageConfig>): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

/**
 * Built per call from the process environment so the same renderer works in the
 * Web process and in the standalone worker, which validate env separately.
 */
export function createClipStorage(
  db: AppDatabase,
  source: NodeJS.ProcessEnv = process.env,
): ClipStorage {
  const config = storageConfig(source);

  return createFileStorage(db, {
    endpoint: config.endpoint,
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    bucketName: config.bucketName,
  });
}

/**
 * Turns saved, authenticated file URLs into short-lived URLs a remote model can
 * actually read. Public HTTPS references pass through unchanged.
 */
export async function resolveReferenceUrls(
  db: AppDatabase,
  userId: string,
  references: string[],
  source: NodeJS.ProcessEnv = process.env,
): Promise<string[]> {
  if (references.length === 0) return [];

  const parsed = references.map((reference) => {
    const key = fileKeyFromUrl(reference);
    if (key) return { reference, key };
    try {
      const url = new URL(reference);
      if (url.protocol === "https:") return { reference, key: null };
    } catch {
      // Report every malformed or unsupported reference the same way. The
      // operator's next action is identical: replace the image.
    }
    throw new ReferenceMediaUnavailableError();
  });
  const keys = parsed.flatMap((item) => (item.key ? [item.key] : []));
  if (keys.length === 0) return references;

  const rows = await db
    .select({ fileKey: uploads.fileKey, contentType: uploads.contentType })
    .from(uploads)
    .where(
      and(
        eq(uploads.userId, userId),
        inArray(uploads.fileKey, keys),
        isNull(uploads.deletedAt),
      ),
    );
  const available = new Set(
    rows
      .filter((row) => row.contentType.startsWith("image/"))
      .map((row) => row.fileKey),
  );
  if (keys.some((key) => !available.has(key))) {
    throw new ReferenceMediaUnavailableError();
  }

  const config = storageConfig(source);
  const client = storageClient(config);
  return Promise.all(
    parsed.map((item) =>
      item.key
        ? getSignedUrl(
            client,
            new GetObjectCommand({
              Bucket: config.bucketName,
              Key: item.key,
            }),
            { expiresIn: UPLOAD_CONFIG.REMOTE_REFERENCE_URL_EXPIRATION },
          )
        : item.reference,
    ),
  );
}
