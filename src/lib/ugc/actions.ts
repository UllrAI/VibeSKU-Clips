"use server";

import { revalidatePath } from "next/cache";
import { isDeepStrictEqual } from "node:util";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/database";
import { ugcProducts, ugcScenes, ugcTalents } from "@/database/ugc";
import { requireAuth } from "@/lib/auth/permissions";
import { productIngestJob } from "@/lib/jobs/ugc/product-ingest";
import { sceneGenerateJob } from "@/lib/jobs/ugc/scene-generate";
import { talentGenerateJob } from "@/lib/jobs/ugc/talent-generate";
import { serverJobQueue } from "@/lib/jobs/server";
import { createBackgroundTask } from "@/lib/tasks/service";
import {
  canCreateProduct,
  imageReferenceSchema,
  productInputSchema,
  type ProductInput,
} from "./product-input";
import { productNameFromUrl } from "./product-name";
import { productScopeKey, sceneScopeKey, talentScopeKey } from "./scope";
import type { ActionResult } from "./types";

function emptyToNull(value: string | undefined): string | null {
  return value && value.length > 0 ? value : null;
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
    .set({
      status:
        product.status === "ready" && product.facts ? "ready" : "analyzing",
      issue: null,
    })
    .where(eq(ugcProducts.id, product.id));
}

export async function createProduct(
  input: ProductInput,
): Promise<ActionResult> {
  const user = await requireAuth();
  const parsed = productInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" };
  if (!canCreateProduct(parsed.data)) {
    return { ok: false, code: "product_needs_link_or_image" };
  }

  const sourceUrl = emptyToNull(parsed.data.sourceUrl);
  const name =
    parsed.data.name || productNameFromUrl(sourceUrl ?? "", "Imported product");

  const [product] = await db
    .insert(ugcProducts)
    .values({
      userId: user.id,
      name,
      sourceUrl,
      info: parsed.data.info,
      images: parsed.data.images,
      status: "draft",
    })
    .returning();

  await enqueueProductAnalysis(product, {
    mode: sourceUrl ? "import" : "analyze",
  });
  revalidatePath("/dashboard/products");
  return { ok: true, id: product.id };
}

export async function updateProduct(
  productId: string,
  input: ProductInput,
): Promise<ActionResult> {
  const user = await requireAuth();
  const parsed = productInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" };
  if (!parsed.data.name) return { ok: false, code: "invalid_input" };
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
    info: parsed.data.info,
    images: parsed.data.images,
  };
  const currentMaterial = {
    name: product.name,
    sourceUrl: product.sourceUrl,
    info: product.info,
    images: product.images,
  };
  const materialChanged = !isDeepStrictEqual(currentMaterial, nextMaterial);

  const [updated] = await db
    .update(ugcProducts)
    .set({
      ...nextMaterial,
      issue: materialChanged ? null : product.issue,
      updatedAt: new Date(),
    })
    .where(and(eq(ugcProducts.id, productId), eq(ugcProducts.userId, user.id)))
    .returning();

  if (!updated) return { ok: false, code: "not_found" };
  if (materialChanged) {
    await enqueueProductAnalysis(updated, {
      mode:
        updated.sourceUrl && updated.sourceUrl !== product.sourceUrl
          ? "import"
          : "analyze",
    });
  }
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
  overview: z.string().trim().min(1).max(2000),
  highlights: z.array(z.string().trim().min(1).max(300)).max(10),
});

/**
 * Saves an operator correction to the facts that are already usable.
 */
export async function saveProductFacts(
  productId: string,
  input: z.infer<typeof factsSchema>,
): Promise<ActionResult> {
  const user = await requireAuth();
  const parsed = factsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" };

  const [product] = await db
    .select({ facts: ugcProducts.facts, images: ugcProducts.images })
    .from(ugcProducts)
    .where(and(eq(ugcProducts.id, productId), eq(ugcProducts.userId, user.id)));
  if (!product) return { ok: false, code: "not_found" };

  await db
    .update(ugcProducts)
    .set({
      facts: {
        ...parsed.data,
        // Provenance and image selection are the reader's, not the editor's:
        // keep what it recorded.
        sources: product.facts?.sources ?? ["operator"],
        keyImages: product.facts?.keyImages,
        warnings: product.facts?.warnings,
      },
      status: product.images.length > 0 ? "ready" : "needs_input",
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
    // The sheet is left in place until the new one lands, so a talent already
    // chosen for a work keeps working while it is redrawn.
    .set({ status: "generating", prompt: null, updatedAt: new Date() })
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

const sceneSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(6000),
  referenceImages: z.array(imageReferenceSchema).max(3),
});

async function enqueueSceneGeneration(
  scene: typeof ugcScenes.$inferSelect,
): Promise<void> {
  await createBackgroundTask({
    db,
    queue: serverJobQueue,
    definition: sceneGenerateJob,
    scopeKey: sceneScopeKey(scene.userId, scene.id),
    payload: { sceneId: scene.id, userId: scene.userId, polls: 0 },
    idempotencyKey: `${scene.id}:views:${crypto.randomUUID()}`,
  });
}

export async function createScene(
  input: z.infer<typeof sceneSchema>,
): Promise<ActionResult> {
  const user = await requireAuth();
  const parsed = sceneSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" };

  const [scene] = await db
    .insert(ugcScenes)
    .values({
      userId: user.id,
      name: parsed.data.name,
      description: parsed.data.description,
      referenceImages: parsed.data.referenceImages,
      status: "generating",
    })
    .returning();

  await enqueueSceneGeneration(scene);
  revalidatePath("/dashboard/scenes");
  return { ok: true, id: scene.id };
}

export async function retrySceneGeneration(
  sceneId: string,
): Promise<ActionResult> {
  const user = await requireAuth();
  const [scene] = await db
    .update(ugcScenes)
    // The sheet is left in place until the new one lands, so a scene already
    // chosen for a work keeps working while it is redrawn.
    .set({ status: "generating", prompt: null, updatedAt: new Date() })
    .where(and(eq(ugcScenes.id, sceneId), eq(ugcScenes.userId, user.id)))
    .returning();
  if (!scene) return { ok: false, code: "not_found" };

  await enqueueSceneGeneration(scene);
  revalidatePath("/dashboard/scenes");
  return { ok: true, id: scene.id };
}

export async function archiveScene(sceneId: string): Promise<ActionResult> {
  const user = await requireAuth();
  await db
    .update(ugcScenes)
    .set({ archived: true, updatedAt: new Date() })
    .where(and(eq(ugcScenes.id, sceneId), eq(ugcScenes.userId, user.id)));
  revalidatePath("/dashboard/scenes");
  return { ok: true };
}
