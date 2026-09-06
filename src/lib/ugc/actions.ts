"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/database";
import { taskRuns } from "@/database/schema";
import {
  ugcBatches,
  ugcClips,
  ugcExports,
  ugcProducts,
  ugcScripts,
  ugcTalents,
} from "@/database/ugc";
import { requireAuth } from "@/lib/auth/permissions";
import { batchRunJob } from "@/lib/jobs/ugc/batch-run";
import { enqueueClipRender } from "@/lib/jobs/ugc/enqueue";
import { productIngestJob } from "@/lib/jobs/ugc/product-ingest";
import { serverJobQueue } from "@/lib/jobs/server";
import {
  cancelOwnedBackgroundTask,
  createBackgroundTask,
} from "@/lib/tasks/service";
import { MAX_BATCH_CLIPS, SCRIPT_TEMPLATES } from "./constants";
import { isMediaProviderConfigured } from "./media/config";
import { buildExportManifest } from "./manifest";
import { summarizePlan } from "./planning";
import { batchScopeKey, isOwnedScope, productScopeKey } from "./scope";
import type { ActionResult, BatchPlanConfig } from "./types";

const briefSchema = z.object({
  audience: z.string().trim().max(400).optional(),
  sellingPoints: z.array(z.string().trim().min(1).max(200)).max(10).optional(),
  tone: z.string().trim().max(200).optional(),
  scenes: z.string().trim().max(400).optional(),
  bannedPhrases: z.array(z.string().trim().min(1).max(120)).max(20).optional(),
  providedScript: z.string().trim().max(4000).optional(),
});

const productSchema = z.object({
  name: z.string().trim().min(1).max(200),
  sourceUrl: z.string().trim().url().max(2000).optional().or(z.literal("")),
  variant: z.string().trim().max(200).optional(),
  market: z.string().trim().max(16).optional(),
  images: z.array(z.string().trim().min(1).max(2000)).max(8),
  brief: briefSchema.optional(),
});

function emptyToNull(value: string | undefined): string | null {
  return value && value.length > 0 ? value : null;
}

export async function createProduct(
  input: z.infer<typeof productSchema>,
): Promise<ActionResult> {
  const user = await requireAuth();
  const parsed = productSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" };
  if (!parsed.data.sourceUrl && parsed.data.images.length === 0) {
    return { ok: false, code: "product_needs_link_or_image" };
  }

  const [product] = await db
    .insert(ugcProducts)
    .values({
      userId: user.id,
      name: parsed.data.name,
      sourceUrl: emptyToNull(parsed.data.sourceUrl),
      variant: emptyToNull(parsed.data.variant),
      market: emptyToNull(parsed.data.market),
      images: parsed.data.images,
      brief: parsed.data.brief ?? null,
      status: "draft",
    })
    .returning();

  await startProductAnalysis(product.id);
  revalidatePath("/dashboard/products");
  return { ok: true, id: product.id };
}

export async function updateProduct(
  productId: string,
  input: z.infer<typeof productSchema>,
): Promise<ActionResult> {
  const user = await requireAuth();
  const parsed = productSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" };

  const updated = await db
    .update(ugcProducts)
    .set({
      name: parsed.data.name,
      sourceUrl: emptyToNull(parsed.data.sourceUrl),
      variant: emptyToNull(parsed.data.variant),
      market: emptyToNull(parsed.data.market),
      images: parsed.data.images,
      brief: parsed.data.brief ?? null,
      updatedAt: new Date(),
    })
    .where(and(eq(ugcProducts.id, productId), eq(ugcProducts.userId, user.id)))
    .returning();

  if (updated.length === 0) return { ok: false, code: "not_found" };
  revalidatePath("/dashboard/products");
  return { ok: true, id: productId };
}

export async function startProductAnalysis(
  productId: string,
): Promise<ActionResult> {
  const user = await requireAuth();
  const [product] = await db
    .select()
    .from(ugcProducts)
    .where(and(eq(ugcProducts.id, productId), eq(ugcProducts.userId, user.id)));
  if (!product) return { ok: false, code: "not_found" };

  await createBackgroundTask({
    db,
    queue: serverJobQueue,
    definition: productIngestJob,
    scopeKey: productScopeKey(user.id, product.id),
    payload: { productId: product.id, userId: user.id },
    idempotencyKey: `${product.id}:${product.updatedAt.getTime()}`,
  });

  revalidatePath("/dashboard/products");
  return { ok: true, id: product.id };
}

export async function deleteProduct(productId: string): Promise<ActionResult> {
  const user = await requireAuth();
  await db
    .delete(ugcProducts)
    .where(and(eq(ugcProducts.id, productId), eq(ugcProducts.userId, user.id)));
  revalidatePath("/dashboard/products");
  return { ok: true };
}

const talentSchema = z.object({
  name: z.string().trim().min(1).max(120),
  source: z.enum(["uploaded", "generated"]),
  imageUrl: z.string().trim().max(2000).optional(),
  prompt: z.string().trim().max(1000).optional(),
  licenceNote: z.string().trim().max(1000).optional(),
  voicePreset: z.string().trim().max(120).optional(),
});

export async function createTalent(
  input: z.infer<typeof talentSchema>,
): Promise<ActionResult> {
  const user = await requireAuth();
  const parsed = talentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" };
  if (parsed.data.source === "uploaded" && !parsed.data.imageUrl) {
    return { ok: false, code: "talent_needs_image" };
  }
  if (parsed.data.source === "generated" && !parsed.data.prompt) {
    return { ok: false, code: "talent_needs_prompt" };
  }

  const [talent] = await db
    .insert(ugcTalents)
    .values({
      userId: user.id,
      name: parsed.data.name,
      source: parsed.data.source,
      imageUrl: emptyToNull(parsed.data.imageUrl),
      prompt: emptyToNull(parsed.data.prompt),
      licenceNote: emptyToNull(parsed.data.licenceNote),
      voicePreset: emptyToNull(parsed.data.voicePreset),
    })
    .returning();

  revalidatePath("/dashboard/talents");
  return { ok: true, id: talent.id };
}

export async function archiveTalent(talentId: string): Promise<ActionResult> {
  const user = await requireAuth();
  await db
    .update(ugcTalents)
    .set({ archived: true, updatedAt: new Date() })
    .where(and(eq(ugcTalents.id, talentId), eq(ugcTalents.userId, user.id)));
  revalidatePath("/dashboard/talents");
  return { ok: true };
}

const planSchema = z.object({
  name: z.string().trim().min(1).max(160),
  accountTag: z.string().trim().max(80).optional(),
  reviewScriptsFirst: z.boolean(),
  items: z
    .array(
      z.object({
        productId: z.uuid(),
        locale: z.string().trim().min(2).max(16),
        market: z.string().trim().min(2).max(16),
        template: z.enum(SCRIPT_TEMPLATES),
        talentIds: z.array(z.uuid()).max(8),
        scriptCount: z.number().int().min(1).max(10),
        clipsPerScript: z.number().int().min(1).max(10),
        scriptId: z.uuid().optional(),
        accountTag: z.string().trim().max(80).optional(),
      }),
    )
    .min(1)
    .max(50),
});

export async function createBatch(
  input: z.infer<typeof planSchema>,
): Promise<ActionResult> {
  const user = await requireAuth();
  const parsed = planSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" };
  // Refuse the batch here rather than letting every clip fail one by one.
  if (!isMediaProviderConfigured()) {
    return { ok: false, code: "media_provider_unconfigured" };
  }

  const config: BatchPlanConfig = {
    items: parsed.data.items,
    reviewScriptsFirst: parsed.data.reviewScriptsFirst,
  };
  const plan = summarizePlan(config);
  if (plan.clipCount > MAX_BATCH_CLIPS) {
    return { ok: false, code: "batch_too_large" };
  }

  const owned = await db
    .select({ id: ugcProducts.id })
    .from(ugcProducts)
    .where(
      and(
        eq(ugcProducts.userId, user.id),
        inArray(
          ugcProducts.id,
          parsed.data.items.map((item) => item.productId),
        ),
      ),
    );
  if (
    owned.length !== new Set(parsed.data.items.map((i) => i.productId)).size
  ) {
    return { ok: false, code: "not_found" };
  }

  const [batch] = await db
    .insert(ugcBatches)
    .values({
      userId: user.id,
      name: parsed.data.name,
      accountTag: emptyToNull(parsed.data.accountTag),
      config,
      plannedCount: plan.clipCount,
      estimatedCredits: plan.estimatedCredits,
      status: "running",
    })
    .returning();

  const { taskRun } = await createBackgroundTask({
    db,
    queue: serverJobQueue,
    definition: batchRunJob,
    scopeKey: batchScopeKey(user.id, batch.id),
    payload: { batchId: batch.id, userId: user.id, waits: 0 },
    idempotencyKey: batch.id,
  });

  await db
    .update(ugcBatches)
    .set({ taskRunId: taskRun.id })
    .where(eq(ugcBatches.id, batch.id));

  revalidatePath("/dashboard/batches");
  return { ok: true, id: batch.id };
}

/** Releases clips whose scripts the operator asked to review before rendering. */
export async function releaseBatchForRendering(
  batchId: string,
): Promise<ActionResult> {
  const user = await requireAuth();
  const [batch] = await db
    .select()
    .from(ugcBatches)
    .where(and(eq(ugcBatches.id, batchId), eq(ugcBatches.userId, user.id)));
  if (!batch) return { ok: false, code: "not_found" };

  const pending = await db
    .select()
    .from(ugcClips)
    .where(and(eq(ugcClips.batchId, batch.id), eq(ugcClips.status, "pending")));

  for (const [index, clip] of pending.entries()) {
    await enqueueClipRender(db, {
      userId: user.id,
      batchId: batch.id,
      clipId: clip.id,
      laneIndex: index,
      queue: serverJobQueue,
    });
  }

  revalidatePath(`/dashboard/batches/${batchId}`);
  return { ok: true, id: batchId };
}

export async function cancelBatch(batchId: string): Promise<ActionResult> {
  const user = await requireAuth();
  const [batch] = await db
    .select()
    .from(ugcBatches)
    .where(and(eq(ugcBatches.id, batchId), eq(ugcBatches.userId, user.id)));
  if (!batch) return { ok: false, code: "not_found" };

  const pending = await db
    .select()
    .from(ugcClips)
    .where(
      and(
        eq(ugcClips.batchId, batch.id),
        inArray(ugcClips.status, ["pending", "rendering", "scripting"]),
      ),
    );

  for (const clip of pending) {
    if (clip.taskRunId) await cancelTaskForUser(user.id, clip.taskRunId);
  }
  if (batch.taskRunId) await cancelTaskForUser(user.id, batch.taskRunId);

  await db
    .update(ugcClips)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(
      and(
        eq(ugcClips.batchId, batch.id),
        inArray(ugcClips.status, ["pending", "rendering", "scripting"]),
      ),
    );
  await db
    .update(ugcBatches)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(eq(ugcBatches.id, batch.id));

  revalidatePath(`/dashboard/batches/${batchId}`);
  return { ok: true, id: batchId };
}

async function cancelTaskForUser(
  userId: string,
  taskRunId: string,
): Promise<void> {
  const [task] = await db
    .select()
    .from(taskRuns)
    .where(eq(taskRuns.id, taskRunId));
  if (!task || !isOwnedScope(task.scopeKey, userId)) return;
  await cancelOwnedBackgroundTask({
    db,
    queue: serverJobQueue,
    taskRunId,
    scopeKey: task.scopeKey,
  });
}

/**
 * Retries a failed clip. The retry is a new attempt on the same plan, so it
 * consumes credits but never changes the number of clips the operator asked for.
 */
export async function retryClip(clipId: string): Promise<ActionResult> {
  const user = await requireAuth();
  const [clip] = await db
    .select()
    .from(ugcClips)
    .where(and(eq(ugcClips.id, clipId), eq(ugcClips.userId, user.id)));
  if (!clip) return { ok: false, code: "not_found" };
  if (clip.status !== "failed") return { ok: false, code: "clip_not_failed" };
  // A clip produced step by step is re-rendered from its work, which still
  // holds the storyboard the operator approved.
  if (!clip.batchId) return { ok: false, code: "clip_from_work" };

  await db
    .update(ugcClips)
    .set({ failureReason: null, updatedAt: new Date() })
    .where(eq(ugcClips.id, clip.id));

  await enqueueClipRender(db, {
    userId: user.id,
    batchId: clip.batchId,
    clipId: clip.id,
    laneIndex: clip.attempts,
    attempt: clip.attempts + 1,
    queue: serverJobQueue,
  });

  revalidatePath(`/dashboard/batches/${clip.batchId}`);
  return { ok: true, id: clip.id };
}

/**
 * Produces a new clip from the same script, keeping the original for
 * comparison. Regenerations are tracked apart from system retries.
 */
export async function regenerateClip(clipId: string): Promise<ActionResult> {
  const user = await requireAuth();
  const [source] = await db
    .select()
    .from(ugcClips)
    .where(and(eq(ugcClips.id, clipId), eq(ugcClips.userId, user.id)));
  if (!source) return { ok: false, code: "not_found" };
  if (!source.batchId) return { ok: false, code: "clip_from_work" };

  const [clip] = await db
    .insert(ugcClips)
    .values({
      userId: source.userId,
      batchId: source.batchId,
      productId: source.productId,
      scriptId: source.scriptId,
      talentId: source.talentId,
      reference: `${source.reference}-R${source.attempts + 1}`,
      locale: source.locale,
      market: source.market,
      accountTag: source.accountTag,
      template: source.template,
      status: "pending",
      publishCaption: source.publishCaption,
      similarityKey: source.similarityKey,
      regeneratedFrom: source.id,
    })
    .returning();

  await enqueueClipRender(db, {
    userId: user.id,
    batchId: source.batchId,
    clipId: clip.id,
    laneIndex: 0,
    queue: serverJobQueue,
  });

  revalidatePath("/dashboard/review");
  return { ok: true, id: clip.id };
}

export async function setClipReview(
  clipId: string,
  reviewStatus: "pending" | "selected" | "shortlisted" | "rejected",
  note?: string,
): Promise<ActionResult> {
  const user = await requireAuth();
  const updated = await db
    .update(ugcClips)
    .set({
      reviewStatus,
      reviewNote: note?.trim() ? note.trim() : null,
      updatedAt: new Date(),
    })
    .where(and(eq(ugcClips.id, clipId), eq(ugcClips.userId, user.id)))
    .returning();
  if (updated.length === 0) return { ok: false, code: "not_found" };
  revalidatePath("/dashboard/review");
  return { ok: true, id: clipId };
}

const exportSchema = z.object({
  name: z.string().trim().min(1).max(160),
  groupBy: z.enum(["product", "accountTag"]),
  clipIds: z.array(z.uuid()).min(1).max(300),
});

export async function createExport(
  input: z.infer<typeof exportSchema>,
  unassignedLabel: string,
): Promise<ActionResult> {
  const user = await requireAuth();
  const parsed = exportSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" };

  const rows = await db
    .select({
      clip: ugcClips,
      productName: ugcProducts.name,
      productVariant: ugcProducts.variant,
      disclosure: ugcScripts.disclosure,
    })
    .from(ugcClips)
    .innerJoin(ugcProducts, eq(ugcProducts.id, ugcClips.productId))
    .leftJoin(ugcScripts, eq(ugcScripts.id, ugcClips.scriptId))
    .where(
      and(
        eq(ugcClips.userId, user.id),
        inArray(ugcClips.id, parsed.data.clipIds),
      ),
    );

  if (rows.length === 0) return { ok: false, code: "not_found" };

  const manifest = buildExportManifest(
    rows.map((row) => ({
      reference: row.clip.reference,
      locale: row.clip.locale,
      market: row.clip.market,
      accountTag: row.clip.accountTag,
      publishCaption: row.clip.publishCaption,
      videoUrl: row.clip.videoUrl,
      coverUrl: row.clip.coverUrl,
      subtitleUrl: row.clip.subtitleUrl,
      disclosure: row.disclosure,
      product: {
        name: row.productName,
        variant: row.productVariant,
      },
    })),
    parsed.data.groupBy,
    unassignedLabel,
  );

  const [record] = await db
    .insert(ugcExports)
    .values({
      userId: user.id,
      name: parsed.data.name,
      groupBy: parsed.data.groupBy,
      clipCount: rows.length,
      manifest,
    })
    .returning();

  revalidatePath("/dashboard/exports");
  return { ok: true, id: record.id };
}

const scriptRevisionSchema = z.object({
  title: z.string().trim().min(1).max(200),
  hook: z.string().trim().min(1).max(500),
  voiceover: z.string().trim().min(1).max(2000),
  captions: z.array(z.string().trim().min(1).max(200)).min(1).max(12),
  publishCaption: z.string().trim().max(500).optional(),
  lock: z.boolean(),
});

/**
 * Edits never overwrite a script. A revision is stored as a new version that
 * points back at its source, so an exported clip can always be traced to the
 * exact wording it was made from.
 */
export async function saveScriptRevision(
  scriptId: string,
  input: z.infer<typeof scriptRevisionSchema>,
): Promise<ActionResult> {
  const user = await requireAuth();
  const parsed = scriptRevisionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" };

  const [source] = await db
    .select()
    .from(ugcScripts)
    .where(and(eq(ugcScripts.id, scriptId), eq(ugcScripts.userId, user.id)));
  if (!source) return { ok: false, code: "not_found" };

  const [revision] = await db
    .insert(ugcScripts)
    .values({
      userId: source.userId,
      productId: source.productId,
      template: source.template,
      locale: source.locale,
      market: source.market,
      title: parsed.data.title,
      hook: parsed.data.hook,
      beats: source.beats,
      voiceover: parsed.data.voiceover,
      captions: parsed.data.captions,
      publishCaption: parsed.data.publishCaption ?? source.publishCaption,
      disclosure: source.disclosure,
      status: parsed.data.lock ? "locked" : "ready",
      version: source.version + 1,
      parentId: source.parentId ?? source.id,
    })
    .returning();

  revalidatePath("/dashboard/scripts");
  return { ok: true, id: revision.id };
}
