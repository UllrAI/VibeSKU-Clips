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
import {
  videoGenerationPhase,
  type VideoGenerationPhase,
} from "./video-progress";

type WorkRow = typeof ugcWorks.$inferSelect;
export type WorkFrameRow = typeof ugcWorkFrames.$inferSelect;
export type ClipRow = typeof ugcClips.$inferSelect;

export interface WorkVersion {
  clip: ClipRow;
  script: ScriptRow | null;
}

export interface WorkDetail {
  work: WorkRow;
  product: ProductRow | null;
  talent: TalentRow | null;
  script: ScriptRow | null;
  clip: ClipRow | null;
  versions: WorkVersion[];
  frames: WorkFrameRow[];
  run: RunState;
}

export interface WorkSummary {
  work: WorkRow;
  productName: string | null;
  coverUrl: string | null;
  videoUrl: string | null;
  videoVersion: number | null;
  videoGenerationPhase: VideoGenerationPhase | null;
  taskActive: boolean;
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
      videoVersion: ugcClips.version,
      taskStatus: taskRuns.status,
      taskProgress: taskRuns.progress,
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
    videoVersion: row.videoVersion,
    videoGenerationPhase:
      row.work.step === "video" &&
      (row.taskStatus === "queued" ||
        row.taskStatus === "running" ||
        row.taskStatus === "waiting")
        ? videoGenerationPhase(
            row.taskStatus ?? "idle",
            row.taskProgress ?? null,
          )
        : null,
    taskActive:
      row.taskStatus === "queued" ||
      row.taskStatus === "running" ||
      row.taskStatus === "waiting",
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
  const versions = await db
    .select({ clip: ugcClips, script: ugcScripts })
    .from(ugcClips)
    .leftJoin(ugcScripts, eq(ugcScripts.id, ugcClips.scriptId))
    .where(eq(ugcClips.workId, work.id))
    .orderBy(desc(ugcClips.version));
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
    versions:
      clip && !versions.some((version) => version.clip.id === clip.id)
        ? [{ clip, script: script ?? null }, ...versions]
        : versions,
    frames,
  };
}

/**
 * What the product step is waiting on. A work sits in `running` while its
 * product is being read, and the console needs to distinguish that from a
 * product that was read and came back short.
 */
function productStepState(
  product: Pick<ProductRow, "status" | "facts"> | null,
): "empty" | "reading" | "needs_input" | "review" | "ready" {
  if (!product) return "empty";
  if (product.status === "needs_input" || product.status === "failed") {
    return "needs_input";
  }
  if (product.status === "review" && product.facts) return "review";
  if (product.status === "ready" && product.facts) return "ready";
  return "reading";
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
      run.status,
      JSON.stringify(run.progress),
      row.updatedAt.toISOString(),
      frames.map((frame) => frame.status).join(""),
    ].join("|"),
  };
}
