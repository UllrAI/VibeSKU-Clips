import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { AppDatabase } from "@/database/client";
import { ugcTalents } from "@/database/ugc";
import { composeTalentImagePrompt } from "@/lib/ugc/authoring";
import { CREDIT_COST, DEFAULT_VIDEO_SETTINGS } from "@/lib/ugc/constants";
import { getTask, submitImage } from "@/lib/ugc/media/prism";
import { archiveRemoteAsset } from "@/lib/ugc/render";
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
    talentId: z.uuid(),
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

async function markFailed(db: AppDatabase, talentId: string): Promise<void> {
  await db
    .update(ugcTalents)
    .set({ status: "failed", updatedAt: new Date() })
    .where(eq(ugcTalents.id, talentId));
}

/** Expands the brief, draws one portrait through Prism, and archives it. */
export const talentGenerateJob = defineJob(
  "ugc.talent.generate",
  payloadSchema,
  async (payload, context) => {
    const db = context.db;
    const [talent] = await db
      .select()
      .from(ugcTalents)
      .where(
        and(
          eq(ugcTalents.id, payload.talentId),
          eq(ugcTalents.userId, payload.userId),
        ),
      );
    if (!talent || talent.archived) return null;
    if (talent.status === "ready" && talent.imageUrl) {
      return { imageUrl: talent.imageUrl };
    }

    try {
      if (!payload.providerTaskId) {
        const referenceImageUrls = await resolveReferenceUrls(
          db,
          talent.userId,
          talent.referenceImages,
        );
        const prompt =
          talent.prompt ??
          (await composeTalentImagePrompt({
            name: talent.name,
            description: talent.description,
            referenceImageUrls,
          }));

        await db
          .update(ugcTalents)
          .set({ prompt, status: "generating", updatedAt: new Date() })
          .where(eq(ugcTalents.id, talent.id));

        const providerTaskId = await submitImage({
          prompt,
          referenceUrls: referenceImageUrls,
          aspectRatio: DEFAULT_VIDEO_SETTINGS.aspectRatio,
          requestId: context.taskRunId,
        });
        await context.updateProgress({ step: "drawing_talent" });
        await context.scheduleContinuation(
          { ...payload, providerTaskId, polls: 0 },
          POLL_SECONDS,
        );
        context.log("talent_image_submitted", {
          talentId: talent.id,
          providerTaskId,
          references: referenceImageUrls.length,
        });
        return { providerTaskId, submitted: true };
      }

      const task = await getTask(payload.providerTaskId);
      if (task.status === "pending") {
        if (payload.polls >= MAX_POLLS) {
          throw new PermanentJobError(
            "UGC_TALENT_GENERATION_TIMEOUT",
            "The provider did not finish the talent image in time.",
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
          "UGC_TALENT_GENERATION_FAILED",
          task.errorMessage ?? "The provider could not draw the talent image.",
        );
      }

      const imageUrl = await archiveRemoteAsset({
        storeFile: storage(db),
        userId: talent.userId,
        reference: `talent-${talent.id}`,
        kind: "cover",
        sourceUrl: task.outputUrl,
      });
      await db
        .update(ugcTalents)
        .set({ imageUrl, status: "ready", updatedAt: new Date() })
        .where(eq(ugcTalents.id, talent.id));
      await recordUsage(db, {
        userId: talent.userId,
        kind: "render",
        credits: CREDIT_COST.analysis,
        note: `talent ${talent.name}`,
      });
      context.log("talent_image_finished", {
        talentId: talent.id,
        providerTaskId: payload.providerTaskId,
      });
      return { imageUrl };
    } catch (error) {
      if (error instanceof PermanentJobError || context.attempt > RETRY_LIMIT) {
        await markFailed(db, talent.id);
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
