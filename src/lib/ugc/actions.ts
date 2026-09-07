"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/database";
import { ugcProducts, ugcTalents } from "@/database/ugc";
import { requireAuth } from "@/lib/auth/permissions";
import { productIngestJob } from "@/lib/jobs/ugc/product-ingest";
import { talentGenerateJob } from "@/lib/jobs/ugc/talent-generate";
import { serverJobQueue } from "@/lib/jobs/server";
import { fileKeyFromUrl } from "@/lib/uploads/url";
import { createBackgroundTask } from "@/lib/tasks/service";
import { productScopeKey, talentScopeKey } from "./scope";
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
  description: z.string().trim().min(1).max(6000),
  referenceImages: z.array(imageReferenceSchema).max(1),
});

async function enqueueTalentGeneration(
  talent: typeof ugcTalents.$inferSelect,
): Promise<void> {
  await createBackgroundTask({
    db,
    queue: serverJobQueue,
    definition: talentGenerateJob,
    scopeKey: talentScopeKey(talent.userId, talent.id),
    payload: { talentId: talent.id, userId: talent.userId, polls: 0 },
    idempotencyKey: `${talent.id}:image:${crypto.randomUUID()}`,
  });
}

export async function createTalent(
  input: z.infer<typeof talentSchema>,
): Promise<ActionResult> {
  const user = await requireAuth();
  const parsed = talentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" };

  const [talent] = await db
    .insert(ugcTalents)
    .values({
      userId: user.id,
      name: parsed.data.name,
      description: parsed.data.description,
      referenceImages: parsed.data.referenceImages,
      status: "generating",
    })
    .returning();

  await enqueueTalentGeneration(talent);
  revalidatePath("/dashboard/talents");
  return { ok: true, id: talent.id };
}

export async function retryTalentGeneration(
  talentId: string,
): Promise<ActionResult> {
  const user = await requireAuth();
  const [talent] = await db
    .update(ugcTalents)
    .set({ status: "generating", updatedAt: new Date() })
    .where(and(eq(ugcTalents.id, talentId), eq(ugcTalents.userId, user.id)))
    .returning();
  if (!talent) return { ok: false, code: "not_found" };

  await enqueueTalentGeneration(talent);
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
