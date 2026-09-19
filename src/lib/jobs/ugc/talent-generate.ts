import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { AppDatabase } from "@/database/client";
import { ugcTalents } from "@/database/ugc";
import { composeTalentImagePrompt } from "@/lib/ugc/authoring";
import {
  CREDIT_COST,
  PRISM_MEDIA,
  REFERENCE_ASPECT_RATIO,
} from "@/lib/ugc/constants";
import { getTask, submitImage } from "@/lib/ugc/media/prism";
import { authoringModelLog } from "@/lib/ugc/model";
import { mediaTaskLog } from "@/lib/ugc/media/task-log";
import { archiveRemoteAsset, buildTalentSheetPrompt } from "@/lib/ugc/render";
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

/**
 * Expands the brief into one identity, then draws the reference sheet for it:
 * a single square image of four panels showing the same person square to
 * camera, turned, at full length, and in close detail. Drawing them together
 * is what keeps them the same person — four separate draws would each be free
 * to reinterpret the face.
 */
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
    if (talent.status === "ready" && talent.sheetUrl) {
      return { sheetUrl: talent.sheetUrl };
    }

    try {
      if (!payload.providerTaskId) {
        const referenceImageUrls = await resolveReferenceUrls(
          db,
          talent.userId,
          talent.referenceImages,
        );
        const briefStartedAt = Date.now();
        const identityPrompt =
          talent.prompt ??
          (await composeTalentImagePrompt({
            name: talent.name,
            description: talent.description,
            referenceImageUrls,
          }));

        context.log("talent_brief_expanded", {
          talentId: talent.id,
          ...authoringModelLog(),
          reused: Boolean(talent.prompt),
          characters: identityPrompt.length,
          elapsedMs: Date.now() - briefStartedAt,
        });

        await db
          .update(ugcTalents)
          .set({
            prompt: identityPrompt,
            status: "generating",
            updatedAt: new Date(),
          })
          .where(eq(ugcTalents.id, talent.id));

        const providerTaskId = await submitImage({
          prompt: buildTalentSheetPrompt(
            identityPrompt,
            referenceImageUrls.length > 0,
          ),
          referenceUrls: referenceImageUrls,
          aspectRatio: REFERENCE_ASPECT_RATIO,
          imageSize: PRISM_MEDIA.sheetImageSize,
          requestId: context.taskRunId,
        });
        await context.updateProgress({ step: "drawing_talent" });
        await context.scheduleContinuation(
          { ...payload, providerTaskId, polls: 0 },
          POLL_SECONDS,
        );
        context.log("talent_sheet_submitted", {
          talentId: talent.id,
          ...mediaTaskLog("prism", providerTaskId),
          references: referenceImageUrls.length,
        });
        return { providerTaskId, submitted: true };
      }

      const task = await getTask(payload.providerTaskId);
      const taskLog = mediaTaskLog("prism", payload.providerTaskId, task);
      if (task.status === "pending") {
        context.log("talent_sheet_pending", {
          talentId: talent.id,
          ...taskLog,
          polls: payload.polls + 1,
        });
        if (payload.polls >= MAX_POLLS) {
          throw new PermanentJobError(
            "UGC_TALENT_GENERATION_TIMEOUT",
            "The provider did not finish the talent sheet in time.",
          );
        }
        await context.scheduleContinuation(
          { ...payload, polls: payload.polls + 1 },
          POLL_SECONDS,
        );
        return { waiting: true, polls: payload.polls + 1 };
      }
      if (task.status === "failed" || !task.outputUrl) {
        context.log("talent_sheet_failed", { talentId: talent.id, ...taskLog });
        throw new PermanentJobError(
          "UGC_TALENT_GENERATION_FAILED",
          task.errorMessage ?? "The provider could not draw the talent sheet.",
        );
      }

      const sheetUrl = await archiveRemoteAsset({
        storeFile: storage(db),
        userId: talent.userId,
        reference: `talent-${talent.id}`,
        kind: "cover",
        sourceUrl: task.outputUrl,
      });
      await db
        .update(ugcTalents)
        .set({ sheetUrl, status: "ready", updatedAt: new Date() })
        .where(eq(ugcTalents.id, talent.id));
      await recordUsage(db, {
        userId: talent.userId,
        kind: "render",
        credits: CREDIT_COST.analysis,
        note: `talent ${talent.name}`,
      });
      context.log("talent_sheet_finished", {
        talentId: talent.id,
        ...taskLog,
        sheetUrl,
      });
      return { sheetUrl };
    } catch (error) {
      if (error instanceof PermanentJobError || context.attempt > RETRY_LIMIT) {
        await db
          .update(ugcTalents)
          .set({ status: "failed", updatedAt: new Date() })
          .where(eq(ugcTalents.id, talent.id));
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
