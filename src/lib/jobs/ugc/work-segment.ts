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
import {
  CLIP_SPEC,
  CREDIT_COST,
  shotDurationSeconds,
} from "@/lib/ugc/constants";
import {
  getVideoTask,
  submitVideo,
  videoPromptLimit,
} from "@/lib/ugc/media/video-provider";
import { speechMatchesScript } from "@/lib/ugc/media/alignment";
import { spokenText } from "@/lib/ugc/script-notation";
import { measureWavDurationMs } from "@/lib/ugc/media/audio";
import {
  getTranscription,
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
import {
  defineJob,
  type JobHandlerContext,
  PermanentJobError,
  RetryableJobError,
} from "../definition";

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
    const spokenLine = spokenText(beat.voiceover);
    const hasSpeech = Boolean(spokenLine.trim());
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
              videoPromptLimit(),
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

    const shotDurationMs = shotDurationSeconds(beat) * 1000;
    let audioUrl = take.audioUrl;
    if (work.audioMode === "tts" && hasSpeech && !audioUrl) {
      const sourceUrl = await synthesizeSpeech(spokenLine, work.locale);
      let narrationMs: number | null = null;
      audioUrl = await archiveGeneratedRemote({
        db,
        userId: work.userId,
        identity: `${take.id}:audio`,
        kind: "audio",
        sourceUrl,
        inspect: async (path) => {
          narrationMs = await measureWavDurationMs(path);
        },
      });
      await db
        .update(ugcWorkTakes)
        .set({ audioUrl, updatedAt: new Date() })
        .where(eq(ugcWorkTakes.id, take.id));
      // Narration that cannot fit is a writing problem, and it is fatal to the
      // whole work once composition reaches it. Fail here, where the cost is
      // this one shot and the operator can still edit the line.
      //
      // The annotation is load-bearing: control-flow analysis cannot see that
      // the callback above ran, and narrows the value back to its initial null.
      const measured: number | null = narrationMs;
      if (measured === null) {
        context.log("narration_duration_unknown", { takeId: take.id });
      } else if (measured > shotDurationMs + CLIP_SPEC.narrationToleranceMs) {
        const reason = `Narration runs ${(measured / 1000).toFixed(1)}s and the shot holds ${shotDurationSeconds(beat)}s. Shorten this beat's spoken line.`;
        await db
          .update(ugcWorkTakes)
          .set({
            status: "failed",
            failureReason: reason,
            updatedAt: new Date(),
          })
          .where(eq(ugcWorkTakes.id, take.id));
        throw new PermanentJobError("SEGMENT_NARRATION_TOO_LONG", reason);
      }
    }

    // Recognition exists to time the captions and to check the line was said.
    // A beat with no line has neither to offer, and asking anyway makes the
    // provider report a correctly silent shot as an error.
    if (hasSpeech && !take.asrTaskId) {
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

    // Null means recognition never gave a verdict; "" means it ran and heard
    // nothing. The console says different things about those two.
    let transcript: string | null = "";
    let words: typeof take.words = [];
    if (hasSpeech) {
      const result = await getTranscription(take.asrTaskId!);
      if (result.status === "pending") {
        await context.scheduleContinuation(
          { ...payload, polls: payload.polls + 1 },
          POLL_SECONDS,
        );
        return { waiting: "asr" };
      }
      // The shot is generated and billed by now, so nothing below throws it
      // away. A verdict it cannot pass hands it to the operator with what was
      // actually heard, to keep or to reshoot. The check still does its job:
      // composition will not caption a shot from evidence like this.
      const toReview = async (reason: string) => {
        await db
          .update(ugcWorkTakes)
          .set({
            status: "review",
            transcript,
            words,
            failureReason: reason,
            updatedAt: new Date(),
          })
          .where(eq(ugcWorkTakes.id, take.id));
        await billShot(db, work, take, segment, beat);
        context.log("segment_needs_review", {
          workId: work.id,
          position: segment.position,
          takeId: take.id,
          reason,
        });
        return { review: true, position: segment.position };
      };

      if (result.status === "failed") {
        // Recognition being unavailable says nothing about the footage. Give
        // the service a couple of tries, then let a person look instead.
        if (context.attempt <= 2)
          throw new RetryableJobError("SEGMENT_ASR_FAILED", result.reason);
        transcript = null;
        return await toReview("Speech could not be checked for this shot.");
      }
      transcript = result.text;
      const spoken = result.words;
      words = spoken;
      // Recognition is trusted to say *when* the script was spoken. Whether it
      // was spoken at all is a separate question, asked of the whole text.
      if (
        !speechMatchesScript(spokenLine, transcript) ||
        !spoken.length ||
        spoken.some(
          (word, index) =>
            word.startMs < 0 ||
            word.endMs <= word.startMs ||
            word.endMs > shotDurationMs + 200 ||
            // Cue windows are read off these in order, so out-of-order
            // recognition has to be caught here, not at composition, where
            // every other shot has already been generated and billed.
            (index > 0 && word.startMs < spoken[index - 1]!.startMs),
        )
      ) {
        return await toReview(
          "Spoken audio does not match the approved script.",
        );
      }
    }

    await billShot(db, work, take, segment, beat);
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

/**
 * The provider charges for a shot the moment it renders one, whether or not it
 * says the right words. Recording it against the take id keeps a re-run of the
 * same take from counting twice.
 */
async function billShot(
  db: JobHandlerContext["db"],
  work: { id: string; userId: string },
  take: { id: string; version: number },
  segment: { position: number },
  beat: ScriptBeat,
): Promise<void> {
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
}
