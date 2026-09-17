import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import {
  ugcClips,
  ugcCompositions,
  ugcProducts,
  ugcScripts,
  ugcWorkSegments,
  ugcWorkTakes,
  ugcWorks,
} from "@/database/ugc";
import { composeMedia, type CompositionSegment } from "@/lib/ugc/composition";
import { evaluateClipQuality } from "@/lib/ugc/qc";
import { archiveGeneratedFile, resolveOwnedMediaUrl } from "@/lib/ugc/storage";
import { defineJob, PermanentJobError } from "../definition";

export const workComposeJob = defineJob(
  "ugc.work.compose",
  z.object({ compositionId: z.uuid(), userId: z.string().min(1) }).strict(),
  async (payload, context) => {
    const db = context.db;
    const [composition] = await db
      .select()
      .from(ugcCompositions)
      .where(eq(ugcCompositions.id, payload.compositionId));
    if (!composition)
      throw new PermanentJobError(
        "COMPOSITION_MISSING",
        "The composition was removed.",
      );
    const [work] = await db
      .select()
      .from(ugcWorks)
      .where(
        and(
          eq(ugcWorks.id, composition.workId),
          eq(ugcWorks.userId, payload.userId),
        ),
      );
    if (!work)
      throw new PermanentJobError(
        "COMPOSITION_WORK_MISSING",
        "The work was removed.",
      );
    if (composition.clipId) return { clipId: composition.clipId };
    const [script] = await db
      .select()
      .from(ugcScripts)
      .where(eq(ugcScripts.id, composition.scriptId));
    const [product] = work.productId
      ? await db
          .select()
          .from(ugcProducts)
          .where(eq(ugcProducts.id, work.productId))
      : [];
    if (!script || !product)
      throw new PermanentJobError(
        "COMPOSITION_INCOMPLETE",
        "Script or product is missing.",
      );

    const takes = await db
      .select({ take: ugcWorkTakes, segment: ugcWorkSegments })
      .from(ugcWorkTakes)
      .innerJoin(
        ugcWorkSegments,
        eq(ugcWorkSegments.id, ugcWorkTakes.segmentId),
      )
      .where(eq(ugcWorkSegments.workId, work.id));
    const selected = composition.takeIds.map((id) =>
      takes.find((row) => row.take.id === id),
    );
    if (
      selected.some(
        (row) => !row || row.take.status !== "ready" || !row.take.videoUrl,
      )
    ) {
      throw new PermanentJobError(
        "COMPOSITION_INCOMPLETE",
        "One or more selected shots are not ready.",
      );
    }
    const rows = selected as typeof takes;
    if (
      rows.some(
        (row, index) =>
          row.segment.position !== index || row.segment.scriptId !== script.id,
      )
    ) {
      throw new PermanentJobError(
        "COMPOSITION_INVALID_ORDER",
        "Selected shots do not match the script.",
      );
    }
    await db
      .update(ugcCompositions)
      .set({
        status: "running",
        taskRunId: context.taskRunId,
        updatedAt: new Date(),
      })
      .where(eq(ugcCompositions.id, composition.id));
    const directory = await mkdtemp(join(tmpdir(), "vibesku-compose-"));
    try {
      const segments: CompositionSegment[] = await Promise.all(
        rows.map(async (row) => ({
          videoUrl: await resolveOwnedMediaUrl(
            db,
            work.userId,
            row.take.videoUrl!,
            ["video/"],
            4 * 3600,
          ),
          audioUrl: row.take.audioUrl
            ? await resolveOwnedMediaUrl(
                db,
                work.userId,
                row.take.audioUrl,
                ["audio/"],
                4 * 3600,
              )
            : null,
          durationMs: row.segment.endMs - row.segment.startMs,
          words: row.take.words ?? [],
          voiceover: script.beats[row.segment.position]?.voiceover ?? "",
          spanAuthority: work.audioMode === "native" ? "video" : "audio",
        })),
      );
      const result = await composeMedia(
        {
          segments,
          aspectRatio: work.aspectRatio,
          resolution: work.resolution,
        },
        directory,
      );
      const reference = `VW-${work.id.slice(0, 8)}-V${composition.version}`;
      const videoUrl = await archiveGeneratedFile({
        db,
        userId: work.userId,
        identity: `${reference}:final`,
        kind: "video",
        path: result.videoPath,
      });
      const subtitleContent = await readFile(result.subtitlePath, "utf8");
      const subtitleUrl = subtitleContent.trim()
        ? await archiveGeneratedFile({
            db,
            userId: work.userId,
            identity: `${reference}:subtitle`,
            kind: "subtitle",
            path: result.subtitlePath,
          })
        : null;
      const quality = evaluateClipQuality({
        locale: work.locale,
        targetDurationSeconds: work.durationSeconds,
        durationMs: result.durationMs,
        script: { voiceover: script.voiceover, captions: script.captions },
        hasTalentReference: Boolean(work.talentId),
      });
      const [existing] = await db
        .select()
        .from(ugcClips)
        .where(
          and(
            eq(ugcClips.workId, work.id),
            eq(ugcClips.version, composition.version),
          ),
        );
      const clip =
        existing ??
        (
          await db
            .insert(ugcClips)
            .values({
              userId: work.userId,
              productId: product.id,
              scriptId: script.id,
              talentId: work.talentId,
              workId: work.id,
              version: composition.version,
              reference,
              locale: work.locale,
              market: work.market,
              template: work.template,
              videoModel: work.videoModel,
              aspectRatio: work.aspectRatio,
              resolution: work.resolution,
              durationSeconds: work.durationSeconds,
              audioMode: work.audioMode,
              status: quality.passed ? "ready" : "failed",
              failureReason: quality.passed
                ? null
                : quality.checks
                    .filter((check) => !check.passed)
                    .map((check) => check.detail)
                    .join(" "),
              videoUrl,
              coverUrl: product.images[0] ?? null,
              subtitleUrl,
              publishCaption: script.publishCaption,
              durationMs: result.durationMs,
              quality,
            })
            .returning()
        )[0];
      await db
        .update(ugcCompositions)
        .set({ status: "ready", clipId: clip.id, updatedAt: new Date() })
        .where(eq(ugcCompositions.id, composition.id));
      await db
        .update(ugcWorks)
        .set({
          clipId: clip.id,
          step: "done",
          stepStatus: "review",
          updatedAt: new Date(),
        })
        .where(eq(ugcWorks.id, work.id));
      context.log("composition_ready", {
        workId: work.id,
        clipId: clip.id,
        shots: rows.length,
      });
      return { clipId: clip.id, durationMs: result.durationMs };
    } catch (error) {
      await db
        .update(ugcCompositions)
        .set({
          status: "failed",
          failureReason:
            error instanceof Error
              ? error.message.slice(0, 1000)
              : "Composition failed.",
          updatedAt: new Date(),
        })
        .where(eq(ugcCompositions.id, composition.id));
      throw error;
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
  {
    queue: {
      retryLimit: 2,
      retryDelay: 30,
      retryBackoff: true,
      expireInSeconds: 60 * 60,
    },
    localConcurrency: 1,
    groupConcurrency: 1,
  },
);
