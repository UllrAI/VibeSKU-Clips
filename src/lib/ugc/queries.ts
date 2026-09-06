import "server-only";
import { and, count, desc, eq, inArray, lt, or, sql } from "drizzle-orm";
import { db } from "@/database";
import {
  ugcBatches,
  ugcClips,
  ugcExports,
  ugcProducts,
  ugcScripts,
  ugcTalents,
  ugcUsageEvents,
} from "@/database/ugc";
import { taskRuns } from "@/database/schema";
import { requireAuth } from "@/lib/auth/permissions";
import { findSimilarityHints, type SimilarityHint } from "./similarity";

/** How long a queued task may sit before the console calls the run stalled. */
const STALL_AFTER_MS = 45_000;

export type ProductRow = typeof ugcProducts.$inferSelect;
export type TalentRow = typeof ugcTalents.$inferSelect;
export type ScriptRow = typeof ugcScripts.$inferSelect;
type BatchRow = typeof ugcBatches.$inferSelect;
type ClipRow = typeof ugcClips.$inferSelect;
export type ExportRow = typeof ugcExports.$inferSelect;

export async function listProducts(): Promise<ProductRow[]> {
  const user = await requireAuth();
  return db
    .select()
    .from(ugcProducts)
    .where(eq(ugcProducts.userId, user.id))
    .orderBy(desc(ugcProducts.createdAt));
}

export async function listTalents(): Promise<TalentRow[]> {
  const user = await requireAuth();
  return db
    .select()
    .from(ugcTalents)
    .where(and(eq(ugcTalents.userId, user.id), eq(ugcTalents.archived, false)))
    .orderBy(desc(ugcTalents.createdAt));
}

export async function listScripts(): Promise<
  (ScriptRow & { productName: string })[]
> {
  const user = await requireAuth();
  const rows = await db
    .select({ script: ugcScripts, productName: ugcProducts.name })
    .from(ugcScripts)
    .innerJoin(ugcProducts, eq(ugcProducts.id, ugcScripts.productId))
    .where(eq(ugcScripts.userId, user.id))
    .orderBy(desc(ugcScripts.createdAt))
    .limit(200);
  return rows.map((row) => ({ ...row.script, productName: row.productName }));
}

export interface BatchProgress {
  batch: BatchRow;
  /** Work is queued but nothing is consuming it — usually no worker running. */
  stalled: boolean;
  total: number;
  ready: number;
  failed: number;
  running: number;
  pending: number;
}

/**
 * Batches with work the queue accepted but nothing picked up.
 *
 * A task that is still `queued` well after it was created means no worker
 * process is consuming the outbox. That is the single most common reason a
 * batch looks frozen, and without saying so the operator can only find out by
 * reading server logs.
 */
async function stalledBatches(batchIds: string[]): Promise<Set<string>> {
  if (batchIds.length === 0) return new Set();
  const rows = await db
    .selectDistinct({
      batchId: sql<string>`coalesce(${ugcClips.batchId}, ${ugcBatches.id})`,
    })
    .from(taskRuns)
    .leftJoin(ugcClips, eq(ugcClips.taskRunId, taskRuns.id))
    .leftJoin(ugcBatches, eq(ugcBatches.taskRunId, taskRuns.id))
    .where(
      and(
        eq(taskRuns.status, "queued"),
        lt(taskRuns.createdAt, new Date(Date.now() - STALL_AFTER_MS)),
        or(
          inArray(ugcClips.batchId, batchIds),
          inArray(ugcBatches.id, batchIds),
        ),
      ),
    );
  return new Set(rows.map((row) => row.batchId));
}

async function progressFor(
  batchIds: string[],
): Promise<Map<string, Omit<BatchProgress, "batch">>> {
  if (batchIds.length === 0) return new Map();
  const rows = await db
    .select({
      batchId: ugcClips.batchId,
      status: ugcClips.status,
      total: count(),
    })
    .from(ugcClips)
    .where(inArray(ugcClips.batchId, batchIds))
    .groupBy(ugcClips.batchId, ugcClips.status);

  const stalled = await stalledBatches(batchIds);
  const progress = new Map<string, Omit<BatchProgress, "batch">>();
  for (const batchId of batchIds) {
    progress.set(batchId, {
      stalled: stalled.has(batchId),
      total: 0,
      ready: 0,
      failed: 0,
      running: 0,
      pending: 0,
    });
  }
  for (const row of rows) {
    const current = progress.get(row.batchId)!;
    current.total += row.total;
    if (row.status === "ready") current.ready += row.total;
    else if (row.status === "failed") current.failed += row.total;
    else if (row.status === "pending") current.pending += row.total;
    else if (row.status !== "cancelled") current.running += row.total;
  }
  return progress;
}

export async function listBatches(): Promise<BatchProgress[]> {
  const user = await requireAuth();
  const batches = await db
    .select()
    .from(ugcBatches)
    .where(eq(ugcBatches.userId, user.id))
    .orderBy(desc(ugcBatches.createdAt))
    .limit(50);
  const progress = await progressFor(batches.map((batch) => batch.id));
  return batches.map((batch) => ({
    batch,
    ...progress.get(batch.id)!,
  }));
}

export interface ClipDetail {
  clip: ClipRow;
  productName: string;
  productVariant: string | null;
  scriptTitle: string | null;
  scriptHook: string | null;
  scriptVoiceover: string | null;
  talentName: string | null;
}

async function clipDetails(
  where: ReturnType<typeof and>,
): Promise<ClipDetail[]> {
  const rows = await db
    .select({
      clip: ugcClips,
      productName: ugcProducts.name,
      productVariant: ugcProducts.variant,
      scriptTitle: ugcScripts.title,
      scriptHook: ugcScripts.hook,
      scriptVoiceover: ugcScripts.voiceover,
      talentName: ugcTalents.name,
    })
    .from(ugcClips)
    .innerJoin(ugcProducts, eq(ugcProducts.id, ugcClips.productId))
    .leftJoin(ugcScripts, eq(ugcScripts.id, ugcClips.scriptId))
    .leftJoin(ugcTalents, eq(ugcTalents.id, ugcClips.talentId))
    .where(where)
    .orderBy(desc(ugcClips.createdAt))
    .limit(300);

  return rows.map((row) => ({
    clip: row.clip,
    productName: row.productName,
    productVariant: row.productVariant,
    scriptTitle: row.scriptTitle,
    scriptHook: row.scriptHook,
    scriptVoiceover: row.scriptVoiceover,
    talentName: row.talentName,
  }));
}

/** Just the counts, for the console's polling loop. */
export async function getBatchProgress(batchId: string): Promise<{
  status: BatchRow["status"];
  note: string | null;
  stalled: boolean;
  total: number;
  ready: number;
  failed: number;
  running: number;
  pending: number;
} | null> {
  const user = await requireAuth();
  const [batch] = await db
    .select({
      id: ugcBatches.id,
      status: ugcBatches.status,
      note: ugcBatches.note,
      plannedCount: ugcBatches.plannedCount,
    })
    .from(ugcBatches)
    .where(and(eq(ugcBatches.id, batchId), eq(ugcBatches.userId, user.id)));
  if (!batch) return null;

  const counts = (await progressFor([batch.id])).get(batch.id);
  // Clip rows do not exist until the batch is expanded, so the planned count
  // is the honest denominator; the unfilled part of the bar is work not yet
  // started rather than work that has been counted twice.
  return {
    status: batch.status,
    note: batch.note,
    stalled: counts?.stalled ?? false,
    total: Math.max(counts?.total ?? 0, batch.plannedCount),
    ready: counts?.ready ?? 0,
    failed: counts?.failed ?? 0,
    running: counts?.running ?? 0,
    pending: counts?.pending ?? 0,
  };
}

export async function getBatchDetail(batchId: string): Promise<{
  progress: BatchProgress;
  clips: ClipDetail[];
  taskProgress: Record<string, unknown> | null;
} | null> {
  const user = await requireAuth();
  const [batch] = await db
    .select()
    .from(ugcBatches)
    .where(and(eq(ugcBatches.id, batchId), eq(ugcBatches.userId, user.id)));
  if (!batch) return null;

  const clips = await clipDetails(eq(ugcClips.batchId, batch.id));
  const progress = await progressFor([batch.id]);
  const [task] = batch.taskRunId
    ? await db.select().from(taskRuns).where(eq(taskRuns.id, batch.taskRunId))
    : [];

  return {
    progress: { batch, ...progress.get(batch.id)! },
    clips,
    taskProgress: task?.progress ?? null,
  };
}

export async function listReviewClips(): Promise<{
  clips: ClipDetail[];
  hints: SimilarityHint[];
}> {
  const user = await requireAuth();
  const clips = await clipDetails(
    and(
      eq(ugcClips.userId, user.id),
      inArray(ugcClips.status, ["ready", "failed"]),
    ),
  );

  const candidates = clips.map((detail) => ({
    id: detail.clip.id,
    reference: detail.clip.reference,
    locale: detail.clip.locale,
    text: `${detail.scriptHook ?? ""} ${detail.scriptVoiceover ?? ""}`,
  }));

  return { clips, hints: findSimilarityHints(candidates) };
}

export async function listExports(): Promise<ExportRow[]> {
  const user = await requireAuth();
  return db
    .select()
    .from(ugcExports)
    .where(eq(ugcExports.userId, user.id))
    .orderBy(desc(ugcExports.createdAt))
    .limit(50);
}

export interface ProductionSummary {
  readyClips: number;
  awaitingReview: number;
  selectedClips: number;
  runningBatches: number;
  failedClips: number;
  creditsSpent: number;
  productsNeedingInput: number;
}

export async function getProductionSummary(): Promise<ProductionSummary> {
  const user = await requireAuth();
  const [clipStats] = await db
    .select({
      ready: sql<number>`count(*) filter (where ${ugcClips.status} = 'ready')`,
      failed: sql<number>`count(*) filter (where ${ugcClips.status} = 'failed')`,
      awaiting: sql<number>`count(*) filter (where ${ugcClips.status} = 'ready' and ${ugcClips.reviewStatus} = 'pending')`,
      selected: sql<number>`count(*) filter (where ${ugcClips.reviewStatus} = 'selected')`,
    })
    .from(ugcClips)
    .where(eq(ugcClips.userId, user.id));

  const [batchStats] = await db
    .select({ running: count() })
    .from(ugcBatches)
    .where(
      and(eq(ugcBatches.userId, user.id), eq(ugcBatches.status, "running")),
    );

  const [usage] = await db
    .select({
      credits: sql<number>`coalesce(sum(${ugcUsageEvents.credits}), 0)`,
    })
    .from(ugcUsageEvents)
    .where(eq(ugcUsageEvents.userId, user.id));

  const [products] = await db
    .select({ blocked: count() })
    .from(ugcProducts)
    .where(
      and(
        eq(ugcProducts.userId, user.id),
        eq(ugcProducts.status, "needs_input"),
      ),
    );

  return {
    readyClips: Number(clipStats?.ready ?? 0),
    failedClips: Number(clipStats?.failed ?? 0),
    awaitingReview: Number(clipStats?.awaiting ?? 0),
    selectedClips: Number(clipStats?.selected ?? 0),
    runningBatches: Number(batchStats?.running ?? 0),
    creditsSpent: Number(usage?.credits ?? 0),
    productsNeedingInput: Number(products?.blocked ?? 0),
  };
}

export async function getExport(exportId: string): Promise<ExportRow | null> {
  const user = await requireAuth();
  const [record] = await db
    .select()
    .from(ugcExports)
    .where(and(eq(ugcExports.id, exportId), eq(ugcExports.userId, user.id)));
  return record ?? null;
}
