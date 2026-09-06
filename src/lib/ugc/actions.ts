"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/database";
import {
  ugcClips,
  ugcExports,
  ugcProducts,
  ugcScripts,
  ugcTalents,
} from "@/database/ugc";
import { requireAuth } from "@/lib/auth/permissions";
import { productIngestJob } from "@/lib/jobs/ugc/product-ingest";
import { serverJobQueue } from "@/lib/jobs/server";
import { fileKeyFromUrl } from "@/lib/uploads/url";
import { createBackgroundTask } from "@/lib/tasks/service";
import { buildExportManifest } from "./manifest";
import { productScopeKey } from "./scope";
import type { ActionResult } from "./types";

const briefSchema = z.object({
  audience: z.string().trim().max(400).optional(),
  sellingPoints: z.array(z.string().trim().min(1).max(200)).max(10).optional(),
  tone: z.string().trim().max(200).optional(),
  scenes: z.string().trim().max(400).optional(),
  bannedPhrases: z.array(z.string().trim().min(1).max(120)).max(20).optional(),
  providedScript: z.string().trim().max(30_000).optional(),
});

const imageReferenceSchema = z
  .string()
  .trim()
  .min(1)
  .max(2000)
  .refine((value) => {
    if (fileKeyFromUrl(value)) return true;
    try {
      return new URL(value).protocol === "https:";
    } catch {
      return false;
    }
  });

const productSchema = z.object({
  name: z.string().trim().min(1).max(200),
  sourceUrl: z.string().trim().url().max(2000).optional().or(z.literal("")),
  variant: z.string().trim().max(200).optional(),
  market: z.string().trim().max(16).optional(),
  images: z.array(imageReferenceSchema).max(8),
  brief: briefSchema.optional(),
});

function emptyToNull(value: string | undefined): string | null {
  return value && value.length > 0 ? value : null;
}

async function enqueueProductAnalysis(
  product: typeof ugcProducts.$inferSelect,
  feedback?: string,
): Promise<void> {
  await createBackgroundTask({
    db,
    queue: serverJobQueue,
    definition: productIngestJob,
    scopeKey: productScopeKey(product.userId, product.id),
    payload: { productId: product.id, userId: product.userId, feedback },
    idempotencyKey: `${product.id}:analysis:${crypto.randomUUID()}`,
  });

  await db
    .update(ugcProducts)
    .set({ status: "analyzing", issue: null })
    .where(eq(ugcProducts.id, product.id));
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

  await enqueueProductAnalysis(product);
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
  revalidatePath(`/dashboard/products/${productId}`);
  return { ok: true, id: productId };
}

const productAnalysisRevisionSchema = z.object({
  feedback: z.string().trim().max(6000).optional(),
  images: z.array(imageReferenceSchema).max(8),
});

/** Adds operator context and material, then revises the prior analysis in place. */
export async function reviseProductAnalysis(
  productId: string,
  input: z.infer<typeof productAnalysisRevisionSchema>,
): Promise<ActionResult> {
  const user = await requireAuth();
  const parsed = productAnalysisRevisionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" };

  const [product] = await db
    .select()
    .from(ugcProducts)
    .where(and(eq(ugcProducts.id, productId), eq(ugcProducts.userId, user.id)));
  if (!product) return { ok: false, code: "not_found" };

  const images = [...new Set([...product.images, ...parsed.data.images])];
  if (images.length > 8) return { ok: false, code: "invalid_input" };

  const [updated] = await db
    .update(ugcProducts)
    .set({ images, updatedAt: new Date() })
    .where(eq(ugcProducts.id, product.id))
    .returning();
  await enqueueProductAnalysis(updated, parsed.data.feedback || undefined);

  revalidatePath("/dashboard/products");
  revalidatePath(`/dashboard/products/${product.id}`);
  return { ok: true, id: product.id };
}

const factsSchema = z.object({
  summary: z.string().trim().min(1).max(1000),
  appearance: z.string().trim().min(1).max(1000),
  specs: z.array(z.string().trim().min(1).max(200)).max(12),
  sellingPoints: z.array(z.string().trim().min(1).max(200)).min(1).max(8),
  scenarios: z.array(z.string().trim().min(1).max(200)).max(6),
});

/**
 * Accepts what the reader understood, with the operator's corrections. A
 * person who has checked the facts is a better authority than the extraction,
 * so saving them also clears the product for production.
 */
export async function saveProductFacts(
  productId: string,
  input: z.infer<typeof factsSchema>,
): Promise<ActionResult> {
  const user = await requireAuth();
  const parsed = factsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" };

  const [product] = await db
    .select({ facts: ugcProducts.facts })
    .from(ugcProducts)
    .where(and(eq(ugcProducts.id, productId), eq(ugcProducts.userId, user.id)));
  if (!product) return { ok: false, code: "not_found" };

  await db
    .update(ugcProducts)
    .set({
      facts: {
        ...parsed.data,
        // Provenance is the reader's, not the editor's: keep what it recorded.
        sources: product.facts?.sources ?? [],
      },
      status: "ready",
      issue: null,
      updatedAt: new Date(),
    })
    .where(eq(ugcProducts.id, productId));

  revalidatePath(`/dashboard/products/${productId}`);
  revalidatePath("/dashboard/products");
  return { ok: true, id: productId };
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
  imageUrl: imageReferenceSchema.optional(),
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
  clipIds: z.array(z.uuid()).min(1).max(300),
});

export async function createExport(
  input: z.infer<typeof exportSchema>,
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
  );

  const [record] = await db
    .insert(ugcExports)
    .values({
      userId: user.id,
      name: parsed.data.name,
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
      productionPrompt: source.productionPrompt,
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
