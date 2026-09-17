import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { ugcReferences } from "@/database/ugc";
import { analyzeReference } from "@/lib/ugc/blueprint";
import { CREDIT_COST } from "@/lib/ugc/constants";
import { getTranscription, submitTranscription } from "@/lib/ugc/media/speech";
import { resolveOwnedMediaUrl, resolveReferenceUrls } from "@/lib/ugc/storage";
import { recordUsage } from "@/lib/ugc/usage";
import {
  defineJob,
  type JobHandlerContext,
  PermanentJobError,
} from "../definition";

const POLL_SECONDS = 15;
const MAX_POLLS = 40;

/**
 * Reads the ingested evidence into a blueprint and stops for review.
 *
 * Transcription is a hosted task, so this waits on it rather than holding a
 * worker; everything it needs is already archived, which is what makes waiting
 * and retrying cheap.
 */
export const referenceAnalyzeJob = defineJob(
  "ugc.reference.analyze",
  z
    .object({
      referenceId: z.uuid(),
      userId: z.string().min(1),
      polls: z.number().int().nonnegative().default(0),
    })
    .strict(),
  async (payload, context) => {
    const db = context.db;
    try {
      return await analyze(payload, context);
    } catch (error) {
      // The console reads the reason from this step's task run, but the list
      // only sees the row. A reference that gave up must not read as running.
      if (error instanceof PermanentJobError || context.attempt > 2) {
        await db
          .update(ugcReferences)
          .set({ status: "failed", updatedAt: new Date() })
          .where(eq(ugcReferences.id, payload.referenceId));
      }
      throw error;
    }
  },
  {
    queue: {
      retryLimit: 2,
      retryDelay: 15,
      retryBackoff: true,
      expireInSeconds: 20 * 60,
    },
    localConcurrency: 4,
    groupConcurrency: 1,
  },
);

type AnalyzePayload = {
  referenceId: string;
  userId: string;
  polls: number;
};

async function analyze(
  payload: AnalyzePayload,
  context: JobHandlerContext<AnalyzePayload>,
) {
  const db = context.db;
  const [reference] = await db
    .select()
    .from(ugcReferences)
    .where(
      and(
        eq(ugcReferences.id, payload.referenceId),
        eq(ugcReferences.userId, payload.userId),
      ),
    );
  if (!reference)
    throw new PermanentJobError(
      "REFERENCE_MISSING",
      "The reference was removed before it could be analysed.",
    );
  if (!reference.frames?.length || !reference.durationMs || !reference.videoUrl)
    throw new PermanentJobError(
      "REFERENCE_NOT_INGESTED",
      "This reference has not been read yet.",
    );
  if (payload.polls >= MAX_POLLS)
    throw new PermanentJobError(
      "REFERENCE_ASR_TIMEOUT",
      "Speech recognition did not finish for this reference.",
    );

  // A null transcript means this reference has speech that has not been
  // recognised yet; an empty one means it has none to recognise.
  let transcript = reference.transcript ?? "";
  let words = reference.words ?? [];
  if (reference.transcript === null) {
    await context.updateProgress({ step: "transcribing" });
    if (!reference.asrTaskId) {
      const asrTaskId = await submitTranscription(
        await resolveOwnedMediaUrl(db, reference.userId, reference.videoUrl),
      );
      await db
        .update(ugcReferences)
        .set({ asrTaskId, updatedAt: new Date() })
        .where(eq(ugcReferences.id, reference.id));
      await context.scheduleContinuation(
        { ...payload, polls: payload.polls + 1 },
        POLL_SECONDS,
      );
      return { submitted: "asr" };
    }
    const result = await getTranscription(reference.asrTaskId);
    if (result.status === "pending") {
      await context.scheduleContinuation(
        { ...payload, polls: payload.polls + 1 },
        POLL_SECONDS,
      );
      return { waiting: "asr" };
    }
    // A reference that cannot be transcribed is still worth reading: the
    // stills carry the structure, and the blueprint is about structure.
    transcript = result.status === "failed" ? "" : result.text;
    words = result.status === "failed" ? [] : result.words;
    if (result.status === "failed") {
      context.log("reference_asr_failed", {
        referenceId: reference.id,
        reason: result.reason,
      });
    }
    await db
      .update(ugcReferences)
      .set({ transcript, words, updatedAt: new Date() })
      .where(eq(ugcReferences.id, reference.id));
  }

  await context.updateProgress({ step: "reading_structure" });
  const signed = await resolveReferenceUrls(
    db,
    reference.userId,
    reference.frames.map((frame) => frame.url),
  );
  const blueprint = await analyzeReference({
    frames: reference.frames.map((frame, index) => ({
      atMs: frame.atMs,
      url: signed[index]!,
    })),
    transcript,
    words,
    durationMs: reference.durationMs,
    locale: reference.locale,
  });

  await db
    .update(ugcReferences)
    .set({
      blueprint,
      status: "review",
      updatedAt: new Date(),
    })
    .where(eq(ugcReferences.id, reference.id));
  await recordUsage(db, {
    userId: reference.userId,
    kind: "analysis",
    credits: CREDIT_COST.analysis,
    note: reference.title,
  });

  context.log("reference_analyzed", {
    referenceId: reference.id,
    format: blueprint.format,
    beats: blueprint.beats.length,
  });
  return { format: blueprint.format, beats: blueprint.beats.length };
}
