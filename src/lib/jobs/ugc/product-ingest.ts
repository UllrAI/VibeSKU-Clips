import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { ugcProducts } from "@/database/ugc";
import { analyzeProduct } from "@/lib/ugc/authoring";
import { CREDIT_COST } from "@/lib/ugc/constants";
import {
  FirecrawlError,
  importProductSource,
  type ImportedProductSource,
} from "@/lib/ugc/firecrawl";
import { productNameFromUrl } from "@/lib/ugc/product-name";
import { recordUsage } from "@/lib/ugc/usage";
import { UnreadableSourceError } from "@/lib/ugc/source-fetch";
import {
  ReferenceMediaUnavailableError,
  resolveReferenceUrls,
  StorageUnavailableError,
} from "@/lib/ugc/storage";
import {
  defineJob,
  type JobHandlerContext,
  PermanentJobError,
  RetryableJobError,
} from "../definition";

const RETRY_LIMIT = 2;

type Product = typeof ugcProducts.$inferSelect;

function stillHasProvisionalMaterial(product: Product): boolean {
  if (!product.sourceUrl) return false;
  return (
    product.name ===
      productNameFromUrl(product.sourceUrl, "Imported product") &&
    !product.variant &&
    product.images.length === 0
  );
}

async function stopProduct(
  context: JobHandlerContext,
  productId: string,
  status: "needs_input" | "failed",
  issue: string,
): Promise<void> {
  await context.db
    .update(ugcProducts)
    .set({ status, issue, updatedAt: new Date() })
    .where(eq(ugcProducts.id, productId));
  context.log("product_ingest_stopped", { productId, status, issue });
}

/**
 * An import should not overwrite edits made while Firecrawl was running. The
 * status transition gives us an optimistic-lock timestamp; if it changed, the
 * latest operator material wins and only the extracted facts land later.
 */
async function applyImportedMaterial(
  context: JobHandlerContext,
  product: Product,
  imported: ImportedProductSource,
): Promise<Product> {
  const [updated] = await context.db
    .update(ugcProducts)
    .set({
      name: imported.name ?? product.name,
      variant: imported.variant ?? product.variant,
      images: imported.images,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(ugcProducts.id, product.id),
        eq(ugcProducts.userId, product.userId),
        eq(ugcProducts.updatedAt, product.updatedAt),
      ),
    )
    .returning();
  if (updated) return updated;

  const [current] = await context.db
    .select()
    .from(ugcProducts)
    .where(
      and(
        eq(ugcProducts.id, product.id),
        eq(ugcProducts.userId, product.userId),
      ),
    );
  return current ?? product;
}

export const productIngestJob = defineJob(
  "ugc.product.ingest",
  z
    .object({
      productId: z.uuid(),
      userId: z.string().min(1),
      feedback: z.string().trim().max(6000).optional(),
      importMaterial: z.boolean().optional(),
    })
    .strict(),
  async (payload, context) => {
    const [product] = await context.db
      .select()
      .from(ugcProducts)
      .where(
        and(
          eq(ugcProducts.id, payload.productId),
          eq(ugcProducts.userId, payload.userId),
        ),
      );
    if (!product) {
      throw new PermanentJobError(
        "UGC_PRODUCT_MISSING",
        "The product was removed before it could be analysed.",
      );
    }
    if (await context.isCancelled()) return null;

    const [analyzingProduct] = await context.db
      .update(ugcProducts)
      .set({ status: "analyzing", issue: null, updatedAt: new Date() })
      .where(eq(ugcProducts.id, product.id))
      .returning();
    let materialProduct = analyzingProduct ?? product;
    await context.updateProgress({ step: "reading_source" });
    context.log("product_ingest_started", {
      productId: product.id,
      hasSourceUrl: Boolean(product.sourceUrl),
      images: product.images.length,
    });

    try {
      let sourceText: string | undefined;
      if (materialProduct.sourceUrl) {
        try {
          const imported = await importProductSource(
            materialProduct.sourceUrl,
            { signal: context.signal },
          );
          sourceText = imported.text;
          if (
            payload.importMaterial &&
            stillHasProvisionalMaterial(materialProduct)
          ) {
            materialProduct = await applyImportedMaterial(
              context,
              materialProduct,
              imported,
            );
          }
        } catch (error) {
          if (
            !(
              error instanceof UnreadableSourceError ||
              error instanceof FirecrawlError
            ) ||
            materialProduct.images.length === 0
          ) {
            throw error;
          }
          context.log("product_source_unreadable", {
            productId: product.id,
            reason: error.message,
            usingImages: true,
          });
        }
      }

      const imageUrls = await resolveReferenceUrls(
        context.db,
        materialProduct.userId,
        materialProduct.images,
      );

      await context.updateProgress({ step: "extracting_facts" });
      const facts = await analyzeProduct({
        name: materialProduct.name,
        variant: materialProduct.variant,
        sourceText,
        imageUrls,
        brief: materialProduct.brief,
        market: materialProduct.market,
        previousFacts: materialProduct.facts,
        feedback: payload.feedback,
      });

      const missing = facts.missing ?? [];
      const nextStatus = missing.length > 0 ? "needs_input" : "review";
      await context.db
        .update(ugcProducts)
        .set({
          facts,
          status: nextStatus,
          issue: missing.length > 0 ? missing.join("; ") : null,
          updatedAt: new Date(),
        })
        .where(eq(ugcProducts.id, product.id));

      await recordUsage(context.db, {
        userId: product.userId,
        kind: "analysis",
        credits: CREDIT_COST.analysis,
        note: materialProduct.name,
      });

      context.log("product_ingest_finished", {
        productId: product.id,
        status: nextStatus,
        imagesRead: imageUrls.length,
        missing,
      });
      return { status: nextStatus };
    } catch (error) {
      if (error instanceof UnreadableSourceError) {
        // An unreadable link pauses this product only. The operator can add
        // images or a brief and run it again from the product step.
        await stopProduct(context, product.id, "needs_input", error.message);
        return { status: "needs_input", reason: error.message };
      }
      if (error instanceof FirecrawlError) {
        if (!error.retryable) {
          await stopProduct(
            context,
            product.id,
            "failed",
            "The product page import service could not read this link.",
          );
          throw new PermanentJobError(error.code, error.message);
        }
        if (context.attempt > RETRY_LIMIT) {
          await stopProduct(
            context,
            product.id,
            "failed",
            "The product page import service was unavailable after retrying.",
          );
        }
        throw new RetryableJobError(error.code, error.message);
      }
      if (error instanceof ReferenceMediaUnavailableError) {
        await stopProduct(context, product.id, "needs_input", error.message);
        return { status: "needs_input", reason: error.message };
      }
      if (error instanceof StorageUnavailableError) {
        await stopProduct(
          context,
          product.id,
          "failed",
          "Product images could not be read because storage is unavailable.",
        );
        throw new PermanentJobError("UGC_STORAGE_UNAVAILABLE", error.message);
      }
      if (context.attempt > RETRY_LIMIT) {
        await stopProduct(
          context,
          product.id,
          "failed",
          "Product analysis failed after retrying.",
        );
      }
      throw error;
    }
  },
  {
    queue: {
      retryLimit: RETRY_LIMIT,
      retryDelay: 10,
      retryBackoff: true,
      expireInSeconds: 10 * 60,
    },
    localConcurrency: 4,
    groupConcurrency: 1,
  },
);
