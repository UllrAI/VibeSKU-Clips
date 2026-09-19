import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { AppDatabase } from "@/database/client";
import { ugcScenes } from "@/database/ugc";
import { composeSceneImagePrompt } from "@/lib/ugc/authoring";
import {
  CREDIT_COST,
  PRISM_MEDIA,
  REFERENCE_ASPECT_RATIO,
} from "@/lib/ugc/constants";
import { getTask, submitImage } from "@/lib/ugc/media/prism";
import { authoringModelLog } from "@/lib/ugc/model";
import { mediaTaskLog } from "@/lib/ugc/media/task-log";
import { archiveRemoteAsset, buildSceneSheetPrompt } from "@/lib/ugc/render";
import {
  createClipStorage,
  resolveReferenceUrls,
  StorageUnavailableError,
  type ClipStorage,
} from "@/lib/ugc/storage";
import { recordUsage } from "@/lib/ugc/usage";
import { defineJob, PermanentJobError } from "../definition";

const RETRY_LIMIT = 2;
const POLL_SECONDS = 8;
const MAX_POLLS = 45;

const payloadSchema = z
  .object({
    sceneId: z.uuid(),
    userId: z.string().min(1),
    providerTaskId: z.string().optional(),
    polls: z.number().int().nonnegative().default(0),
  })
  .strict();

function storage(db: AppDatabase): ClipStorage {
  try {
    return createClipStorage(db);
  } catch (error) {
    if (error instanceof StorageUnavailableError) {
      throw new PermanentJobError("UGC_STORAGE_UNAVAILABLE", error.message);
    }
    throw error;
  }
}

/**
 * Expands the brief into one description of a place, then draws the reference
 * sheet for it: a single square image whose panels show the whole space, the
 * view a person would stand and talk in, and the surface a product would be
 * set down on. Drawing them together is what makes three viewpoints read as
 * one room rather than three.
 */
export const sceneGenerateJob = defineJob(
  "ugc.scene.generate",
  payloadSchema,
  async (payload, context) => {
    const db = context.db;
    const [scene] = await db
      .select()
      .from(ugcScenes)
      .where(
        and(
          eq(ugcScenes.id, payload.sceneId),
          eq(ugcScenes.userId, payload.userId),
        ),
      );
    if (!scene || scene.archived) return null;
    if (scene.status === "ready" && scene.sheetUrl) {
      return { sheetUrl: scene.sheetUrl };
    }

    try {
      if (!payload.providerTaskId) {
        const referenceImageUrls = await resolveReferenceUrls(
          db,
          scene.userId,
          scene.referenceImages,
        );
        const locationPrompt =
          scene.prompt ??
          (await composeSceneImagePrompt({
            name: scene.name,
            description: scene.description,
            referenceImageUrls,
          }));

        await db
          .update(ugcScenes)
          .set({
            prompt: locationPrompt,
            status: "generating",
            updatedAt: new Date(),
          })
          .where(eq(ugcScenes.id, scene.id));

        const providerTaskId = await submitImage({
          prompt: buildSceneSheetPrompt(
            locationPrompt,
            referenceImageUrls.length > 0,
          ),
          referenceUrls: referenceImageUrls,
          aspectRatio: REFERENCE_ASPECT_RATIO,
          imageSize: PRISM_MEDIA.sheetImageSize,
          requestId: context.taskRunId,
        });
        await context.updateProgress({ step: "drawing_scene" });
        await context.scheduleContinuation(
          { ...payload, providerTaskId, polls: 0 },
          POLL_SECONDS,
        );
        context.log("scene_sheet_submitted", {
          sceneId: scene.id,
          ...mediaTaskLog("prism", providerTaskId),
          references: referenceImageUrls.length,
          // The brief was expanded by the language model before the image was
          // drawn, so both suppliers belong on the line.
          ...authoringModelLog(),
        });
        return { providerTaskId, submitted: true };
      }

      const task = await getTask(payload.providerTaskId);
      const taskLog = mediaTaskLog("prism", payload.providerTaskId, task);
      if (task.status === "pending") {
        if (payload.polls >= MAX_POLLS) {
          throw new PermanentJobError(
            "UGC_SCENE_GENERATION_TIMEOUT",
            "The provider did not finish the scene sheet in time.",
          );
        }
        await context.scheduleContinuation(
          { ...payload, polls: payload.polls + 1 },
          POLL_SECONDS,
        );
        return { waiting: true, polls: payload.polls + 1 };
      }
      if (task.status === "failed" || !task.outputUrl) {
        context.log("scene_sheet_failed", { sceneId: scene.id, ...taskLog });
        throw new PermanentJobError(
          "UGC_SCENE_GENERATION_FAILED",
          task.errorMessage ?? "The provider could not draw the scene sheet.",
        );
      }

      const sheetUrl = await archiveRemoteAsset({
        storeFile: storage(db),
        userId: scene.userId,
        reference: `scene-${scene.id}`,
        kind: "cover",
        sourceUrl: task.outputUrl,
      });
      await db
        .update(ugcScenes)
        .set({ sheetUrl, status: "ready", updatedAt: new Date() })
        .where(eq(ugcScenes.id, scene.id));
      await recordUsage(db, {
        userId: scene.userId,
        kind: "render",
        credits: CREDIT_COST.analysis,
        note: `scene ${scene.name}`,
      });
      context.log("scene_sheet_finished", {
        sceneId: scene.id,
        ...taskLog,
        sheetUrl,
      });
      return { sheetUrl };
    } catch (error) {
      if (error instanceof PermanentJobError || context.attempt > RETRY_LIMIT) {
        await db
          .update(ugcScenes)
          .set({ status: "failed", updatedAt: new Date() })
          .where(eq(ugcScenes.id, scene.id));
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
    localConcurrency: 3,
    groupConcurrency: 1,
  },
);
