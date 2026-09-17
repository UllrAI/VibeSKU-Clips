import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, stat, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable, Transform } from "node:stream";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Upload } from "@aws-sdk/lib-storage";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { storageEnvFields } from "@/lib/config/runtime-env.mjs";
import { UPLOAD_CONFIG } from "@/lib/config/upload";
import type { AppDatabase } from "@/database/client";
import { uploads } from "@/database/schema";
import { createFileStorage } from "@/lib/uploads/store";
import { fileKeyFromUrl } from "@/lib/uploads/url";
import { buildFileUrl } from "@/lib/uploads/url";

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

const MAX_GENERATED_BYTES = 2_000_000_000;
const GENERATED_TYPES = {
  video: { contentType: "video/mp4", extension: "mp4" },
  audio: { contentType: "audio/wav", extension: "wav" },
  subtitle: { contentType: "text/plain", extension: "srt" },
} as const;

/** Archive worker output without the 50 MB human-upload limit or whole-file buffering. */
export async function archiveGeneratedFile(input: {
  db: AppDatabase;
  userId: string;
  identity: string;
  kind: keyof typeof GENERATED_TYPES;
  path: string;
}): Promise<string> {
  const file = await stat(input.path);
  if (!file.size || file.size > MAX_GENERATED_BYTES) {
    throw new Error("Generated media size is outside the supported range.");
  }
  const kind = GENERATED_TYPES[input.kind];
  const digest = createHash("sha256")
    .update(input.userId)
    .update(":")
    .update(input.identity)
    .digest("hex");
  const key = `generated/${input.userId}/${digest}.${kind.extension}`;
  const config = storageConfig(process.env);
  const client = storageClient(config);
  const [existing] = await input.db
    .select({ url: uploads.url })
    .from(uploads)
    .where(
      and(
        eq(uploads.userId, input.userId),
        eq(uploads.fileKey, key),
        isNull(uploads.deletedAt),
      ),
    );
  if (existing) return existing.url;
  await new Upload({
    client,
    params: {
      Bucket: config.bucketName,
      Key: key,
      Body: createReadStream(input.path),
      ContentType: kind.contentType,
    },
    queueSize: 2,
    partSize: 8 * 1024 * 1024,
  }).done();
  const url = buildFileUrl(key);
  await input.db
    .insert(uploads)
    .values({
      userId: input.userId,
      fileKey: key,
      url,
      fileName: `${input.identity}.${kind.extension}`,
      fileSize: file.size,
      contentType: kind.contentType,
    })
    .onConflictDoNothing();
  return url;
}

/** Download a provider URL to bounded temporary storage, then archive it. */
export async function archiveGeneratedRemote(input: {
  db: AppDatabase;
  userId: string;
  identity: string;
  kind: "video" | "audio";
  sourceUrl: string;
  /**
   * Runs on the downloaded file before it is uploaded. It lets a caller reject
   * unusable media at the point it arrives, without a second download and
   * without holding the whole file in memory.
   */
  inspect?: (path: string) => Promise<void>;
}): Promise<string> {
  const url = new URL(input.sourceUrl);
  if (url.protocol !== "https:" && url.protocol !== "http:")
    throw new Error("Invalid provider media URL.");
  const response = await fetch(url, { signal: AbortSignal.timeout(180_000) });
  if (!response.ok || !response.body)
    throw new Error(`Provider media download failed (${response.status}).`);
  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > MAX_GENERATED_BYTES)
    throw new Error("Provider media exceeds the size limit.");
  const directory = join(tmpdir(), "vibesku-generated");
  await mkdir(directory, { recursive: true });
  const path = join(directory, crypto.randomUUID());
  let size = 0;
  try {
    await pipeline(
      Readable.fromWeb(
        response.body as import("node:stream/web").ReadableStream,
      ),
      new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          size += chunk.length;
          callback(
            size > MAX_GENERATED_BYTES
              ? new Error("Provider media exceeds the size limit.")
              : null,
            chunk,
          );
        },
      }),
      createWriteStream(path),
    );
    await input.inspect?.(path);
    return await archiveGeneratedFile({ ...input, path });
  } finally {
    await unlink(path).catch(() => undefined);
  }
}

/** Sign only media owned by this work's user before a cloud API or render worker reads it. */
export async function resolveOwnedMediaUrl(
  db: AppDatabase,
  userId: string,
  reference: string,
  allowed: readonly string[] = ["video/", "audio/"],
  expiresIn = 3600,
): Promise<string> {
  const key = fileKeyFromUrl(reference);
  if (!key) throw new ReferenceMediaUnavailableError();
  const [record] = await db
    .select({ contentType: uploads.contentType })
    .from(uploads)
    .where(
      and(
        eq(uploads.fileKey, key),
        eq(uploads.userId, userId),
        isNull(uploads.deletedAt),
      ),
    );
  if (!record || !allowed.some((type) => record.contentType.startsWith(type)))
    throw new ReferenceMediaUnavailableError();
  const config = storageConfig(process.env);
  return getSignedUrl(
    storageClient(config),
    new GetObjectCommand({ Bucket: config.bucketName, Key: key }),
    { expiresIn },
  );
}
