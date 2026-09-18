"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/database";
import { ugcReferences } from "@/database/ugc";
import { requireAuth } from "@/lib/auth/permissions";
import { serverJobQueue } from "@/lib/jobs/server";
import { referenceIngestJob } from "@/lib/jobs/ugc/reference-ingest";
import { createBackgroundTask } from "@/lib/tasks/service";
import { fileKeyFromUrl } from "@/lib/uploads/url";
import { referenceScopeKey } from "./scope";
import type { ActionResult } from "./types";

const referenceSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    locale: z.string().trim().min(2).max(16),
    /** An uploaded file is held as an application URL; a link is fetched. */
    videoUrl: z.string().trim().max(2000).optional(),
    sourceUrl: z.url().max(2000).optional(),
    /**
     * Fetching or reusing someone else's video is the operator's call. The
     * statement is required, recorded with the material, and never inferred.
     */
    rightsAcknowledged: z.literal(true),
  })
  .refine((input) => Boolean(input.videoUrl) !== Boolean(input.sourceUrl))
  .refine(
    (input) => !input.videoUrl || Boolean(fileKeyFromUrl(input.videoUrl)),
  );

async function enqueueIngest(
  referenceId: string,
  userId: string,
): Promise<void> {
  const { taskRun } = await createBackgroundTask({
    db,
    queue: serverJobQueue,
    definition: referenceIngestJob,
    scopeKey: referenceScopeKey(userId, referenceId),
    payload: { referenceId, userId },
    idempotencyKey: `${referenceId}:ingest:${Date.now()}`,
  });
  await db
    .update(ugcReferences)
    .set({
      status: "pending",
      taskRunId: taskRun.id,
      updatedAt: new Date(),
    })
    .where(eq(ugcReferences.id, referenceId));
}

export async function createReference(
  input: z.infer<typeof referenceSchema>,
): Promise<ActionResult> {
  const user = await requireAuth();
  const parsed = referenceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" };

  const [reference] = await db
    .insert(ugcReferences)
    .values({
      userId: user.id,
      title: parsed.data.title,
      source: parsed.data.sourceUrl ? "url" : "upload",
      sourceUrl: parsed.data.sourceUrl ?? null,
      videoUrl: parsed.data.videoUrl ?? null,
      locale: parsed.data.locale,
      rightsAcknowledgedAt: new Date(),
      status: "pending",
    })
    .returning();

  await enqueueIngest(reference.id, user.id);
  revalidatePath("/dashboard/references");
  return { ok: true, id: reference.id };
}

/**
 * Reads the reference again from the beginning. Ingestion is idempotent on the
 * archive key, so a retry after an analysis failure costs one model call.
 */
export async function retryReference(
  referenceId: string,
): Promise<ActionResult> {
  const user = await requireAuth();
  const [reference] = await db
    .select({ id: ugcReferences.id, status: ugcReferences.status })
    .from(ugcReferences)
    .where(
      and(eq(ugcReferences.id, referenceId), eq(ugcReferences.userId, user.id)),
    );
  if (!reference) return { ok: false, code: "not_found" };
  if (reference.status === "ingesting" || reference.status === "analyzing")
    return { ok: false, code: "reference_busy" };

  await enqueueIngest(reference.id, user.id);
  revalidatePath("/dashboard/references");
  revalidatePath(`/dashboard/references/${reference.id}`);
  return { ok: true };
}

export async function deleteReference(
  referenceId: string,
): Promise<ActionResult> {
  const user = await requireAuth();
  await db
    .delete(ugcReferences)
    .where(
      and(eq(ugcReferences.id, referenceId), eq(ugcReferences.userId, user.id)),
    );
  revalidatePath("/dashboard/references");
  return { ok: true };
}
