import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { AppDatabase } from "@/database/client";
import {
  ugcBatches,
  ugcClips,
  ugcProducts,
  ugcScripts,
  ugcTalents,
} from "@/database/ugc";
import { composeScript } from "@/lib/ugc/authoring";
import { CREDIT_COST, type ScriptTemplate } from "@/lib/ugc/constants";
import {
  buildClipReference,
  countProductsAwaitingFacts,
  summarizePlan,
} from "@/lib/ugc/planning";
import { similarityKeyFor } from "@/lib/ugc/similarity";
import { defaultDisclosure } from "@/lib/ugc/templates";
import type { BatchPlanItem, ScriptDraft } from "@/lib/ugc/types";
import { recordUsage } from "@/lib/ugc/usage";
import { defineJob, PermanentJobError } from "../definition";
import { enqueueClipRender } from "./enqueue";

/**
 * A product registered from the composer is still being read when its batch is
 * enqueued. Waiting is the correct answer: skipping the line would silently
 * produce nothing from a batch the operator just paid for.
 */
const INGEST_WAIT_SECONDS = 15;
const MAX_INGEST_WAITS = 20;

export const batchRunJob = defineJob(
  "ugc.batch.run",
  z
    .object({
      batchId: z.uuid(),
      userId: z.string().min(1),
      waits: z.number().int().min(0).default(0),
    })
    .strict(),
  async (payload, context) => {
    const db = context.db;
    const [batch] = await db
      .select()
      .from(ugcBatches)
      .where(
        and(
          eq(ugcBatches.id, payload.batchId),
          eq(ugcBatches.userId, payload.userId),
        ),
      );
    if (!batch) {
      throw new PermanentJobError(
        "UGC_BATCH_MISSING",
        "The batch was removed before it could start.",
      );
    }

    const plan = summarizePlan(batch.config);

    const productIds = [
      ...new Set(plan.lines.map((line) => line.item.productId)),
    ];
    const products = await db
      .select({
        id: ugcProducts.id,
        status: ugcProducts.status,
        facts: ugcProducts.facts,
      })
      .from(ugcProducts)
      .where(
        and(
          inArray(ugcProducts.id, productIds),
          eq(ugcProducts.userId, batch.userId),
        ),
      );
    const stillReading = countProductsAwaitingFacts(products);
    if (stillReading > 0 && payload.waits < MAX_INGEST_WAITS) {
      context.log("batch_waiting_for_products", {
        batchId: batch.id,
        pending: stillReading,
        wait: payload.waits + 1,
      });
      await context.updateProgress({
        step: "reading_products",
        pending: stillReading,
      });
      await context.scheduleContinuation(
        { ...payload, waits: payload.waits + 1 },
        INGEST_WAIT_SECONDS,
      );
      return { waitingForProducts: stillReading, waits: payload.waits + 1 };
    }

    const sequence = Math.abs(hashCode(batch.id)) % 10_000;
    let clipIndex = 0;
    let blocked = 0;
    const skipped: string[] = [];

    for (const [lineIndex, line] of plan.lines.entries()) {
      if (await context.isCancelled()) return { cancelled: true };
      await context.updateProgress({
        step: "writing_scripts",
        line: lineIndex + 1,
        lines: plan.lines.length,
      });

      const [product] = await db
        .select()
        .from(ugcProducts)
        .where(
          and(
            eq(ugcProducts.id, line.item.productId),
            eq(ugcProducts.userId, batch.userId),
          ),
        );

      // A product that is still missing facts pauses its own clips only. Every
      // other line in the batch continues.
      if (!product?.facts || product.status === "needs_input") {
        blocked += line.clipCount;
        clipIndex += line.clipCount;
        const reason = product?.issue ?? "no readable facts";
        skipped.push(`${product?.name ?? "Unknown product"}: ${reason}`);
        context.log("batch_line_skipped", {
          line: lineIndex + 1,
          productId: line.item.productId,
          clips: line.clipCount,
          reason,
        });
        continue;
      }

      const scriptIds = line.item.scriptId
        ? [line.item.scriptId]
        : await writeScripts(db, {
            batchUserId: batch.userId,
            item: line.item,
            product,
            variants: line.scriptCount,
            sharedBrief: batch.config.sharedBrief,
          });

      const talentIds: (string | null)[] = line.item.talentIds.length
        ? line.item.talentIds
        : [null];

      for (const scriptId of scriptIds) {
        for (const talentId of talentIds) {
          for (
            let copy = 0;
            copy < Math.max(1, line.item.clipsPerScript);
            copy += 1
          ) {
            const reference = buildClipReference(sequence, clipIndex);
            const created = await createClip(db, {
              batch,
              item: line.item,
              productId: product.id,
              scriptId,
              talentId,
              reference,
            });
            if (!batch.config.reviewScriptsFirst) {
              await enqueueClipRender(db, {
                userId: batch.userId,
                batchId: batch.id,
                clipId: created.id,
                laneIndex: clipIndex,
              });
            }
            clipIndex += 1;
          }
        }
      }
    }

    // A run that created nothing is over, not running: leaving it "in
    // production" would spin the console for ever with no work behind it.
    const clipsCreated = clipIndex - blocked;
    await db
      .update(ugcBatches)
      .set({
        status: clipsCreated > 0 ? "running" : "completed",
        note: skipped.length > 0 ? skipped.join(" · ") : null,
        updatedAt: new Date(),
      })
      .where(eq(ugcBatches.id, batch.id));

    context.log("batch_expanded", {
      batchId: batch.id,
      created: clipsCreated,
      blocked,
      awaitingScriptApproval: batch.config.reviewScriptsFirst,
    });

    return {
      clipsCreated,
      blocked,
      awaitingScriptApproval: batch.config.reviewScriptsFirst,
    };
  },
  {
    queue: {
      retryLimit: 1,
      retryDelay: 15,
      retryBackoff: false,
      expireInSeconds: 30 * 60,
    },
    localConcurrency: 2,
    groupConcurrency: 1,
  },
);

function hashCode(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return hash;
}

async function writeScripts(
  db: AppDatabase,
  input: {
    batchUserId: string;
    item: BatchPlanItem;
    product: typeof ugcProducts.$inferSelect;
    variants: number;
    sharedBrief?: import("@/lib/ugc/types").ProductBrief;
  },
): Promise<string[]> {
  const brief = input.product.brief ?? input.sharedBrief ?? null;
  const ids: string[] = [];

  for (let variant = 0; variant < input.variants; variant += 1) {
    const draft: ScriptDraft = await composeScript({
      facts: input.product.facts!,
      brief,
      template: input.item.template as ScriptTemplate,
      locale: input.item.locale,
      market: input.item.market,
      variantIndex: variant,
      productName: input.product.name,
    });

    const [script] = await db
      .insert(ugcScripts)
      .values({
        userId: input.batchUserId,
        productId: input.product.id,
        template: input.item.template as ScriptTemplate,
        locale: input.item.locale,
        market: input.item.market,
        title: draft.title,
        hook: draft.hook,
        beats: draft.beats,
        voiceover: draft.voiceover,
        captions: draft.captions,
        publishCaption: draft.publishCaption,
        disclosure: draft.disclosure || defaultDisclosure(input.item.locale),
        status: brief?.providedScript ? "locked" : "ready",
      })
      .returning();

    await recordUsage(db, {
      userId: input.batchUserId,
      kind: "script",
      credits: CREDIT_COST.script,
      note: script.title,
    });
    ids.push(script.id);
  }

  return ids;
}

async function createClip(
  db: AppDatabase,
  input: {
    batch: typeof ugcBatches.$inferSelect;
    item: BatchPlanItem;
    productId: string;
    scriptId: string;
    talentId: string | null;
    reference: string;
  },
) {
  const [script] = await db
    .select()
    .from(ugcScripts)
    .where(eq(ugcScripts.id, input.scriptId));

  const [talent] = input.talentId
    ? await db
        .select()
        .from(ugcTalents)
        .where(eq(ugcTalents.id, input.talentId))
    : [];

  const [clip] = await db
    .insert(ugcClips)
    .values({
      userId: input.batch.userId,
      batchId: input.batch.id,
      productId: input.productId,
      scriptId: input.scriptId,
      talentId: talent?.id ?? null,
      reference: input.reference,
      locale: input.item.locale,
      market: input.item.market,
      accountTag: input.item.accountTag ?? input.batch.accountTag ?? null,
      template: input.item.template as ScriptTemplate,
      status: "pending",
      publishCaption: script?.publishCaption ?? null,
      similarityKey: script
        ? similarityKeyFor({
            locale: script.locale,
            hook: script.hook,
            voiceover: script.voiceover,
          })
        : null,
    })
    .returning();

  return clip;
}
