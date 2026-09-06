import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { ugcProducts, ugcScripts, ugcTalents, ugcWorks } from "@/database/ugc";
import { composeScript } from "@/lib/ugc/authoring";
import { CREDIT_COST, type ScriptTemplate } from "@/lib/ugc/constants";
import { defaultDisclosure } from "@/lib/ugc/templates";
import { resolveReferenceUrls } from "@/lib/ugc/storage";
import { recordUsage } from "@/lib/ugc/usage";
import { defineJob, PermanentJobError } from "../definition";

/**
 * Writes the script for one work and stops. Nothing downstream starts until a
 * person has read it, which is the whole point of the stepped flow: the script
 * is the cheapest place to catch a wrong angle, and the most expensive one to
 * discover after a video has been paid for.
 */
export const workScriptJob = defineJob(
  "ugc.work.script",
  z.object({ workId: z.uuid(), userId: z.string().min(1) }).strict(),
  async (payload, context) => {
    const db = context.db;
    const [work] = await db
      .select()
      .from(ugcWorks)
      .where(
        and(
          eq(ugcWorks.id, payload.workId),
          eq(ugcWorks.userId, payload.userId),
        ),
      );
    if (!work) {
      throw new PermanentJobError(
        "UGC_WORK_MISSING",
        "The work was removed before its script could be written.",
      );
    }
    if (!work.productId) {
      throw new PermanentJobError(
        "UGC_WORK_NO_PRODUCT",
        "Pick a product before writing the script.",
      );
    }

    const [product] = await db
      .select()
      .from(ugcProducts)
      .where(eq(ugcProducts.id, work.productId));
    if (!product?.facts) {
      throw new PermanentJobError(
        "UGC_PRODUCT_NOT_READ",
        "The product has no readable facts yet.",
      );
    }

    const [talent] = work.talentId
      ? await db
          .select()
          .from(ugcTalents)
          .where(eq(ugcTalents.id, work.talentId))
      : [];

    await context.updateProgress({ step: "writing_script" });
    context.log("work_script_started", {
      workId: work.id,
      productId: product.id,
      talentId: talent?.id ?? null,
    });

    const imageUrls = await resolveReferenceUrls(
      db,
      work.userId,
      [talent?.imageUrl, ...product.images].filter((url): url is string =>
        Boolean(url),
      ),
    );
    const draft = await composeScript({
      facts: product.facts,
      brief: product.brief,
      template: work.template as ScriptTemplate,
      locale: work.locale,
      market: work.market,
      productName: product.name,
      // The model sees what the clip will actually show, so the script can
      // describe the real object and the real performer.
      imageUrls,
      talentNote: talent ? (talent.prompt ?? talent.name) : null,
    });

    const [script] = await db
      .insert(ugcScripts)
      .values({
        userId: work.userId,
        productId: product.id,
        template: work.template,
        locale: work.locale,
        market: work.market,
        title: draft.title,
        hook: draft.hook,
        beats: draft.beats,
        voiceover: draft.voiceover,
        captions: draft.captions,
        publishCaption: draft.publishCaption,
        disclosure: draft.disclosure || defaultDisclosure(work.locale),
        // Stays a draft until the operator accepts it; only then does it
        // become something the script library offers for reuse.
        status: "draft",
      })
      .returning();

    await recordUsage(db, {
      userId: work.userId,
      kind: "script",
      credits: CREDIT_COST.script,
      note: script.title,
    });

    await db
      .update(ugcWorks)
      .set({
        scriptId: script.id,
        step: "script",
        stepStatus: "review",
        updatedAt: new Date(),
      })
      .where(eq(ugcWorks.id, work.id));

    context.log("work_script_finished", {
      workId: work.id,
      scriptId: script.id,
      beats: draft.beats.length,
    });
    return { scriptId: script.id, beats: draft.beats.length };
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
