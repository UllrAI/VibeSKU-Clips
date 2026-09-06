"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/database";
import {
  ugcProducts,
  ugcScripts,
  ugcWorkFrames,
  ugcWorks,
} from "@/database/ugc";
import { requireAuth } from "@/lib/auth/permissions";
import { workScriptJob } from "@/lib/jobs/ugc/work-script";
import { workStoryboardJob } from "@/lib/jobs/ugc/work-storyboard";
import { workVideoJob } from "@/lib/jobs/ugc/work-video";
import { serverJobQueue } from "@/lib/jobs/server";
import { createBackgroundTask } from "@/lib/tasks/service";
import { SCRIPT_TEMPLATES } from "./constants";
import { workScopeKey } from "./scope";
import type { ActionResult } from "./types";

const setupSchema = z.object({
  productId: z.uuid(),
  talentId: z.uuid().optional(),
  locale: z.string().trim().min(2).max(16),
  market: z.string().trim().min(2).max(16),
  template: z.enum(SCRIPT_TEMPLATES),
});

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

  const [work] = await db
    .insert(ugcWorks)
    .values({
      userId: user.id,
      title: product.name,
      productId: parsed.data.productId,
      talentId: parsed.data.talentId ?? null,
      locale: parsed.data.locale,
      market: parsed.data.market,
      template: parsed.data.template,
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

  await db
    .update(ugcWorks)
    .set({
      productId: parsed.data.productId,
      talentId: parsed.data.talentId ?? null,
      locale: parsed.data.locale,
      market: parsed.data.market,
      template: parsed.data.template,
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
  voiceover: z.string().trim().min(1).max(4000),
  captions: z.array(z.string().trim().min(1).max(200)).min(1).max(8),
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

  await db
    .update(ugcScripts)
    .set({
      title: parsed.data.title,
      hook: parsed.data.hook,
      voiceover: parsed.data.voiceover,
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

/**
 * Accepts the script and asks for a storyboard. Accepting also promotes the
 * draft into the script library, because a script a person signed off on is
 * exactly what is worth reusing.
 */
export async function startWorkStoryboard(
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

  // A re-run starts from a clean storyboard rather than mixing old frames in.
  await db.delete(ugcWorkFrames).where(eq(ugcWorkFrames.workId, work.id));

  const { taskRun } = await createBackgroundTask({
    db,
    queue: serverJobQueue,
    definition: workStoryboardJob,
    scopeKey: workScopeKey(user.id, work.id),
    payload: { workId: work.id, userId: user.id, frameIds: [], polls: 0 },
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

/** Accepts the storyboard and renders the clip. This is the expensive step. */
export async function startWorkVideo(workId: string): Promise<ActionResult> {
  const user = await requireAuth();
  const work = await loadOwnedWork(workId, user.id);
  if (!work) return { ok: false, code: "not_found" };

  const ready = await db
    .select({ id: ugcWorkFrames.id })
    .from(ugcWorkFrames)
    .where(
      and(eq(ugcWorkFrames.workId, work.id), eq(ugcWorkFrames.status, "ready")),
    );
  if (ready.length === 0) return { ok: false, code: "work_needs_frames" };

  const { taskRun } = await createBackgroundTask({
    db,
    queue: serverJobQueue,
    definition: workVideoJob,
    scopeKey: workScopeKey(user.id, work.id),
    payload: { workId: work.id, userId: user.id, polls: 0 },
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
