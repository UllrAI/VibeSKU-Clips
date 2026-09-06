import { CREDIT_COST } from "./constants";
import type { BatchPlanConfig, BatchPlanItem } from "./types";

interface PlanLine {
  item: BatchPlanItem;
  scriptCount: number;
  clipCount: number;
}

export interface PlanSummary {
  lines: PlanLine[];
  clipCount: number;
  scriptCount: number;
  productCount: number;
  estimatedCredits: number;
}

/**
 * A plan item is an explicit instruction, never a set of dimensions to expand.
 * Clips for one line are scripts x clips-per-script x the talents that line
 * actually names, so adding a locale or a talent elsewhere cannot silently
 * multiply the batch.
 */
export function countClipsForItem(item: BatchPlanItem): number {
  const talents = Math.max(1, item.talentIds.length);
  const scripts = item.scriptId ? 1 : Math.max(1, item.scriptCount);
  return scripts * Math.max(1, item.clipsPerScript) * talents;
}

export function summarizePlan(config: BatchPlanConfig): PlanSummary {
  const lines = config.items.map((item) => ({
    item,
    scriptCount: item.scriptId ? 0 : Math.max(1, item.scriptCount),
    clipCount: countClipsForItem(item),
  }));

  const analysedProducts = new Set(config.items.map((item) => item.productId));
  const clipCount = lines.reduce((total, line) => total + line.clipCount, 0);
  const scriptCount = lines.reduce(
    (total, line) => total + line.scriptCount,
    0,
  );

  return {
    lines,
    clipCount,
    scriptCount,
    productCount: analysedProducts.size,
    estimatedCredits:
      analysedProducts.size * CREDIT_COST.analysis +
      scriptCount * CREDIT_COST.script +
      clipCount * CREDIT_COST.render,
  };
}

/** Reference numbers are stable within a batch and appear on the manifest. */
export function buildClipReference(
  batchSequence: number,
  index: number,
): string {
  const batch = String(batchSequence).padStart(4, "0");
  const clip = String(index + 1).padStart(3, "0");
  return `VC-${batch}-${clip}`;
}
