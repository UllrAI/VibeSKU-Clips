"use server";

import { revalidatePath } from "next/cache";
import { isDeepStrictEqual } from "node:util";
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
import { productNameFromUrl } from "./product-name";
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

function normalizeBrief(
  brief: z.infer<typeof briefSchema> | undefined,
): z.infer<typeof briefSchema> | null {
  if (!brief) return null;
  const normalized: z.infer<typeof briefSchema> = {};
  if (brief.audience) normalized.audience = brief.audience;
  if (brief.sellingPoints?.length) {
    normalized.sellingPoints = brief.sellingPoints;
  }
  if (brief.tone) normalized.tone = brief.tone;
  if (brief.scenes) normalized.scenes = brief.scenes;
  if (brief.bannedPhrases?.length) {
    normalized.bannedPhrases = brief.bannedPhrases;
  }
  if (brief.providedScript) normalized.providedScript = brief.providedScript;
  return Object.keys(normalized).length > 0 ? normalized : null;
}

async function enqueueProductAnalysis(
  product: typeof ugcProducts.$inferSelect,
  options: { feedback?: string; mode?: "analyze" | "import" } = {},
): Promise<void> {
  await createBackgroundTask({
    db,
    queue: serverJobQueue,
    definition: productIngestJob,
    scopeKey: productScopeKey(product.userId, product.id),
    payload: {
      productId: product.id,
      userId: product.userId,
      feedback: options.feedback,
      importMaterial: options.mode === "import" || undefined,
    },
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
      brief: normalizeBrief(parsed.data.brief),
      status: "draft",
    })
    .returning();

  await enqueueProductAnalysis(product);
  revalidatePath("/dashboard/products");
  return { ok: true, id: product.id };
}

const productUrlImportSchema = z.object({
  sourceUrl: z
    .url()
    .max(2000)
    .refine((value) => new URL(value).protocol === "https:"),
  market: z.string().trim().max(16).optional(),
  brief: briefSchema.optional(),
});

/** Creates a provisional record immediately; the Worker replaces its URL slug
 * with Firecrawl's product title and imports product-specific images. */
export async function createProductFromUrl(
  input: z.infer<typeof productUrlImportSchema>,
): Promise<ActionResult> {
  const user = await requireAuth();
  const parsed = productUrlImportSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" };

  const [product] = await db
    .insert(ugcProducts)
    .values({
      userId: user.id,
      name: productNameFromUrl(parsed.data.sourceUrl, "Imported product"),
      sourceUrl: parsed.data.sourceUrl,
      market: emptyToNull(parsed.data.market),
      images: [],
      brief: normalizeBrief(parsed.data.brief),
      status: "draft",
    })
    .returning();

  await enqueueProductAnalysis(product, { mode: "import" });
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
  if (!parsed.data.sourceUrl && parsed.data.images.length === 0) {
    return { ok: false, code: "product_needs_link_or_image" };
  }

  const [product] = await db
    .select()
    .from(ugcProducts)
    .where(and(eq(ugcProducts.id, productId), eq(ugcProducts.userId, user.id)));
  if (!product) return { ok: false, code: "not_found" };

  const nextMaterial = {
    name: parsed.data.name,
    sourceUrl: emptyToNull(parsed.data.sourceUrl),
    variant: emptyToNull(parsed.data.variant),
    market: emptyToNull(parsed.data.market),
    images: parsed.data.images,
    brief: normalizeBrief(parsed.data.brief),
  };
  const currentMaterial = {
    name: product.name,
    sourceUrl: product.sourceUrl,
    variant: product.variant,
    market: product.market,
    images: product.images,
    brief: normalizeBrief(product.brief ?? undefined),
  };
  const materialChanged = !isDeepStrictEqual(currentMaterial, nextMaterial);
  const factsNeedReview =
    materialChanged && Boolean(product.facts) && product.status !== "analyzing";

  const updated = await db
    .update(ugcProducts)
    .set({
      ...nextMaterial,
      // Existing facts no longer count as approved once their source material
      // changes. The operator can review them as-is or explicitly reanalyse.
      status: factsNeedReview ? "review" : product.status,
      issue: factsNeedReview ? null : product.issue,
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
});

/** Rebuilds facts from the material that is already saved on the product. */
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
  if (product.status === "analyzing") {
    return { ok: false, code: "product_busy" };
  }

  await enqueueProductAnalysis(product, {
    feedback: parsed.data.feedback || undefined,
  });

  revalidatePath("/dashboard/products");
  revalidatePath(`/dashboard/products/${product.id}`);
  return { ok: true, id: product.id };
}

/** Refreshes page-derived material, then rebuilds facts from the result. */
export async function reimportProductMaterial(
  productId: string,
): Promise<ActionResult> {
  const user = await requireAuth();
  const [product] = await db
    .select()
    .from(ugcProducts)
    .where(and(eq(ugcProducts.id, productId), eq(ugcProducts.userId, user.id)));
  if (!product) return { ok: false, code: "not_found" };
  if (!product.sourceUrl) {
    return { ok: false, code: "product_needs_source_url" };
  }
  if (product.status === "analyzing") {
    return { ok: false, code: "product_busy" };
  }

  await enqueueProductAnalysis(product, { mode: "import" });
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
