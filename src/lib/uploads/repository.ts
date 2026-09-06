import { randomUUID } from "crypto";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import type { AppDatabase } from "@/database/client";
import { uploadIntents, uploads } from "@/database/schema";

import { getFileExtension, UPLOAD_CONFIG } from "@/lib/config/upload";

type Transaction = Parameters<Parameters<AppDatabase["transaction"]>[0]>[0];

export type UploadIntent = typeof uploadIntents.$inferSelect;
export type UploadRecord = typeof uploads.$inferSelect;

interface UploadReservation {
  sourceKey?: string;
  userId: string;
  fileName: string;
  fileSize: number;
  contentType: string;
}

interface CompleteUploadInput {
  intentId?: string;
  userId: string;
  key: string;
  contentLength: number;
  contentType: string;
  declaration?: {
    fileName: string;
    fileSize: number;
    contentType: string;
    url: string;
  };
}

export class UploadQuotaExceededError extends Error {
  constructor(readonly quota: "daily" | "total") {
    super(`The ${quota} upload quota has been reached.`);
    this.name = "UploadQuotaExceededError";
  }
}

export class UploadFileDeletedError extends Error {
  constructor() {
    super("This saved file was deleted.");
  }
}

export class UploadIntentUnavailableError extends Error {
  constructor(message = "The upload intent is expired or unavailable.") {
    super(message);
    this.name = "UploadIntentUnavailableError";
  }
}

export class UploadMetadataMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadMetadataMismatchError";
  }
}

export type DeleteObject = (
  key: string,
) => Promise<{ success: boolean; error?: string }>;
export function createUploadRepository(
  db: AppDatabase,
  buildUrl: (key: string) => string,
  deleteFile: DeleteObject,
) {
  async function lockUserUploadScope(userId: string, tx: Transaction) {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${"upload:" + userId}, 0))`,
    );
  }

  async function getUploadUsage(userId: string, tx: Transaction) {
    const [completed] = await tx
      .select({
        total: sql<number>`coalesce(sum(${uploads.fileSize}), 0)`,
        recent: sql<number>`coalesce(
        sum(${uploads.fileSize}) filter (
          where ${uploads.createdAt} >= (now() at time zone 'UTC') - interval '24 hours'
        ),
        0
      )`,
      })
      .from(uploads)
      .where(eq(uploads.userId, userId));

    const [reserved] = await tx
      .select({
        total: sql<number>`coalesce(sum(${uploadIntents.fileSize}), 0)`,
        recent: sql<number>`coalesce(
        sum(${uploadIntents.fileSize}) filter (
          where ${uploadIntents.createdAt} >= now() - interval '24 hours'
        ),
        0
      )`,
      })
      .from(uploadIntents)
      .where(
        and(
          eq(uploadIntents.userId, userId),
          eq(uploadIntents.status, "pending"),
          sql`${uploadIntents.expiresAt} > now()`,
        ),
      );

    return {
      daily: Number(completed?.recent ?? 0) + Number(reserved?.recent ?? 0),
      total: Number(completed?.total ?? 0) + Number(reserved?.total ?? 0),
    };
  }

  async function createUploadIntent({
    sourceKey,
    userId,
    fileName,
    fileSize,
    contentType,
  }: UploadReservation): Promise<UploadIntent> {
    return db.transaction(async (tx) => {
      await lockUserUploadScope(userId, tx);

      if (sourceKey) {
        const [existing] = await tx
          .select()
          .from(uploadIntents)
          .where(
            and(
              eq(uploadIntents.sourceKey, sourceKey),
              eq(uploadIntents.userId, userId),
              inArray(uploadIntents.status, ["pending", "completed"]),
            ),
          );
        if (existing) {
          if (
            existing.fileName !== fileName ||
            existing.fileSize !== fileSize ||
            existing.contentType !== contentType
          )
            throw new UploadMetadataMismatchError(
              "Idempotent upload input changed.",
            );
          if (
            existing.status === "completed" ||
            existing.expiresAt.getTime() > Date.now()
          )
            return existing;
          // A new reservation gets a new object key. Orphan cleanup can finish
          // deleting the expired key without touching the replacement upload.
          await tx
            .update(uploadIntents)
            .set({ status: "cancelled", updatedAt: new Date() })
            .where(eq(uploadIntents.id, existing.id));
        }
      }
      const usage = await getUploadUsage(userId, tx);
      if (usage.daily + fileSize > UPLOAD_CONFIG.DAILY_QUOTA_BYTES) {
        throw new UploadQuotaExceededError("daily");
      }
      if (usage.total + fileSize > UPLOAD_CONFIG.TOTAL_QUOTA_BYTES) {
        throw new UploadQuotaExceededError("total");
      }

      const id = randomUUID();
      const extension = getFileExtension(contentType);
      const fileKey = `uploads/${userId}/${id}.${extension}`;
      const [intent] = await tx
        .insert(uploadIntents)
        .values({
          id,
          userId,
          sourceKey,
          fileKey,
          fileName,
          fileSize,
          contentType,
          expiresAt: sql`now() + make_interval(secs => ${UPLOAD_CONFIG.UPLOAD_INTENT_EXPIRATION})`,
        })
        .returning();

      if (!intent) {
        throw new Error("Upload intent was not created.");
      }

      return intent;
    });
  }

  async function releaseUploadIntent(intentId: string, userId: string) {
    await db.transaction(async (tx) => {
      await lockUserUploadScope(userId, tx);
      await tx
        .delete(uploadIntents)
        .where(
          and(
            eq(uploadIntents.id, intentId),
            eq(uploadIntents.userId, userId),
            eq(uploadIntents.status, "pending"),
          ),
        );
    });
  }

  async function cancelUploadIntent(intentId: string, userId: string) {
    return db.transaction(async (tx) => {
      await lockUserUploadScope(userId, tx);
      const [cancelled] = await tx
        .update(uploadIntents)
        .set({
          status: "cancelled",
          updatedAt: sql`now()`,
        })
        .where(
          and(
            eq(uploadIntents.id, intentId),
            eq(uploadIntents.userId, userId),
            eq(uploadIntents.status, "pending"),
          ),
        )
        .returning({ id: uploadIntents.id });

      return Boolean(cancelled);
    });
  }

  async function completeUploadIntent({
    intentId,
    userId,
    key,
    contentLength,
    contentType,
    declaration,
  }: CompleteUploadInput): Promise<UploadRecord> {
    return db.transaction(async (tx) => {
      await lockUserUploadScope(userId, tx);

      const intentCondition = intentId
        ? and(
            eq(uploadIntents.id, intentId),
            eq(uploadIntents.userId, userId),
            eq(uploadIntents.fileKey, key),
          )
        : and(eq(uploadIntents.userId, userId), eq(uploadIntents.fileKey, key));
      const [intent] = await tx
        .select({
          row: uploadIntents,
          expired: sql<boolean>`${uploadIntents.expiresAt} <= now()`,
        })
        .from(uploadIntents)
        .where(intentCondition)
        .for("update");

      if (!intent) {
        throw new UploadIntentUnavailableError();
      }

      if (declaration) {
        if (
          intent.row.fileName !== declaration.fileName ||
          intent.row.fileSize !== declaration.fileSize ||
          intent.row.contentType !== declaration.contentType
        ) {
          throw new UploadMetadataMismatchError(
            "Upload details do not match the original reservation.",
          );
        }
      }

      if (intent.row.status === "completed") {
        const [existing] = await tx
          .select()
          .from(uploads)
          .where(eq(uploads.uploadIntentId, intent.row.id))
          .limit(1);
        if (!existing || existing.deletedAt) {
          throw new UploadFileDeletedError();
        }
        return existing;
      }

      if (intent.row.status !== "pending" || intent.expired) {
        throw new UploadIntentUnavailableError();
      }
      if (intent.row.fileKey !== key) {
        throw new UploadMetadataMismatchError(
          "Upload key does not match the reserved object key.",
        );
      }
      if (intent.row.fileSize !== contentLength) {
        throw new UploadMetadataMismatchError(
          "Uploaded object size does not match the reserved size.",
        );
      }
      if (intent.row.contentType !== contentType) {
        throw new UploadMetadataMismatchError(
          "Uploaded object content type does not match the reserved type.",
        );
      }

      const [record] = await tx
        .insert(uploads)
        .values({
          userId,
          uploadIntentId: intent.row.id,
          fileKey: key,
          url: buildUrl(key),
          fileName: intent.row.fileName,
          fileSize: contentLength,
          contentType,
        })
        .returning();

      if (!record) {
        throw new Error("Upload record was not created.");
      }

      await tx
        .update(uploadIntents)
        .set({
          status: "completed",
          completedAt: sql`now()`,
          updatedAt: sql`now()`,
        })
        .where(eq(uploadIntents.id, intent.row.id));

      return record;
    });
  }

  async function claimExpiredIntent(
    intent: Pick<UploadIntent, "id" | "userId" | "status">,
  ): Promise<UploadIntent | null> {
    return db.transaction(async (tx) => {
      await lockUserUploadScope(intent.userId, tx);
      const [claimed] = await tx
        .update(uploadIntents)
        .set({ status: "cleaning", updatedAt: sql`now()` })
        .where(
          and(
            eq(uploadIntents.id, intent.id),
            eq(uploadIntents.userId, intent.userId),
            eq(uploadIntents.status, intent.status),
            or(
              eq(uploadIntents.status, "pending"),
              eq(uploadIntents.status, "cancelled"),
            ),
            sql`${uploadIntents.expiresAt} <= now()`,
          ),
        )
        .returning();
      return claimed ?? null;
    });
  }

  async function cleanupExpiredUploadIntents(
    limit = 100,
    deleteObject: typeof deleteFile = deleteFile,
  ) {
    const safeLimit = Math.max(1, Math.min(limit, 100));
    const candidates = await db
      .select({
        id: uploadIntents.id,
        userId: uploadIntents.userId,
        status: uploadIntents.status,
      })
      .from(uploadIntents)
      .where(
        and(
          or(
            eq(uploadIntents.status, "pending"),
            eq(uploadIntents.status, "cancelled"),
          ),
          sql`${uploadIntents.expiresAt} <= now()`,
        ),
      )
      .orderBy(uploadIntents.cleanupAttempts, uploadIntents.expiresAt)
      .limit(safeLimit);

    let deleted = 0;
    let deferred = 0;
    let failed = 0;

    for (const candidate of candidates) {
      const claimed = await claimExpiredIntent(candidate);
      if (!claimed) {
        continue;
      }

      const result = await deleteObject(claimed.fileKey);
      if (result.success) {
        if (!claimed.deleteCheckedAt) {
          await db
            .update(uploadIntents)
            .set({
              status: "cancelled",
              deleteCheckedAt: sql`now()`,
              expiresAt: sql`now() + make_interval(secs => ${UPLOAD_CONFIG.UPLOAD_TOMBSTONE_RECHECK_DELAY})`,
              lastCleanupError: null,
              updatedAt: sql`now()`,
            })
            .where(
              and(
                eq(uploadIntents.id, claimed.id),
                eq(uploadIntents.status, "cleaning"),
              ),
            );
          deferred += 1;
          continue;
        }

        await db
          .delete(uploadIntents)
          .where(
            and(
              eq(uploadIntents.id, claimed.id),
              eq(uploadIntents.status, "cleaning"),
            ),
          );
        deleted += 1;
        continue;
      }

      await db
        .update(uploadIntents)
        .set({
          status: candidate.status,
          expiresAt: sql`now() + make_interval(secs => ${UPLOAD_CONFIG.UPLOAD_CLEANUP_RETRY_DELAY})`,
          cleanupAttempts: sql`${uploadIntents.cleanupAttempts} + 1`,
          lastCleanupError: (result.error ?? "Object deletion failed.").slice(
            0,
            500,
          ),
          updatedAt: sql`now()`,
        })
        .where(
          and(
            eq(uploadIntents.id, claimed.id),
            eq(uploadIntents.status, "cleaning"),
          ),
        );
      failed += 1;
    }

    return { scanned: candidates.length, deleted, deferred, failed };
  }

  async function recoverStaleUploadCleanupClaims() {
    const rows = await db
      .update(uploadIntents)
      .set({ status: "cancelled", updatedAt: sql`now()` })
      .where(
        and(
          eq(uploadIntents.status, "cleaning"),
          sql`${uploadIntents.updatedAt} <= now() - interval '15 minutes'`,
        ),
      )
      .returning({ id: uploadIntents.id });
    return rows.length;
  }

  return {
    createUploadIntent,
    releaseUploadIntent,
    cancelUploadIntent,
    completeUploadIntent,
    cleanupExpiredUploadIntents,
    recoverStaleUploadCleanupClaims,
  };
}
