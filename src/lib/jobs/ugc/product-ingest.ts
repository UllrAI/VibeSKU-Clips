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
import { defineJob, PermanentJobError } from "../definition";

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

    let sourceText: string | undefined;
    if (product.sourceUrl) {
      try {
        sourceText = await fetchProductSource(product.sourceUrl);
      } catch (error) {
        // An unreadable link pauses this product only. The operator can add
        // images or a brief and run it again without touching the batch.
        if (error instanceof UnreadableSourceError) {
          if (product.images.length === 0) {
            await context.db
              .update(ugcProducts)
              .set({
                status: "needs_input",
                issue: error.message,
                updatedAt: new Date(),
              })
              .where(eq(ugcProducts.id, product.id));
            context.log("product_source_unreadable", {
              productId: product.id,
              reason: error.message,
            });
            return { status: "needs_input", reason: error.message };
          }
        } else {
          throw error;
        }
      }
    }

    await context.updateProgress({ step: "extracting_facts" });
    const facts = await analyzeProduct({
      name: product.name,
      sourceText,
      imageUrls: product.images,
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
  },
  {
    queue: {
      retryLimit: 2,
      retryDelay: 10,
      retryBackoff: true,
      expireInSeconds: 10 * 60,
    },
    localConcurrency: 4,
    groupConcurrency: 1,
  },
);
