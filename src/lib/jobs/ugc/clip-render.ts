import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { AppDatabase } from "@/database/client";
import { ugcClips, ugcProducts, ugcScripts, ugcTalents } from "@/database/ugc";
import {
  CLIP_SPEC,
  CREDIT_COST,
  MAX_RENDER_ATTEMPTS,
} from "@/lib/ugc/constants";
import {
  getTask,
  MediaProviderError,
  submitImage,
  submitVideo,
} from "@/lib/ugc/media/prism";
import { evaluateClipQuality } from "@/lib/ugc/qc";
import {
  archiveRemoteAsset,
  archiveSubtitleTrack,
  buildCoverPrompt,
  buildSubtitleTrack,
  buildVideoPrompt,
  type RenderSubject,
} from "@/lib/ugc/render";
import {
  createClipStorage,
  StorageUnavailableError,
  type ClipStorage,
} from "@/lib/ugc/storage";
import { recordUsage } from "@/lib/ugc/usage";
import {
  defineJob,
  PermanentJobError,
  type JobHandlerContext,
} from "../definition";

// pg-boss counts retries, not attempts, so one fewer than the attempt budget.
const RETRY_LIMIT = MAX_RENDER_ATTEMPTS - 1;
const POLL_INTERVALS = { cover: 8, video: 15 } as const;
const MAX_POLLS = { cover: 45, video: 80 } as const;

const payloadSchema = z
  .object({
    clipId: z.uuid(),
    userId: z.string().min(1),
    stage: z.enum(["cover", "video", "finalize"]),
    providerTaskId: z.string().optional(),
    coverUrl: z.string().optional(),
    videoUrl: z.string().optional(),
    polls: z.number().int().nonnegative().default(0),
  })
  .strict();

type RenderPayload = z.infer<typeof payloadSchema>;
type RenderContext = JobHandlerContext<RenderPayload>;

interface ClipContext {
  clip: typeof ugcClips.$inferSelect;
  script: typeof ugcScripts.$inferSelect;
  product: typeof ugcProducts.$inferSelect;
  talent: typeof ugcTalents.$inferSelect | null;
}

async function loadClip(
  db: AppDatabase,
  clipId: string,
  userId: string,
): Promise<ClipContext> {
  const [clip] = await db
    .select()
    .from(ugcClips)
    .where(and(eq(ugcClips.id, clipId), eq(ugcClips.userId, userId)));
  if (!clip) {
    throw new PermanentJobError(
      "UGC_CLIP_MISSING",
      "The clip was removed before it could be rendered.",
    );
  }

  const [script] = clip.scriptId
    ? await db.select().from(ugcScripts).where(eq(ugcScripts.id, clip.scriptId))
    : [];
  if (!script) {
    throw new PermanentJobError(
      "UGC_SCRIPT_MISSING",
      "The clip has no script to render.",
    );
  }

  const [product] = await db
    .select()
    .from(ugcProducts)
    .where(eq(ugcProducts.id, clip.productId));
  if (!product) {
    throw new PermanentJobError(
      "UGC_PRODUCT_MISSING",
      "The product behind this clip was removed.",
    );
  }

  const [talent] = clip.talentId
    ? await db.select().from(ugcTalents).where(eq(ugcTalents.id, clip.talentId))
    : [];

  return { clip, script, product, talent: talent ?? null };
}

function toSubject(context: ClipContext): RenderSubject {
  return {
    productName: context.product.name,
    appearance: context.product.facts?.appearance ?? "",
    market: context.clip.market,
    locale: context.clip.locale,
    template: context.clip.template,
    talentPrompt: context.talent
      ? (context.talent.prompt ?? context.talent.name)
      : null,
  };
}

/**
 * Missing object storage is a deployment fault, not a transient one: retrying it
 * would burn the clip's attempt budget without ever changing the outcome.
 */
function clipStorage(db: AppDatabase): ClipStorage {
  try {
    return createClipStorage(db);
  } catch (error) {
    if (error instanceof StorageUnavailableError) {
      throw new PermanentJobError("UGC_STORAGE_UNAVAILABLE", error.message);
    }
    throw error;
  }
}

async function failClip(
  db: AppDatabase,
  clipId: string,
  reason: string,
): Promise<void> {
  await db
    .update(ugcClips)
    .set({ status: "failed", failureReason: reason, updatedAt: new Date() })
    .where(eq(ugcClips.id, clipId));
}

export const clipRenderJob = defineJob(
  "ugc.clip.render",
  payloadSchema,
  async (payload: RenderPayload, context) => {
    const db = context.db;
    const loaded = await loadClip(db, payload.clipId, payload.userId);

    if (await context.isCancelled()) {
      await db
        .update(ugcClips)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(eq(ugcClips.id, loaded.clip.id));
      return { cancelled: true };
    }

    try {
      return await runStage(payload, context, loaded);
    } catch (error) {
      const permanent =
        error instanceof PermanentJobError ||
        (error instanceof MediaProviderError && !error.retryable);
      const retriesLeft = context.attempt <= RETRY_LIMIT;
      if (permanent || !retriesLeft) {
        await failClip(
          db,
          loaded.clip.id,
          error instanceof Error ? error.message : "Rendering failed.",
        );
      }
      throw error;
    }
  },
  {
    queue: {
      retryLimit: RETRY_LIMIT,
      retryDelay: 20,
      retryBackoff: true,
      expireInSeconds: 10 * 60,
    },
    localConcurrency: 2,
    groupConcurrency: 1,
  },
);

async function runStage(
  payload: RenderPayload,
  context: RenderContext,
  loaded: ClipContext,
) {
  const db = context.db;

  if (payload.stage === "finalize") {
    return finalize(payload, context, loaded);
  }

  const stage = payload.stage;
  await context.updateProgress({ step: stage, polls: payload.polls });

  if (!payload.providerTaskId) {
    const providerTaskId = await submitStage(stage, payload, loaded, context);
    await db
      .update(ugcClips)
      .set({
        status: "rendering",
        attempts: loaded.clip.attempts + (stage === "cover" ? 1 : 0),
        updatedAt: new Date(),
      })
      .where(eq(ugcClips.id, loaded.clip.id));
    await context.scheduleContinuation(
      { ...payload, providerTaskId, polls: 0 },
      POLL_INTERVALS[stage],
    );
    return { stage, providerTaskId, submitted: true };
  }

  const task = await getTask(payload.providerTaskId);

  if (task.status === "pending") {
    if (payload.polls >= MAX_POLLS[stage]) {
      throw new PermanentJobError(
        "UGC_RENDER_TIMEOUT",
        `The provider did not finish the ${stage} step in time.`,
      );
    }
    await context.scheduleContinuation(
      { ...payload, polls: payload.polls + 1 },
      POLL_INTERVALS[stage],
    );
    return { stage, waiting: true, polls: payload.polls + 1 };
  }

  if (task.status === "failed" || !task.outputUrl) {
    throw new PermanentJobError(
      "UGC_RENDER_FAILED",
      task.errorMessage ?? `The provider could not produce the ${stage}.`,
    );
  }

  const storeFile = clipStorage(db);
  const archived = await archiveRemoteAsset({
    storeFile,
    userId: loaded.clip.userId,
    reference: loaded.clip.reference,
    kind: stage,
    sourceUrl: task.outputUrl,
  });

  if (stage === "cover") {
    await db
      .update(ugcClips)
      .set({ coverUrl: archived, updatedAt: new Date() })
      .where(eq(ugcClips.id, loaded.clip.id));
    await context.scheduleContinuation(
      {
        clipId: payload.clipId,
        userId: payload.userId,
        stage: "video",
        coverUrl: task.outputUrl,
        polls: 0,
      },
      1,
    );
    return { stage, coverUrl: archived };
  }

  const durationMs = durationFrom(task.extra);
  await db
    .update(ugcClips)
    .set({
      videoUrl: archived,
      status: "reviewing",
      durationMs: durationMs ?? loaded.clip.durationMs,
      updatedAt: new Date(),
    })
    .where(eq(ugcClips.id, loaded.clip.id));
  await context.scheduleContinuation(
    {
      clipId: payload.clipId,
      userId: payload.userId,
      stage: "finalize",
      videoUrl: archived,
      polls: 0,
    },
    1,
  );
  return { stage, videoUrl: archived, durationMs };
}

async function submitStage(
  stage: "cover" | "video",
  payload: RenderPayload,
  loaded: ClipContext,
  context: RenderContext,
): Promise<string> {
  const subject = toSubject(loaded);
  // A stable request id makes a provider submission idempotent across retries.
  const requestId = `${context.taskRunId}:${stage}`;

  if (stage === "cover") {
    const references = [
      loaded.talent?.imageUrl,
      ...loaded.product.images.slice(0, 2),
    ].filter((url): url is string => Boolean(url));
    return submitImage({
      prompt: buildCoverPrompt(subject, loaded.script.beats[0]),
      referenceUrls: references,
      aspectRatio: CLIP_SPEC.aspectRatio,
      requestId,
    });
  }

  return submitVideo({
    prompt: buildVideoPrompt(subject, loaded.script.beats),
    referenceUrl: payload.coverUrl,
    durationSeconds: CLIP_SPEC.durationSeconds,
    aspectRatio: CLIP_SPEC.aspectRatio,
    requestId,
  });
}

function durationFrom(extra: Record<string, unknown> | null): number | null {
  const value = extra?.duration ?? extra?.duration_ms;
  if (typeof value !== "number") return null;
  return value > 1000 ? Math.round(value) : Math.round(value * 1000);
}

async function finalize(
  payload: RenderPayload,
  context: RenderContext,
  loaded: ClipContext,
) {
  const db = context.db;
  await context.updateProgress({ step: "quality_gate" });

  const storeFile = clipStorage(db);
  const subtitleUrl = await archiveSubtitleTrack({
    storeFile,
    userId: loaded.clip.userId,
    reference: loaded.clip.reference,
    content: buildSubtitleTrack(loaded.script.beats),
  });

  const durationMs = loaded.clip.durationMs ?? CLIP_SPEC.durationSeconds * 1000;
  const quality = evaluateClipQuality({
    locale: loaded.clip.locale,
    durationMs,
    script: {
      voiceover: loaded.script.voiceover,
      captions: loaded.script.captions,
    },
    hasTalentReference: Boolean(loaded.talent?.imageUrl),
  });

  await db
    .update(ugcClips)
    .set({
      status: quality.passed ? "ready" : "failed",
      failureReason: quality.passed
        ? null
        : quality.checks
            .filter((check) => !check.passed)
            .map((check) => check.detail)
            .join(" "),
      subtitleUrl,
      durationMs,
      quality,
      publishCaption: loaded.script.publishCaption,
      updatedAt: new Date(),
    })
    .where(eq(ugcClips.id, loaded.clip.id));

  await recordUsage(db, {
    userId: loaded.clip.userId,
    kind: loaded.clip.regeneratedFrom
      ? "regenerate"
      : loaded.clip.attempts > 1
        ? "retry"
        : "render",
    credits: CREDIT_COST.render,
    batchId: loaded.clip.batchId,
    clipId: loaded.clip.id,
    note: loaded.clip.reference,
  });

  return { reference: loaded.clip.reference, passed: quality.passed };
}
