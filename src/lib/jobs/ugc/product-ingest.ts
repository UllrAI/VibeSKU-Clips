import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { ugcProducts } from "@/database/ugc";
import { analyzeProduct } from "@/lib/ugc/authoring";
import { CREDIT_COST, MAX_PRODUCT_IMAGES } from "@/lib/ugc/constants";
import {
  FirecrawlError,
  importProductSource,
  firecrawlLog,
  type ImportedProductSource,
} from "@/lib/ugc/firecrawl";
import { authoringModelLog } from "@/lib/ugc/model";
import { productNameFromUrl } from "@/lib/ugc/product-name";
import { recordUsage } from "@/lib/ugc/usage";
import { startWorksWaitingForProduct } from "@/lib/ugc/work-script-queue";
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
    !product.info &&
    product.images.length === 0
  );
}

function mergeImportedImages(existing: string[], imported: string[]): string[] {
  const images = new Map<string, string>();
  for (const image of [...existing, ...imported]) {
    let key = image;
    try {
      const url = new URL(image);
      key = `${url.origin}${url.pathname}`.toLowerCase();
    } catch {
      // Existing references can be private application URLs rather than HTTPS.
    }
    if (!images.has(key)) images.set(key, image);
  }
  return [...images.values()].slice(0, MAX_PRODUCT_IMAGES);
}

async function stopProduct(
  context: JobHandlerContext,
  product: Product,
  status: "needs_input" | "failed",
  issue: string,
): Promise<void> {
  const keepsExistingFacts = product.status === "ready" && product.facts;
  const nextStatus = keepsExistingFacts ? "ready" : status;
  await context.db
    .update(ugcProducts)
    .set({
      status: nextStatus,
      issue: keepsExistingFacts ? null : issue,
      updatedAt: new Date(),
    })
    .where(eq(ugcProducts.id, product.id));
  context.log("product_ingest_stopped", {
    productId: product.id,
    status: nextStatus,
    issue,
  });
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
  const provisional = stillHasProvisionalMaterial(product);
  const images = mergeImportedImages(product.images, imported.images);
  const [updated] = await context.db
    .update(ugcProducts)
    .set({
      name: provisional ? (imported.name ?? product.name) : product.name,
      images,
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
      .set({
        status:
          product.status === "ready" && product.facts ? "ready" : "analyzing",
        issue: null,
        updatedAt: new Date(),
      })
      .where(eq(ugcProducts.id, product.id))
      .returning();
    let materialProduct = analyzingProduct ?? product;
    await context.updateProgress({ step: "reading_source" });
    const startedAt = Date.now();
    context.log("product_ingest_started", {
      productId: product.id,
      hasSourceUrl: Boolean(product.sourceUrl),
      images: product.images.length,
      ...authoringModelLog(),
    });

    try {
      let sourceText: string | undefined;
      if (materialProduct.sourceUrl) {
        const importStartedAt = Date.now();
        try {
          const imported = await importProductSource(
            materialProduct.sourceUrl,
            { signal: context.signal },
          );
          sourceText = imported.text;
          // Reading the page and extracting the facts are two suppliers and
          // two waits. Without a line between them, a slow read and a slow
          // model are the same silence.
          context.log("product_source_imported", {
            productId: product.id,
            ...firecrawlLog(),
            characters: imported.text.length,
            images: imported.images.length,
            named: Boolean(imported.name),
            elapsedMs: Date.now() - importStartedAt,
          });
          if (payload.importMaterial) {
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
            ...firecrawlLog(),
            reason: error.message,
            usingImages: true,
            elapsedMs: Date.now() - importStartedAt,
          });
        }
      }

      const imageUrls = await resolveReferenceUrls(
        context.db,
        materialProduct.userId,
        materialProduct.images,
      );

      await context.updateProgress({ step: "extracting_facts" });
      context.log("product_facts_started", {
        productId: product.id,
        ...authoringModelLog(),
        sourceCharacters: sourceText?.length ?? 0,
        imagesRead: imageUrls.length,
      });
      const facts = await analyzeProduct({
        name: materialProduct.name,
        info: materialProduct.info,
        sourceText,
        imageUrls,
        previousFacts: materialProduct.facts,
        feedback: payload.feedback,
      });

      const hasProductImage = materialProduct.images.length > 0;
      const nextStatus = hasProductImage ? "ready" : "needs_input";
      const [savedProduct] = await context.db
        .update(ugcProducts)
        .set({
          facts,
          info:
            materialProduct.info ||
            [facts.overview, ...facts.highlights].join("\n"),
          status: nextStatus,
          issue: null,
          updatedAt: new Date(),
        })
        .where(eq(ugcProducts.id, product.id))
        .returning();
      materialProduct = savedProduct ?? materialProduct;

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
        warnings: facts.warnings ?? [],
        ...authoringModelLog(),
        elapsedMs: Date.now() - startedAt,
      });
      if (nextStatus === "ready") {
        await startWorksWaitingForProduct(
          context.db,
          product.id,
          product.userId,
        );
      }
      return { status: nextStatus };
    } catch (error) {
      if (error instanceof UnreadableSourceError) {
        // An unreadable link pauses this product only. The operator can add
        // images or product information and run it again.
        await stopProduct(
          context,
          materialProduct,
          "needs_input",
          error.message,
        );
        return {
          status:
            materialProduct.status === "ready" && materialProduct.facts
              ? "ready"
              : "needs_input",
          reason: error.message,
        };
      }
      if (error instanceof FirecrawlError) {
        // Analysis may read the reference page for evidence, but it must stay
        // a retry of analysis. Only an explicit import may refresh material.
        const failureCode = payload.importMaterial
          ? error.code
          : "UGC_PRODUCT_SOURCE_READ_FAILED";
        if (!error.retryable) {
          await stopProduct(
            context,
            materialProduct,
            "failed",
            "The product page import service could not read this link.",
          );
          throw new PermanentJobError(failureCode, error.message);
        }
        if (context.attempt > RETRY_LIMIT) {
          await stopProduct(
            context,
            materialProduct,
            "failed",
            "The product page import service was unavailable after retrying.",
          );
        }
        throw new RetryableJobError(failureCode, error.message);
      }
      if (error instanceof ReferenceMediaUnavailableError) {
        await stopProduct(
          context,
          materialProduct,
          "needs_input",
          error.message,
        );
        return {
          status:
            materialProduct.status === "ready" && materialProduct.facts
              ? "ready"
              : "needs_input",
          reason: error.message,
        };
      }
      if (error instanceof StorageUnavailableError) {
        await stopProduct(
          context,
          materialProduct,
          "failed",
          "Product images could not be read because storage is unavailable.",
        );
        throw new PermanentJobError("UGC_STORAGE_UNAVAILABLE", error.message);
      }
      if (context.attempt > RETRY_LIMIT) {
        await stopProduct(
          context,
          materialProduct,
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
