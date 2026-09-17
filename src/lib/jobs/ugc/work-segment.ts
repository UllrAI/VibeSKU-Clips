import { and, eq } from "drizzle-orm";
import { z } from "zod";
import {
  ugcProducts,
  ugcScripts,
  ugcTalents,
  ugcWorkFrames,
  ugcWorkSegments,
  ugcWorkTakes,
  ugcWorks,
} from "@/database/ugc";
import { CREDIT_COST, shotDurationSeconds } from "@/lib/ugc/constants";
import { getVideoTask, submitVideo } from "@/lib/ugc/media/video-provider";
import {
  getTranscription,
  speechMatchesScript,
  submitTranscription,
  synthesizeSpeech,
} from "@/lib/ugc/media/speech";
import { buildSegmentVideoPrompt } from "@/lib/ugc/render";
import {
  archiveGeneratedRemote,
  resolveOwnedMediaUrl,
  resolveReferenceUrls,
} from "@/lib/ugc/storage";
import type { ScriptBeat } from "@/lib/ugc/types";
import { recordUsage } from "@/lib/ugc/usage";
import { defineJob, PermanentJobError } from "../definition";

const POLL_SECONDS = 15;
const MAX_POLLS = 100;

export const workSegmentJob = defineJob(
  "ugc.work.segment",
  z
    .object({
      takeId: z.uuid(),
      userId: z.string().min(1),
      polls: z.number().int().nonnegative().default(0),
    })
    .strict(),
  async (payload, context) => {
    const db = context.db;
    const [row] = await db
      .select({ take: ugcWorkTakes, segment: ugcWorkSegments, work: ugcWorks })
      .from(ugcWorkTakes)
      .innerJoin(
        ugcWorkSegments,
        eq(ugcWorkSegments.id, ugcWorkTakes.segmentId),
      )
      .innerJoin(ugcWorks, eq(ugcWorks.id, ugcWorkSegments.workId))
      .where(
        and(
          eq(ugcWorkTakes.id, payload.takeId),
          eq(ugcWorks.userId, payload.userId),
        ),
      );
    if (!row)
      throw new PermanentJobError("SEGMENT_MISSING", "The shot was removed.");
    const { take, segment, work } = row;
    if (segment.activeTakeId !== take.id) return { superseded: true };
    if (take.status === "ready") return { ready: true };
    const [script] = await db
      .select()
      .from(ugcScripts)
      .where(eq(ugcScripts.id, segment.scriptId));
    const [product] = work.productId
      ? await db
          .select()
          .from(ugcProducts)
          .where(eq(ugcProducts.id, work.productId))
      : [];
    const [talent] = work.talentId
      ? await db
          .select()
          .from(ugcTalents)
          .where(eq(ugcTalents.id, work.talentId))
      : [];
    if (!script || !product)
      throw new PermanentJobError(
        "SEGMENT_INCOMPLETE",
        "Shot script or product is missing.",
      );
    const beats = script.beats as ScriptBeat[];
    const beat = beats[segment.position];
    if (!beat)
      throw new PermanentJobError(
        "SEGMENT_INCOMPLETE",
        "The shot has no matching script beat.",
      );
    const hasSpeech = Boolean(beat.voiceover.trim());
    if (payload.polls >= MAX_POLLS)
      throw new PermanentJobError(
        "SEGMENT_TIMEOUT",
        "The video or speech provider did not finish this shot.",
      );

    if (!take.videoTaskId && !take.videoUrl) {
      const [frame] = await db
        .select()
        .from(ugcWorkFrames)
        .where(
          and(
            eq(ugcWorkFrames.workId, work.id),
            eq(ugcWorkFrames.position, segment.position),
            eq(ugcWorkFrames.status, "ready"),
          ),
        );
      if (work.videoMode === "storyboard" && !frame?.imageUrl)
        throw new PermanentJobError(
          "SEGMENT_FRAME_MISSING",
          "This storyboard shot has no approved image.",
        );
      const references = await resolveReferenceUrls(
        db,
        work.userId,
        [
          frame?.imageUrl,
          talent?.imageUrl,
          ...product.images.slice(0, 4),
        ].filter((value): value is string => Boolean(value)),
      );
      const providerTaskId = await context.submitProviderJob(
        ({ idempotencyKey }) =>
          submitVideo({
            model: work.videoModel,
            prompt: buildSegmentVideoPrompt(
              {
                productName: product.name,
                appearance: product.facts?.appearance ?? "",
                market: work.market,
                locale: work.locale,
                template: work.template,
                talentPrompt: talent
                  ? (talent.prompt ?? talent.description ?? talent.name)
                  : null,
              },
              beats,
              segment.position,
              script.productionPrompt,
              work.audioMode,
              work.aspectRatio,
            ),
            referenceUrls: references,
            durationSeconds: shotDurationSeconds(beat),
            aspectRatio: work.aspectRatio,
            resolution: work.resolution,
            requestId: idempotencyKey,
            generateAudio: work.audioMode === "native",
          }),
      );
      await db
        .update(ugcWorkTakes)
        .set({
          videoTaskId: providerTaskId,
          taskRunId: context.taskRunId,
          status: "generating",
          updatedAt: new Date(),
        })
        .where(eq(ugcWorkTakes.id, take.id));
      await context.scheduleContinuation(
        { ...payload, polls: 1 },
        POLL_SECONDS,
      );
      return { submitted: true, providerTaskId };
    }

    let videoUrl = take.videoUrl;
    if (!videoUrl) {
      const task = await getVideoTask(take.videoTaskId!);
      if (task.status === "pending") {
        await context.scheduleContinuation(
          { ...payload, polls: payload.polls + 1 },
          POLL_SECONDS,
        );
        return { waiting: "video" };
      }
      if (task.status !== "completed" || !task.outputUrl) {
        throw new PermanentJobError(
          "SEGMENT_VIDEO_FAILED",
          task.errorMessage ?? "The video provider failed this shot.",
        );
      }
      videoUrl = await archiveGeneratedRemote({
        db,
        userId: work.userId,
        identity: `${take.id}:video`,
        kind: "video",
        sourceUrl: task.outputUrl,
      });
      await db
        .update(ugcWorkTakes)
        .set({ videoUrl, status: "transcribing", updatedAt: new Date() })
        .where(eq(ugcWorkTakes.id, take.id));
    }

    let audioUrl = take.audioUrl;
    if (work.audioMode === "tts" && hasSpeech && !audioUrl) {
      const sourceUrl = await synthesizeSpeech(beat.voiceover, work.locale);
      audioUrl = await archiveGeneratedRemote({
        db,
        userId: work.userId,
        identity: `${take.id}:audio`,
        kind: "audio",
        sourceUrl,
      });
      await db
        .update(ugcWorkTakes)
        .set({ audioUrl, updatedAt: new Date() })
        .where(eq(ugcWorkTakes.id, take.id));
    }

    const mustTranscribe = work.audioMode === "native" || hasSpeech;
    if (mustTranscribe && !take.asrTaskId) {
      const mediaUrl = await resolveOwnedMediaUrl(
        db,
        work.userId,
        audioUrl ?? videoUrl,
      );
      const asrTaskId = await submitTranscription(mediaUrl);
      await db
        .update(ugcWorkTakes)
        .set({ asrTaskId, status: "transcribing", updatedAt: new Date() })
        .where(eq(ugcWorkTakes.id, take.id));
      await context.scheduleContinuation(
        { ...payload, polls: payload.polls + 1 },
        POLL_SECONDS,
      );
      return { submitted: "asr" };
    }

    let transcript = "";
    let words: typeof take.words = [];
    if (mustTranscribe) {
      const result = await getTranscription(take.asrTaskId!);
      if (result.status === "pending") {
        await context.scheduleContinuation(
          { ...payload, polls: payload.polls + 1 },
          POLL_SECONDS,
        );
        return { waiting: "asr" };
      }
      if (result.status === "failed")
        throw new PermanentJobError("SEGMENT_ASR_FAILED", result.reason);
      transcript = result.text;
      words = result.words;
      const shotDurationMs = shotDurationSeconds(beat) * 1000;
      if (
        !speechMatchesScript(beat.voiceover, transcript) ||
        (hasSpeech && !words.length) ||
        words.some(
          (word) =>
            word.startMs < 0 ||
            word.endMs <= word.startMs ||
            word.endMs > shotDurationMs + 200,
        )
      ) {
        await db
          .update(ugcWorkTakes)
          .set({
            status: "failed",
            transcript,
            words,
            failureReason: "Spoken audio does not match the approved script.",
            updatedAt: new Date(),
          })
          .where(eq(ugcWorkTakes.id, take.id));
        throw new PermanentJobError(
          "SEGMENT_SPEECH_MISMATCH",
          "Spoken audio does not match the approved script.",
        );
      }
    }

    await recordUsage(db, {
      userId: work.userId,
      kind: take.version === 1 ? "render" : "regenerate",
      credits: Math.max(
        1,
        Math.ceil((CREDIT_COST.render * shotDurationSeconds(beat)) / 15),
      ),
      sourceKey: take.id,
      note: `Shot ${segment.position + 1} of ${work.id}`,
    });
    await db
      .update(ugcWorkTakes)
      .set({
        status: "ready",
        videoUrl,
        audioUrl,
        transcript,
        words,
        failureReason: null,
        updatedAt: new Date(),
      })
      .where(eq(ugcWorkTakes.id, take.id));
    context.log("segment_ready", {
      workId: work.id,
      position: segment.position,
      takeId: take.id,
    });
    return { ready: true, position: segment.position };
  },
  {
    queue: {
      retryLimit: 2,
      retryDelay: 30,
      retryBackoff: true,
      expireInSeconds: 30 * 60,
    },
    localConcurrency: 4,
    groupConcurrency: 1,
  },
);
