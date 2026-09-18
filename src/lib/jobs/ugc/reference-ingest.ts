import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { ugcReferences } from "@/database/ugc";
import { downloadToFile } from "@/lib/ugc/media/ffmpeg";
import {
  extractFrames,
  fetchLinkedVideo,
  readReferenceFacts,
  referenceAspectRatio,
  ReferenceFetchError,
} from "@/lib/ugc/media/reference";
import { referenceScopeKey } from "@/lib/ugc/scope";
import { archiveGeneratedFile, resolveOwnedMediaUrl } from "@/lib/ugc/storage";
import type { ReferenceFrameRecord } from "@/lib/ugc/types";
import { createBackgroundTask } from "@/lib/tasks/service";
import { defineJob, PermanentJobError } from "../definition";
import { referenceAnalyzeJob } from "./reference-analyze";

/** Long enough to read as a piece, short enough to stay one idea. */
const MAX_REFERENCE_MS = 180_000;
const MIN_REFERENCE_MS = 3_000;

/**
 * Turns a reference video into the evidence an analysis can read: an archived
 * copy and a grid of stills.
 *
 * This runs on the render worker because it is the only one holding the media
 * toolchain, and it does only what that toolchain is for. Transcription and
 * the reading itself are a separate job beside the hosted-API credentials, so
 * a retried analysis never re-downloads or re-decodes the video.
 */
export const referenceIngestJob = defineJob(
  "ugc.reference.ingest",
  z.object({ referenceId: z.uuid(), userId: z.string().min(1) }).strict(),
  async (payload, context) => {
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
        "The reference was removed before it could be read.",
      );
    if (await context.isCancelled()) return null;

    await db
      .update(ugcReferences)
      .set({ status: "ingesting", updatedAt: new Date() })
      .where(eq(ugcReferences.id, reference.id));
    await context.updateProgress({ step: "fetching_video" });

    const directory = await mkdtemp(join(tmpdir(), "vibesku-reference-"));
    try {
      const videoPath = join(directory, "source.mp4");
      if (reference.source === "url") {
        if (!reference.sourceUrl)
          throw new PermanentJobError(
            "REFERENCE_NO_SOURCE",
            "This reference has no link to read.",
          );
        await fetchLinkedVideo(reference.sourceUrl, videoPath);
      } else {
        if (!reference.videoUrl)
          throw new PermanentJobError(
            "REFERENCE_NO_SOURCE",
            "This reference has no uploaded file.",
          );
        await downloadToFile(
          await resolveOwnedMediaUrl(db, reference.userId, reference.videoUrl),
          videoPath,
        );
      }

      const facts = await readReferenceFacts(videoPath);
      if (
        facts.durationMs < MIN_REFERENCE_MS ||
        facts.durationMs > MAX_REFERENCE_MS
      )
        throw new PermanentJobError(
          "REFERENCE_DURATION_UNSUPPORTED",
          `A reference must run between ${MIN_REFERENCE_MS / 1000} and ${MAX_REFERENCE_MS / 1000} seconds.`,
        );

      // A fetched video lives only on this disk. Archiving it is what makes the
      // reference reviewable later and readable by the recognizer at all.
      const videoUrl =
        reference.source === "url"
          ? await archiveGeneratedFile({
              db,
              userId: reference.userId,
              identity: `${reference.id}:source`,
              kind: "video",
              path: videoPath,
            })
          : reference.videoUrl!;

      await context.updateProgress({ step: "sampling_frames" });
      const frames: ReferenceFrameRecord[] = [];
      for (const frame of await extractFrames(
        videoPath,
        directory,
        facts.durationMs,
      )) {
        frames.push({
          atMs: frame.atMs,
          url: await archiveGeneratedFile({
            db,
            userId: reference.userId,
            identity: `${reference.id}:frame:${frame.atMs}`,
            kind: "frame",
            path: frame.path,
          }),
        });
      }

      await db
        .update(ugcReferences)
        .set({
          videoUrl,
          durationMs: facts.durationMs,
          aspectRatio: referenceAspectRatio(facts),
          frames,
          // Empty means this reference carries no speech to recognise; null
          // means it has speech that has not been transcribed yet. Reading
          // again starts from here, so an earlier recognition task must not
          // be left behind for the next analysis to poll.
          transcript: facts.audio ? null : "",
          asrTaskId: null,
          words: null,
          status: "analyzing",
          updatedAt: new Date(),
        })
        .where(eq(ugcReferences.id, reference.id));

      const { taskRun } = await createBackgroundTask({
        db,
        definition: referenceAnalyzeJob,
        scopeKey: referenceScopeKey(reference.userId, reference.id),
        payload: {
          referenceId: reference.id,
          userId: reference.userId,
          polls: 0,
        },
        idempotencyKey: `${reference.id}:analyze:${context.taskRunId}`,
      });
      await db
        .update(ugcReferences)
        .set({ taskRunId: taskRun.id, updatedAt: new Date() })
        .where(eq(ugcReferences.id, reference.id));

      context.log("reference_ingested", {
        referenceId: reference.id,
        durationMs: facts.durationMs,
        frames: frames.length,
        hasSpeech: facts.audio,
      });
      return { frames: frames.length, durationMs: facts.durationMs };
    } catch (error) {
      if (
        error instanceof ReferenceFetchError ||
        error instanceof PermanentJobError
      ) {
        await db
          .update(ugcReferences)
          .set({
            status: "failed",
            updatedAt: new Date(),
          })
          .where(eq(ugcReferences.id, reference.id));
        if (error instanceof PermanentJobError) throw error;
        // The site's own reason decides what the operator should do next, so
        // it travels as its own code rather than one catch-all.
        context.log("reference_fetch_failed", {
          referenceId: reference.id,
          failure: error.failure,
          detail: error.message,
        });
        throw new PermanentJobError(
          `REFERENCE_FETCH_${error.failure.toUpperCase()}`,
          error.message,
        );
      }
      if (context.attempt > 1) {
        await db
          .update(ugcReferences)
          .set({
            status: "failed",
            updatedAt: new Date(),
          })
          .where(eq(ugcReferences.id, reference.id));
      }
      throw error;
    } finally {
      await rm(directory, { recursive: true, force: true }).catch(
        () => undefined,
      );
    }
  },
  {
    role: "render",
    queue: {
      retryLimit: 1,
      retryDelay: 20,
      retryBackoff: true,
      expireInSeconds: 30 * 60,
    },
    localConcurrency: 2,
    groupConcurrency: 1,
  },
);
