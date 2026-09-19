import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { AppDatabase } from "@/database/client";
import { ugcTalents } from "@/database/ugc";
import { composeTalentImagePrompt } from "@/lib/ugc/authoring";
import {
  CREDIT_COST,
  REFERENCE_ASPECT_RATIO,
  TALENT_ANGLES,
} from "@/lib/ugc/constants";
import {
  createPrismRequestId,
  getTask,
  submitImage,
} from "@/lib/ugc/media/prism";
import { archiveRemoteAsset, buildTalentViewPrompt } from "@/lib/ugc/render";
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
 * enough to fix the person, and more only crowds the request. */
const MAX_VIEW_REFERENCES = 2;

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
 * A talent with at least its portrait is a usable performer; only the
 * remaining viewpoints were lost. Failing the whole record would discard an
 * image already paid for and leave the operator nothing to select.
 */
async function markGaveUp(
  db: AppDatabase,
  talent: { id: string; views: unknown[] },
): Promise<void> {
  await db
    .update(ugcTalents)
    .set({
      status: talent.views.length > 0 ? "ready" : "failed",
      updatedAt: new Date(),
    })
    .where(eq(ugcTalents.id, talent.id));
}

/**
 * Expands the brief into one identity, then photographs that person from each
 * angle in turn: the portrait that settles who they are, the full-length shot
 * that settles how clothes fall on them, the turned head that settles the
 * structure of the face, and the close detail that settles hair, hands, and
 * skin. Every view after the first takes the archived ones as its reference,
 * so the face cannot drift between them.
 *
 * The row carries the progress, so a restart resumes at the view it was on
 * rather than paying for the finished ones again.
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

    const angle = TALENT_ANGLES[talent.views.length];
    if (!angle) {
      if (talent.status !== "ready") {
        await db
          .update(ugcTalents)
          .set({ status: "ready", updatedAt: new Date() })
          .where(eq(ugcTalents.id, talent.id));
      }
      return { views: talent.views.length };
    }

    try {
      if (!payload.providerTaskId) {
        const drawnViews = talent.views.slice(0, MAX_VIEW_REFERENCES);
        const referenceImageUrls = await resolveReferenceUrls(
          db,
          talent.userId,
          drawnViews.length
            ? drawnViews.map((view) => view.imageUrl)
            : talent.referenceImages,
        );
        const identityPrompt =
          talent.prompt ??
          (await composeTalentImagePrompt({
            name: talent.name,
            description: talent.description,
            referenceImageUrls,
          }));

        await db
          .update(ugcTalents)
          .set({
            prompt: identityPrompt,
            status: "generating",
            updatedAt: new Date(),
          })
          .where(eq(ugcTalents.id, talent.id));

        const providerTaskId = await submitImage({
          // The portrait is the identity prompt itself: it already describes
          // its own viewpoint, and that framing is what makes the person read
          // as a real phone photograph rather than a studio headshot.
          prompt:
            angle === "portrait"
              ? identityPrompt
              : buildTalentViewPrompt(
                  identityPrompt,
                  angle,
                  drawnViews.length > 0,
                ),
          referenceUrls: referenceImageUrls,
          aspectRatio: REFERENCE_ASPECT_RATIO,
          // Prism keys submissions on request_id, so each view needs its own
          // or the second draw is handed the first one back.
          requestId: createPrismRequestId(context.taskRunId, angle),
        });
        await context.updateProgress({ step: "drawing_talent", angle });
        await context.scheduleContinuation(
          { ...payload, providerTaskId, polls: 0 },
          POLL_SECONDS,
        );
        context.log("talent_view_submitted", {
          talentId: talent.id,
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
        reference: `talent-${talent.id}-${angle}`,
        kind: "cover",
        sourceUrl: task.outputUrl,
      });
      const views = [...talent.views, { angle, imageUrl }];
      const complete = views.length >= TALENT_ANGLES.length;
      await db
        .update(ugcTalents)
        .set({
          views,
          // The portrait already makes the talent selectable; the rest only
          // add viewpoints to them.
          status: complete ? "ready" : "generating",
          updatedAt: new Date(),
        })
        .where(eq(ugcTalents.id, talent.id));
      await recordUsage(db, {
        userId: talent.userId,
        kind: "render",
        credits: CREDIT_COST.analysis,
        note: `talent ${talent.name}`,
      });
      context.log("talent_view_finished", {
        talentId: talent.id,
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
