import "server-only";
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/database";
import {
  ugcClips,
  ugcProducts,
  ugcScripts,
  ugcTalents,
  ugcWorkFrames,
  ugcWorks,
} from "@/database/ugc";
import { taskRuns } from "@/database/schema";
import { requireAuth } from "@/lib/auth/permissions";
import type { ProductRow, ScriptRow, TalentRow } from "./queries";
import { runStateFor, type RunState } from "./run-state";

type WorkRow = typeof ugcWorks.$inferSelect;
export type WorkFrameRow = typeof ugcWorkFrames.$inferSelect;
export type ClipRow = typeof ugcClips.$inferSelect;

export interface WorkDetail {
  work: WorkRow;
  product: ProductRow | null;
  talent: TalentRow | null;
  script: ScriptRow | null;
  clip: ClipRow | null;
  frames: WorkFrameRow[];
  run: RunState;
}

export interface WorkSummary {
  work: WorkRow;
  productName: string | null;
  coverUrl: string | null;
  videoUrl: string | null;
  failed: boolean;
}

export async function listWorks(): Promise<WorkSummary[]> {
  const user = await requireAuth();
  const rows = await db
    .select({
      work: ugcWorks,
      productName: ugcProducts.name,
      productImages: ugcProducts.images,
      clipCover: ugcClips.coverUrl,
      videoUrl: ugcClips.videoUrl,
      taskStatus: taskRuns.status,
    })
    .from(ugcWorks)
    .leftJoin(ugcProducts, eq(ugcProducts.id, ugcWorks.productId))
    .leftJoin(ugcClips, eq(ugcClips.id, ugcWorks.clipId))
    .leftJoin(taskRuns, eq(taskRuns.id, ugcWorks.taskRunId))
    .where(eq(ugcWorks.userId, user.id))
    .orderBy(desc(ugcWorks.createdAt));

  return rows.map((row) => ({
    work: row.work,
    productName: row.productName,
    coverUrl: row.clipCover ?? row.productImages?.[0] ?? null,
    videoUrl: row.videoUrl,
    failed: row.work.stepStatus === "failed" || row.taskStatus === "failed",
  }));
}

export async function getWork(workId: string): Promise<WorkDetail | null> {
  const user = await requireAuth();
  const [work] = await db
    .select()
    .from(ugcWorks)
    .where(and(eq(ugcWorks.id, workId), eq(ugcWorks.userId, user.id)));
  if (!work) return null;

  const [product] = work.productId
    ? await db
        .select()
        .from(ugcProducts)
        .where(eq(ugcProducts.id, work.productId))
    : [];
  const [talent] = work.talentId
    ? await db.select().from(ugcTalents).where(eq(ugcTalents.id, work.talentId))
    : [];
  const [script] = work.scriptId
    ? await db.select().from(ugcScripts).where(eq(ugcScripts.id, work.scriptId))
    : [];
  const [clip] = work.clipId
    ? await db.select().from(ugcClips).where(eq(ugcClips.id, work.clipId))
    : [];
  const frames = await db
    .select()
    .from(ugcWorkFrames)
    .where(eq(ugcWorkFrames.workId, work.id))
    .orderBy(asc(ugcWorkFrames.position));

  return {
    work,
    run: await runStateFor(work.taskRunId),
    product: product ?? null,
    talent: talent ?? null,
    script: script ?? null,
    clip: clip ?? null,
    frames,
  };
}

/**
 * What the product step is waiting on. A work sits in `running` while its
 * product is being read, and the console needs to distinguish that from a
 * product that was read and came back short.
 */
export function productStepState(
  product: Pick<ProductRow, "status" | "facts"> | null,
): "empty" | "reading" | "needs_input" | "ready" {
  if (!product) return "empty";
  if (product.status === "needs_input" || product.status === "failed") {
    return "needs_input";
  }
  return product.facts ? "ready" : "reading";
}

export interface WorkState {
  step: WorkRow["step"];
  stepStatus: WorkRow["stepStatus"];
  productState: ReturnType<typeof productStepState>;
  run: RunState;
  /** Changes whenever anything on the page would render differently. */
  revision: string;
}

/**
 * The cheap half of `getWork`, polled by the console while a step is working.
 * The page only re-fetches itself when `revision` moves, so an open tab costs
 * one small query per interval.
 */
export async function getWorkState(workId: string): Promise<WorkState | null> {
  const user = await requireAuth();
  const [row] = await db
    .select({
      step: ugcWorks.step,
      stepStatus: ugcWorks.stepStatus,
      taskRunId: ugcWorks.taskRunId,
      updatedAt: ugcWorks.updatedAt,
      productStatus: ugcProducts.status,
      productFacts: ugcProducts.facts,
    })
    .from(ugcWorks)
    .leftJoin(ugcProducts, eq(ugcProducts.id, ugcWorks.productId))
    .where(and(eq(ugcWorks.id, workId), eq(ugcWorks.userId, user.id)));
  if (!row) return null;

  const frames = await db
    .select({ id: ugcWorkFrames.id, status: ugcWorkFrames.status })
    .from(ugcWorkFrames)
    .where(eq(ugcWorkFrames.workId, workId))
    .orderBy(asc(ugcWorkFrames.position));

  const productState = row.productStatus
    ? productStepState({
        status: row.productStatus,
        facts: row.productFacts,
      })
    : "empty";

  const run = await runStateFor(row.taskRunId);
  return {
    step: row.step,
    stepStatus: row.stepStatus,
    productState,
    run,
    revision: [
      row.step,
      row.stepStatus,
      productState,
      String(run.failed),
      String(run.stalled),
      row.updatedAt.toISOString(),
      frames.map((frame) => frame.status).join(""),
    ].join("|"),
  };
}
