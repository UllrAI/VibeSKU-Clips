"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/database";
import {
  ugcProducts,
  ugcScripts,
  ugcTalents,
  ugcWorkFrames,
  ugcWorks,
} from "@/database/ugc";
import { requireAuth } from "@/lib/auth/permissions";
import { talentGenerateJob } from "@/lib/jobs/ugc/talent-generate";
import { workScriptJob } from "@/lib/jobs/ugc/work-script";
import { workStoryboardJob } from "@/lib/jobs/ugc/work-storyboard";
import { workVideoJob } from "@/lib/jobs/ugc/work-video";
import { serverJobQueue } from "@/lib/jobs/server";
import { createBackgroundTask } from "@/lib/tasks/service";
import {
  SCRIPT_TEMPLATES,
  VIDEO_ASPECT_RATIOS,
  VIDEO_MODELS,
  VIDEO_MODES,
  VIDEO_RESOLUTIONS,
} from "./constants";
import { isActiveVideoConfiguration } from "./media/video-provider";
import { talentScopeKey, workScopeKey } from "./scope";
import type { ActionResult } from "./types";

const setupSchema = z
  .object({
    productId: z.uuid(),
    talentId: z.uuid().optional(),
    randomTalent: z.boolean().default(false),
    locale: z.string().trim().min(2).max(16),
    market: z.string().trim().min(2).max(16),
    template: z.enum(SCRIPT_TEMPLATES),
    videoMode: z.enum(VIDEO_MODES).default("one_take"),
    videoModel: z.enum(VIDEO_MODELS).default("h3"),
    aspectRatio: z.enum(VIDEO_ASPECT_RATIOS).default("9:16"),
    resolution: z.enum(VIDEO_RESOLUTIONS).default("720p"),
  })
  .refine(
    (input) => isActiveVideoConfiguration(input.videoModel, input.resolution),
    { path: ["resolution"] },
  )
  .refine((input) => !(input.randomTalent && input.talentId), {
    path: ["talentId"],
  });

const RANDOM_TALENT_PROFILES = [
  "A confident adult creator in their late twenties, warm and conversational, with natural everyday styling",
  "An energetic adult creator in their thirties, approachable and expressive, with clean casual styling",
  "A calm adult creator in their forties, trustworthy and precise, with understated modern styling",
  "A friendly adult creator in their late twenties, playful but credible, with relaxed lifestyle styling",
  "A polished adult creator in their thirties, direct and upbeat, with contemporary commercial styling",
] as const;

async function resolveTalentSelection(
  userId: string,
  selection: {
    talentId?: string;
    randomTalent: boolean;
    locale: string;
    market: string;
  },
): Promise<string | null | undefined> {
  if (selection.randomTalent) {
    const profile =
      RANDOM_TALENT_PROFILES[
        Math.floor(Math.random() * RANDOM_TALENT_PROFILES.length)
      ];
    const description = `${profile}. Create a fictional adult suitable for ${selection.market}; the performance language is ${selection.locale}. Do not resemble a real public figure.`;
    const [talent] = await db
      .insert(ugcTalents)
      .values({
        userId,
        name: `AI Talent ${crypto.randomUUID().slice(0, 4).toUpperCase()}`,
        description,
        referenceImages: [],
        status: "generating",
      })
      .returning();
    await createBackgroundTask({
      db,
      queue: serverJobQueue,
      definition: talentGenerateJob,
      scopeKey: talentScopeKey(userId, talent.id),
      payload: { talentId: talent.id, userId, polls: 0 },
      idempotencyKey: `${talent.id}:image:${crypto.randomUUID()}`,
    });
    return talent.id;
  }
  if (!selection.talentId) return null;

  const [talent] = await db
    .select({ id: ugcTalents.id })
    .from(ugcTalents)
    .where(
      and(
        eq(ugcTalents.id, selection.talentId),
        eq(ugcTalents.userId, userId),
        eq(ugcTalents.archived, false),
        eq(ugcTalents.status, "ready"),
        isNotNull(ugcTalents.imageUrl),
      ),
    );
  return talent?.id;
}

async function loadOwnedWork(workId: string, userId: string) {
  const [work] = await db
    .select()
    .from(ugcWorks)
    .where(and(eq(ugcWorks.id, workId), eq(ugcWorks.userId, userId)));
  return work ?? null;
}

/**
 * Hands the script step to the worker. Creating a work and re-running a failed
 * script step are the same request from here down, so they share this.
 */
async function enqueueScript(workId: string, userId: string): Promise<void> {
  const { taskRun } = await createBackgroundTask({
    db,
    queue: serverJobQueue,
    definition: workScriptJob,
    scopeKey: workScopeKey(userId, workId),
    payload: { workId, userId },
    idempotencyKey: `${workId}:script:${Date.now()}`,
  });

  await db
    .update(ugcWorks)
    .set({
      step: "script",
      stepStatus: "running",
      scriptId: null,
      taskRunId: taskRun.id,
      updatedAt: new Date(),
    })
    .where(eq(ugcWorks.id, workId));
}

/**
 * Starts a clip from a product that already exists. Everything the script
 * needs is answered here, so a work is never created in a state where the
 * operator has to be told to go and fetch something.
 *
 * A product that has already been read goes straight to writing; one still
 * being read stops on the product step, where its facts can be checked before
 * anything is spent on them.
 */
export async function createWork(
  input: z.infer<typeof setupSchema>,
): Promise<ActionResult> {
  const user = await requireAuth();
  const parsed = setupSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" };

  const [product] = await db
    .select({ name: ugcProducts.name, facts: ugcProducts.facts })
    .from(ugcProducts)
    .where(
      and(
        eq(ugcProducts.id, parsed.data.productId),
        eq(ugcProducts.userId, user.id),
      ),
    );
  if (!product) return { ok: false, code: "not_found" };

  const talentId = await resolveTalentSelection(user.id, parsed.data);
  if (talentId === undefined) return { ok: false, code: "not_found" };

  const [work] = await db
    .insert(ugcWorks)
    .values({
      userId: user.id,
      title: product.name,
      productId: parsed.data.productId,
      talentId,
      locale: parsed.data.locale,
      market: parsed.data.market,
      template: parsed.data.template,
      videoMode: parsed.data.videoMode,
      videoModel: parsed.data.videoModel,
      aspectRatio: parsed.data.aspectRatio,
      resolution: parsed.data.resolution,
    })
    .returning();

  if (product.facts) await enqueueScript(work.id, user.id);

  revalidatePath("/dashboard/works");
  return { ok: true, id: work.id };
}

export async function deleteWork(workId: string): Promise<ActionResult> {
  const user = await requireAuth();
  await db
    .delete(ugcWorks)
    .where(and(eq(ugcWorks.id, workId), eq(ugcWorks.userId, user.id)));
  revalidatePath("/dashboard/works");
  return { ok: true };
}

/** Records the product step's choices without starting anything downstream. */
export async function setWorkSetup(
  workId: string,
  input: z.infer<typeof setupSchema>,
): Promise<ActionResult> {
  const user = await requireAuth();
  const parsed = setupSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" };
  if (!(await loadOwnedWork(workId, user.id))) {
    return { ok: false, code: "not_found" };
  }

  const [product] = await db
    .select({ id: ugcProducts.id })
    .from(ugcProducts)
    .where(
      and(
        eq(ugcProducts.id, parsed.data.productId),
        eq(ugcProducts.userId, user.id),
      ),
    );
  if (!product) return { ok: false, code: "not_found" };

  const talentId = await resolveTalentSelection(user.id, parsed.data);
  if (talentId === undefined) return { ok: false, code: "not_found" };

  await db
    .update(ugcWorks)
    .set({
      productId: parsed.data.productId,
      talentId,
      locale: parsed.data.locale,
      market: parsed.data.market,
      template: parsed.data.template,
      videoMode: parsed.data.videoMode,
      videoModel: parsed.data.videoModel,
      aspectRatio: parsed.data.aspectRatio,
      resolution: parsed.data.resolution,
      step: "product",
      stepStatus: "idle",
      updatedAt: new Date(),
    })
    .where(eq(ugcWorks.id, workId));

  revalidatePath(`/dashboard/works/${workId}`);
  return { ok: true, id: workId };
}

/**
 * Accepts the product and asks for a script. This is the first step that
 * spends anything, so it only ever runs from an explicit confirmation.
 */
export async function startWorkScript(workId: string): Promise<ActionResult> {
  const user = await requireAuth();
  const work = await loadOwnedWork(workId, user.id);
  if (!work) return { ok: false, code: "not_found" };
  if (!work.productId) return { ok: false, code: "work_needs_product" };

  const [product] = await db
    .select({ facts: ugcProducts.facts })
    .from(ugcProducts)
    .where(eq(ugcProducts.id, work.productId));
  if (!product?.facts) return { ok: false, code: "product_not_read" };

  await enqueueScript(work.id, user.id);

  revalidatePath(`/dashboard/works/${workId}`);
  return { ok: true, id: workId };
}

const scriptEditSchema = z.object({
  title: z.string().trim().min(1).max(200),
  hook: z.string().trim().min(1).max(500),
  productionPrompt: z.string().trim().max(30_000),
  beats: z
    .array(
      z.object({
        start: z.number().min(0).max(15),
        end: z.number().min(0).max(15),
        shot: z.string().trim().min(1).max(2000),
        action: z.string().trim().min(1).max(4000),
        camera: z.string().trim().min(1).max(2000),
        voiceover: z.string().trim().max(1000),
      }),
    )
    .min(2)
    .max(6)
    .refine(
      (beats) =>
        beats.every(
          (beat, index) =>
            beat.end > beat.start &&
            Math.abs(beat.start - (index === 0 ? 0 : beats[index - 1]!.end)) <
              0.01,
        ) && Math.abs(beats.at(-1)!.end - 15) < 0.01,
    ),
  captions: z.array(z.string().trim().min(1).max(200)).max(8),
  publishCaption: z.string().trim().max(500).optional(),
});

/** Saves operator edits to the draft script without accepting it. */
export async function saveWorkScript(
  workId: string,
  input: z.infer<typeof scriptEditSchema>,
): Promise<ActionResult> {
  const user = await requireAuth();
  const parsed = scriptEditSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" };

  const work = await loadOwnedWork(workId, user.id);
  if (!work?.scriptId) return { ok: false, code: "not_found" };

  const voiceover = parsed.data.beats
    .map((beat) => beat.voiceover)
    .filter(Boolean)
    .join(" ");
  if (!voiceover || voiceover.length > 4000) {
    return { ok: false, code: "invalid_input" };
  }

  await db
    .update(ugcScripts)
    .set({
      title: parsed.data.title,
      hook: parsed.data.hook,
      productionPrompt: parsed.data.productionPrompt || null,
      beats: parsed.data.beats,
      voiceover,
      captions: parsed.data.captions,
      publishCaption: parsed.data.publishCaption || null,
      updatedAt: new Date(),
    })
    .where(
      and(eq(ugcScripts.id, work.scriptId), eq(ugcScripts.userId, user.id)),
    );

  revalidatePath(`/dashboard/works/${workId}`);
  return { ok: true, id: workId };
}

async function enqueueStoryboard(
  work: NonNullable<Awaited<ReturnType<typeof loadOwnedWork>>>,
  userId: string,
): Promise<void> {
  // A re-run starts from a clean storyboard rather than mixing old frames in.
  await db.delete(ugcWorkFrames).where(eq(ugcWorkFrames.workId, work.id));

  const { taskRun } = await createBackgroundTask({
    db,
    queue: serverJobQueue,
    definition: workStoryboardJob,
    scopeKey: workScopeKey(userId, work.id),
    payload: { workId: work.id, userId, frameIds: [], polls: 0 },
    idempotencyKey: `${work.id}:storyboard:${Date.now()}`,
  });

  await db
    .update(ugcWorks)
    .set({
      step: "storyboard",
      stepStatus: "running",
      taskRunId: taskRun.id,
      updatedAt: new Date(),
    })
    .where(eq(ugcWorks.id, work.id));
}

async function enqueueVideo(
  work: NonNullable<Awaited<ReturnType<typeof loadOwnedWork>>>,
  userId: string,
): Promise<void> {
  const { taskRun } = await createBackgroundTask({
    db,
    queue: serverJobQueue,
    definition: workVideoJob,
    scopeKey: workScopeKey(userId, work.id),
    payload: { workId: work.id, userId, polls: 0 },
    idempotencyKey: `${work.id}:video:${Date.now()}`,
  });

  await db
    .update(ugcWorks)
    .set({
      step: "video",
      stepStatus: "running",
      taskRunId: taskRun.id,
      updatedAt: new Date(),
    })
    .where(eq(ugcWorks.id, work.id));
}

/** Accepts the script and starts the selected video workflow. */
export async function startWorkFromScript(
  workId: string,
): Promise<ActionResult> {
  const user = await requireAuth();
  const work = await loadOwnedWork(workId, user.id);
  if (!work?.scriptId) return { ok: false, code: "not_found" };

  await db
    .update(ugcScripts)
    .set({ status: "ready", updatedAt: new Date() })
    .where(
      and(eq(ugcScripts.id, work.scriptId), eq(ugcScripts.status, "draft")),
    );

  if (work.videoMode === "storyboard") {
    await enqueueStoryboard(work, user.id);
  } else {
    await db.delete(ugcWorkFrames).where(eq(ugcWorkFrames.workId, work.id));
    await enqueueVideo(work, user.id);
  }

  revalidatePath(`/dashboard/works/${workId}`);
  return { ok: true, id: workId };
}

/** Draws or redraws the storyboard selected for this work. */
export async function startWorkStoryboard(
  workId: string,
): Promise<ActionResult> {
  const user = await requireAuth();
  const work = await loadOwnedWork(workId, user.id);
  if (!work?.scriptId || work.videoMode !== "storyboard") {
    return { ok: false, code: "not_found" };
  }

  await enqueueStoryboard(work, user.id);
  revalidatePath(`/dashboard/works/${workId}`);
  return { ok: true, id: workId };
}

const framePromptSchema = z.string().trim().min(1).max(2000);

/** Redraws one frame, optionally from reworded direction. */
export async function regenerateWorkFrame(
  frameId: string,
  prompt?: string,
): Promise<ActionResult> {
  const user = await requireAuth();
  const [frame] = await db
    .select({ id: ugcWorkFrames.id, workId: ugcWorkFrames.workId })
    .from(ugcWorkFrames)
    .innerJoin(ugcWorks, eq(ugcWorks.id, ugcWorkFrames.workId))
    .where(and(eq(ugcWorkFrames.id, frameId), eq(ugcWorks.userId, user.id)));
  if (!frame) return { ok: false, code: "not_found" };

  if (prompt !== undefined) {
    const parsed = framePromptSchema.safeParse(prompt);
    if (!parsed.success) return { ok: false, code: "invalid_input" };
    await db
      .update(ugcWorkFrames)
      .set({ prompt: parsed.data, updatedAt: new Date() })
      .where(eq(ugcWorkFrames.id, frame.id));
  }

  await db
    .update(ugcWorkFrames)
    .set({
      status: "pending",
      providerTaskId: null,
      failureReason: null,
      updatedAt: new Date(),
    })
    .where(eq(ugcWorkFrames.id, frame.id));

  const { taskRun } = await createBackgroundTask({
    db,
    queue: serverJobQueue,
    definition: workStoryboardJob,
    scopeKey: workScopeKey(user.id, frame.workId),
    payload: {
      workId: frame.workId,
      userId: user.id,
      frameIds: [frame.id],
      polls: 0,
    },
    idempotencyKey: `${frame.id}:redraw:${Date.now()}`,
  });

  await db
    .update(ugcWorks)
    .set({
      stepStatus: "running",
      taskRunId: taskRun.id,
      updatedAt: new Date(),
    })
    .where(eq(ugcWorks.id, frame.workId));

  revalidatePath(`/dashboard/works/${frame.workId}`);
  return { ok: true, id: frame.id };
}

/** Renders the clip, requiring accepted frames only in storyboard mode. */
export async function startWorkVideo(workId: string): Promise<ActionResult> {
  const user = await requireAuth();
  const work = await loadOwnedWork(workId, user.id);
  if (!work) return { ok: false, code: "not_found" };

  if (work.videoMode === "storyboard") {
    const ready = await db
      .select({ id: ugcWorkFrames.id })
      .from(ugcWorkFrames)
      .where(
        and(
          eq(ugcWorkFrames.workId, work.id),
          eq(ugcWorkFrames.status, "ready"),
        ),
      );
    if (ready.length === 0) return { ok: false, code: "work_needs_frames" };
  }

  await enqueueVideo(work, user.id);

  revalidatePath(`/dashboard/works/${workId}`);
  return { ok: true, id: workId };
}

/** Sends the work back a step so the operator can change their mind. */
export async function reopenWorkStep(
  workId: string,
  step: "product" | "script" | "storyboard",
): Promise<ActionResult> {
  const user = await requireAuth();
  const work = await loadOwnedWork(workId, user.id);
  if (!work) return { ok: false, code: "not_found" };
  if (step === "storyboard" && work.videoMode !== "storyboard") {
    return { ok: false, code: "invalid_input" };
  }

  await db
    .update(ugcWorks)
    .set({
      step,
      stepStatus: step === "product" ? "idle" : "review",
      updatedAt: new Date(),
    })
    .where(eq(ugcWorks.id, work.id));

  revalidatePath(`/dashboard/works/${workId}`);
  return { ok: true, id: workId };
}
