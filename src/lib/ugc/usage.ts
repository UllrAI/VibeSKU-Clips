import type { AppDatabase } from "@/database/client";
import { ugcUsageEvents } from "@/database/ugc";

export type UsageKind =
  | "analysis"
  | "script"
  | "render"
  | "retry"
  | "regenerate";

/**
 * Every unit of paid work is recorded, including system retries and operator
 * regenerations, so consumption can be reconciled against the planned count.
 */
export async function recordUsage(
  db: AppDatabase,
  input: {
    userId: string;
    kind: UsageKind;
    credits: number;
    batchId?: string | null;
    clipId?: string | null;
    note?: string | null;
  },
): Promise<void> {
  await db.insert(ugcUsageEvents).values({
    userId: input.userId,
    kind: input.kind,
    credits: input.credits,
    batchId: input.batchId ?? null,
    clipId: input.clipId ?? null,
    note: input.note ?? null,
  });
}
