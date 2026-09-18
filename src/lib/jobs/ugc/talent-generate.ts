import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { AppDatabase } from "@/database/client";
import { ugcTalents } from "@/database/ugc";
import { composeTalentImagePrompt } from "@/lib/ugc/authoring";
import { CREDIT_COST, DEFAULT_VIDEO_SETTINGS } from "@/lib/ugc/constants";
import {
  createPrismRequestId,
  getTask,
  submitImage,
} from "@/lib/ugc/media/prism";
import {
  archiveRemoteAsset,
  buildTalentFullBodyPrompt,
} from "@/lib/ugc/render";
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
 * A talent that already has its portrait is usable; only the full-length draw
 * was lost. Failing the whole record would discard an image already paid for
 * and leave the operator nothing to select.
 */
async function markGaveUp(
  db: AppDatabase,
  talent: { id: string; imageUrl: string | null },
): Promise<void> {
  await db
    .update(ugcTalents)
    .set({
      status: talent.imageUrl ? "ready" : "failed",
      updatedAt: new Date(),
    })
    .where(eq(ugcTalents.id, talent.id));
}

/**
 * Expands the brief, then draws the talent twice: a portrait that settles who
 * the performer is, and a full-length shot that settles how clothes fall on
 * them. The second draw takes the first as its reference, so the face cannot
 * drift between the two.
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
    if (talent.status === "ready" && talent.imageUrl) {
      return { imageUrl: talent.imageUrl };
    }

    // Which of the two draws this run is for. The row carries the state, so a
    // restart resumes where it left off rather than paying for both again.
    const drawingFullBody = Boolean(talent.imageUrl);

    try {
      if (!payload.providerTaskId) {
        const referenceImageUrls = await resolveReferenceUrls(
          db,
          talent.userId,
          drawingFullBody ? [talent.imageUrl!] : talent.referenceImages,
        );
        const prompt = drawingFullBody
          ? buildTalentFullBodyPrompt(talent.prompt ?? talent.description)
          : (talent.prompt ??
            (await composeTalentImagePrompt({
              name: talent.name,
              description: talent.description,
              referenceImageUrls,
            })));

        await db
          .update(ugcTalents)
          .set({
            ...(drawingFullBody ? {} : { prompt }),
            status: "generating",
            updatedAt: new Date(),
          })
          .where(eq(ugcTalents.id, talent.id));

        const providerTaskId = await submitImage({
          prompt,
          referenceUrls: referenceImageUrls,
          aspectRatio: DEFAULT_VIDEO_SETTINGS.aspectRatio,
          // Prism keys submissions on request_id, so the second draw of the
          // same talent needs its own or it is handed the first one back.
          requestId: drawingFullBody
            ? createPrismRequestId(context.taskRunId, "full-body")
            : context.taskRunId,
        });
        await context.updateProgress({ step: "drawing_talent" });
        await context.scheduleContinuation(
          { ...payload, providerTaskId, polls: 0 },
          POLL_SECONDS,
        );
        context.log("talent_image_submitted", {
          talentId: talent.id,
          providerTaskId,
          fullBody: drawingFullBody,
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
        reference: drawingFullBody
          ? `talent-${talent.id}-full-body`
          : `talent-${talent.id}`,
        kind: "cover",
        sourceUrl: task.outputUrl,
      });
      await recordUsage(db, {
        userId: talent.userId,
        kind: "render",
        credits: CREDIT_COST.analysis,
        note: `talent ${talent.name}`,
      });
      context.log("talent_image_finished", {
        talentId: talent.id,
        providerTaskId: payload.providerTaskId,
        fullBody: drawingFullBody,
      });

      if (drawingFullBody) {
        await db
          .update(ugcTalents)
          .set({
            fullBodyUrl: imageUrl,
            status: "ready",
            updatedAt: new Date(),
          })
          .where(eq(ugcTalents.id, talent.id));
        return { imageUrl: talent.imageUrl, fullBodyUrl: imageUrl };
      }

      await db
        .update(ugcTalents)
        .set({ imageUrl, updatedAt: new Date() })
        .where(eq(ugcTalents.id, talent.id));
      // The portrait is archived, so the full-length draw can reference it.
      await context.scheduleContinuation(
        { ...payload, providerTaskId: undefined, polls: 0 },
        1,
      );
      return { imageUrl, drawingFullBody: true };
    } catch (error) {
      if (error instanceof PermanentJobError || context.attempt > RETRY_LIMIT) {
        await markGaveUp(db, talent);
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
