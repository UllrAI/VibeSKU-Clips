import { and, eq, notInArray } from "drizzle-orm";
import type { AppDatabase } from "@/database/client";
import { ugcBatches, ugcClips } from "@/database/ugc";

type ClipStatus = (typeof ugcClips.$inferSelect)["status"];

/** A clip in one of these can never change again without an operator asking. */
const CLIP_END_STATES: ClipStatus[] = ["ready", "failed", "cancelled"];

/**
 * Closes a batch once nothing in it can change any more.
 *
 * Nothing else does this: a clip reaching its own end state says nothing about
 * the batch, so without this the batch stays `running` for ever and the console
 * polls a run that finished hours ago. Called from every place a clip settles.
 */
export async function settleBatchIfFinished(
  db: AppDatabase,
  batchId: string,
): Promise<boolean> {
  const unfinished = await db
    .select({ id: ugcClips.id })
    .from(ugcClips)
    .where(
      and(
        eq(ugcClips.batchId, batchId),
        notInArray(ugcClips.status, CLIP_END_STATES),
      ),
    )
    .limit(1);
  if (unfinished.length > 0) return false;

  const settled = await db
    .update(ugcBatches)
    .set({ status: "completed", updatedAt: new Date() })
    .where(and(eq(ugcBatches.id, batchId), eq(ugcBatches.status, "running")))
    .returning({ id: ugcBatches.id });
  return settled.length > 0;
}
