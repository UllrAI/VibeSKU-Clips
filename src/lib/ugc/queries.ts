import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/database";
import { ugcProducts, ugcScripts, ugcTalents } from "@/database/ugc";
import { requireAuth } from "@/lib/auth/permissions";
import { latestRunStateForScope, type RunState } from "./run-state";
import { productScopeKey } from "./scope";

export type ProductRow = typeof ugcProducts.$inferSelect;
export type TalentRow = typeof ugcTalents.$inferSelect;
export type ScriptRow = typeof ugcScripts.$inferSelect;

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
