import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { ugcProducts } from "@/database/ugc";
import { analyzeProduct } from "@/lib/ugc/authoring";
import { CREDIT_COST } from "@/lib/ugc/constants";
import { recordUsage } from "@/lib/ugc/usage";
import {
  fetchProductSource,
  UnreadableSourceError,
} from "@/lib/ugc/source-fetch";
import {
  ReferenceMediaUnavailableError,
  resolveReferenceUrls,
  StorageUnavailableError,
} from "@/lib/ugc/storage";
import {
  defineJob,
  type JobHandlerContext,
  PermanentJobError,
} from "../definition";

const RETRY_LIMIT = 2;

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

export const productIngestJob = defineJob(
  "ugc.product.ingest",
  z.object({ productId: z.uuid(), userId: z.string().min(1) }).strict(),
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

    await context.db
      .update(ugcProducts)
      .set({ status: "analyzing", issue: null, updatedAt: new Date() })
      .where(eq(ugcProducts.id, product.id));
    await context.updateProgress({ step: "reading_source" });
    context.log("product_ingest_started", {
      productId: product.id,
      hasSourceUrl: Boolean(product.sourceUrl),
      images: product.images.length,
    });

    try {
      let sourceText: string | undefined;
      if (product.sourceUrl) {
        try {
          sourceText = await fetchProductSource(product.sourceUrl);
        } catch (error) {
          if (
            !(error instanceof UnreadableSourceError) ||
            product.images.length === 0
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
        product.userId,
        product.images,
      );

      await context.updateProgress({ step: "extracting_facts" });
      const facts = await analyzeProduct({
        name: product.name,
        sourceText,
        imageUrls,
        brief: product.brief,
        market: product.market,
      });

      const missing = facts.missing ?? [];
      await context.db
        .update(ugcProducts)
        .set({
          facts,
          status: missing.length > 0 ? "needs_input" : "ready",
          issue: missing.length > 0 ? missing.join("; ") : null,
          updatedAt: new Date(),
        })
        .where(eq(ugcProducts.id, product.id));

      await recordUsage(context.db, {
        userId: product.userId,
        kind: "analysis",
        credits: CREDIT_COST.analysis,
        note: product.name,
      });

      context.log("product_ingest_finished", {
        productId: product.id,
        status: missing.length > 0 ? "needs_input" : "ready",
        missing,
      });
      return { status: missing.length > 0 ? "needs_input" : "ready" };
    } catch (error) {
      if (error instanceof UnreadableSourceError) {
        // An unreadable link pauses this product only. The operator can add
        // images or a brief and run it again from the product step.
        await stopProduct(context, product.id, "needs_input", error.message);
        return { status: "needs_input", reason: error.message };
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
