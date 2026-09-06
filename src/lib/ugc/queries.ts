import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/database";
import {
  ugcClips,
  ugcExports,
  ugcProducts,
  ugcScripts,
  ugcTalents,
  ugcWorks,
} from "@/database/ugc";
import { requireAuth } from "@/lib/auth/permissions";
import { latestRunStateForScope, type RunState } from "./run-state";
import { productScopeKey } from "./scope";
import { findSimilarityHints, type SimilarityHint } from "./similarity";

export type ProductRow = typeof ugcProducts.$inferSelect;
export type TalentRow = typeof ugcTalents.$inferSelect;
export type ScriptRow = typeof ugcScripts.$inferSelect;
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

export async function getProduct(
  productId: string,
): Promise<ProductRow | null> {
  const user = await requireAuth();
  const [product] = await db
    .select()
    .from(ugcProducts)
    .where(and(eq(ugcProducts.id, productId), eq(ugcProducts.userId, user.id)));
  return product ?? null;
}

export interface ProductState {
  status: ProductRow["status"];
  /** Facts have landed, so the page has something to show and edit. */
  read: boolean;
  issue: string | null;
  /** What became of the reading task, so a dead read never spins forever. */
  run: RunState;
  /** Changes whenever the page would render differently. */
  revision: string;
}

/**
 * The cheap half of `getProduct`, polled while the reader is working. Reading
 * a product takes a model call, and the operator should watch it land rather
 * than press reload to find out whether it did.
 */
export async function getProductState(
  productId: string,
): Promise<ProductState | null> {
  const user = await requireAuth();
  const [row] = await db
    .select({
      status: ugcProducts.status,
      issue: ugcProducts.issue,
      facts: ugcProducts.facts,
      updatedAt: ugcProducts.updatedAt,
    })
    .from(ugcProducts)
    .where(and(eq(ugcProducts.id, productId), eq(ugcProducts.userId, user.id)));
  if (!row) return null;

  const run = await latestRunStateForScope(
    productScopeKey(user.id, productId),
    "ugc.product.ingest",
  );
  return {
    status: row.status,
    read: Boolean(row.facts),
    issue: row.issue,
    run,
    revision: [
      row.status,
      String(Boolean(row.facts)),
      String(run.failed),
      String(run.stalled),
      row.updatedAt.toISOString(),
    ].join("|"),
  };
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

export interface ClipDetail {
  clip: ClipRow;
  productName: string;
  productVariant: string | null;
  scriptTitle: string | null;
  scriptHook: string | null;
  scriptVoiceover: string | null;
  talentName: string | null;
  /** Set when the clip was produced step by step, so review can send the operator back to it. */
  workId: string | null;
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
      workId: ugcWorks.id,
    })
    .from(ugcClips)
    .innerJoin(ugcProducts, eq(ugcProducts.id, ugcClips.productId))
    .leftJoin(ugcScripts, eq(ugcScripts.id, ugcClips.scriptId))
    .leftJoin(ugcTalents, eq(ugcTalents.id, ugcClips.talentId))
    .leftJoin(ugcWorks, eq(ugcWorks.clipId, ugcClips.id))
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
    workId: row.workId,
  }));
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

export async function getExport(exportId: string): Promise<ExportRow | null> {
  const user = await requireAuth();
  const [record] = await db
    .select()
    .from(ugcExports)
    .where(and(eq(ugcExports.id, exportId), eq(ugcExports.userId, user.id)));
  return record ?? null;
}
