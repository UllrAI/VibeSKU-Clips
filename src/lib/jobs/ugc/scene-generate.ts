import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { AppDatabase } from "@/database/client";
import { ugcScenes } from "@/database/ugc";
import { composeSceneImagePrompt } from "@/lib/ugc/authoring";
import {
  CREDIT_COST,
  DEFAULT_VIDEO_SETTINGS,
  SCENE_ANGLES,
} from "@/lib/ugc/constants";
import {
  createPrismRequestId,
  getTask,
  submitImage,
} from "@/lib/ugc/media/prism";
import { archiveRemoteAsset, buildSceneViewPrompt } from "@/lib/ugc/render";
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

/** Views after the first are drawn against the ones already archived; two are
 * enough to fix the place, and more only crowds the request. */
const MAX_VIEW_REFERENCES = 2;

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
 * A scene with at least one view is a usable location; only the remaining
 * viewpoints were lost. Failing the whole record would discard an image
 * already paid for and leave the operator nothing to select.
 */
async function markGaveUp(
  db: AppDatabase,
  scene: { id: string; views: unknown[] },
): Promise<void> {
  await db
    .update(ugcScenes)
    .set({
      status: scene.views.length > 0 ? "ready" : "failed",
      updatedAt: new Date(),
    })
    .where(eq(ugcScenes.id, scene.id));
}

/**
 * Expands the brief into one description of a place, then photographs that
 * place from each angle in turn. Every view after the first takes the archived
 * ones as its reference, so the three read as one room rather than three.
 *
 * The row carries the progress, so a restart resumes at the view it was on
 * rather than paying for the finished ones again.
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

    const angle = SCENE_ANGLES[scene.views.length];
    if (!angle) {
      if (scene.status !== "ready") {
        await db
          .update(ugcScenes)
          .set({ status: "ready", updatedAt: new Date() })
          .where(eq(ugcScenes.id, scene.id));
      }
      return { views: scene.views.length };
    }

    try {
      if (!payload.providerTaskId) {
        const drawnViews = scene.views.slice(-MAX_VIEW_REFERENCES);
        const referenceImageUrls = await resolveReferenceUrls(
          db,
          scene.userId,
          drawnViews.length
            ? drawnViews.map((view) => view.imageUrl)
            : scene.referenceImages,
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
          prompt: buildSceneViewPrompt(
            locationPrompt,
            angle,
            drawnViews.length > 0,
          ),
          referenceUrls: referenceImageUrls,
          aspectRatio: DEFAULT_VIDEO_SETTINGS.aspectRatio,
          // Prism keys submissions on request_id, so each view needs its own
          // or the second draw is handed the first one back.
          requestId: createPrismRequestId(context.taskRunId, angle),
        });
        await context.updateProgress({ step: "drawing_scene", angle });
        await context.scheduleContinuation(
          { ...payload, providerTaskId, polls: 0 },
          POLL_SECONDS,
        );
        context.log("scene_view_submitted", {
          sceneId: scene.id,
          providerTaskId,
          angle,
          references: referenceImageUrls.length,
        });
        return { providerTaskId, angle, submitted: true };
      }

      const task = await getTask(payload.providerTaskId);
      if (task.status === "pending") {
        if (payload.polls >= MAX_POLLS) {
          throw new PermanentJobError(
            "UGC_SCENE_GENERATION_TIMEOUT",
            "The provider did not finish the scene image in time.",
          );
        }
        await context.scheduleContinuation(
          { ...payload, polls: payload.polls + 1 },
          POLL_SECONDS,
        );
        return { waiting: true, polls: payload.polls + 1 };
      }
      if (task.status === "failed" || !task.outputUrl) {
        throw new PermanentJobError(
          "UGC_SCENE_GENERATION_FAILED",
          task.errorMessage ?? "The provider could not draw the scene image.",
        );
      }

      const imageUrl = await archiveRemoteAsset({
        storeFile: storage(db),
        userId: scene.userId,
        reference: `scene-${scene.id}-${angle}`,
        kind: "cover",
        sourceUrl: task.outputUrl,
      });
      const views = [...scene.views, { angle, imageUrl }];
      const complete = views.length >= SCENE_ANGLES.length;
      await db
        .update(ugcScenes)
        .set({
          views,
          // The first view already makes the scene selectable; the rest only
          // add viewpoints to it.
          status: complete ? "ready" : "generating",
          updatedAt: new Date(),
        })
        .where(eq(ugcScenes.id, scene.id));
      await recordUsage(db, {
        userId: scene.userId,
        kind: "render",
        credits: CREDIT_COST.analysis,
        note: `scene ${scene.name}`,
      });
      context.log("scene_view_finished", {
        sceneId: scene.id,
        providerTaskId: payload.providerTaskId,
        angle,
      });

      if (!complete) {
        // The view is archived, so the next one can reference it.
        await context.scheduleContinuation(
          { ...payload, providerTaskId: undefined, polls: 0 },
          1,
        );
      }
      return { angle, imageUrl, views: views.length };
    } catch (error) {
      if (error instanceof PermanentJobError || context.attempt > RETRY_LIMIT) {
        await markGaveUp(db, scene);
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
