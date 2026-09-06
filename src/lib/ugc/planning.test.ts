import { describe, expect, it } from "@jest/globals";
import { CREDIT_COST } from "./constants";
import {
  buildClipReference,
  countClipsForItem,
  countProductsAwaitingFacts,
  summarizePlan,
} from "./planning";
import type { BatchPlanItem } from "./types";

function item(overrides: Partial<BatchPlanItem> = {}): BatchPlanItem {
  return {
    productId: "product-1",
    locale: "en",
    market: "US",
    template: "spokesperson",
    talentIds: [],
    scriptCount: 1,
    clipsPerScript: 1,
    ...overrides,
  };
}

describe("batch planning", () => {
  it("counts one clip per script when no talent is named", () => {
    expect(countClipsForItem(item())).toBe(1);
  });

  it("multiplies only by the talents the line actually names", () => {
    expect(
      countClipsForItem(
        item({ talentIds: ["a", "b"], scriptCount: 1, clipsPerScript: 3 }),
      ),
    ).toBe(6);
  });

  it("treats a reused script as exactly one script", () => {
    expect(
      countClipsForItem(
        item({ scriptId: "script-1", scriptCount: 5, clipsPerScript: 2 }),
      ),
    ).toBe(2);
  });

  it("matches the worked examples from the brief", () => {
    const twentyProducts = summarizePlan({
      reviewScriptsFirst: false,
      items: Array.from({ length: 20 }, (_, index) =>
        item({ productId: `product-${index}` }),
      ),
    });
    expect(twentyProducts.clipCount).toBe(20);
    expect(twentyProducts.productCount).toBe(20);

    const threeScripts = summarizePlan({
      reviewScriptsFirst: false,
      items: [item({ scriptCount: 3, clipsPerScript: 2 })],
    });
    expect(threeScripts.clipCount).toBe(6);
    expect(threeScripts.scriptCount).toBe(3);
  });

  it("prices analysis once per product, plus scripts and renders", () => {
    const plan = summarizePlan({
      reviewScriptsFirst: false,
      items: [
        item({ scriptCount: 2, clipsPerScript: 1 }),
        item({ locale: "es", market: "MX", scriptCount: 1, clipsPerScript: 1 }),
      ],
    });

    expect(plan.productCount).toBe(1);
    expect(plan.scriptCount).toBe(3);
    expect(plan.clipCount).toBe(3);
    expect(plan.estimatedCredits).toBe(
      CREDIT_COST.analysis + 3 * CREDIT_COST.script + 3 * CREDIT_COST.render,
    );
  });

  it("builds stable, sortable clip references", () => {
    expect(buildClipReference(7, 0)).toBe("VC-0007-001");
    expect(buildClipReference(7, 11)).toBe("VC-0007-012");
  });
});

describe("countProductsAwaitingFacts", () => {
  it("counts products that are still being read", () => {
    expect(
      countProductsAwaitingFacts([
        { status: "draft", facts: null },
        { status: "analyzing", facts: null },
      ]),
    ).toBe(2);
  });

  it("does not wait on a product that already has facts", () => {
    expect(
      countProductsAwaitingFacts([
        { status: "analyzing", facts: { summary: "kettle" } },
        { status: "ready", facts: { summary: "kettle" } },
      ]),
    ).toBe(0);
  });

  it("does not wait on a settled failure", () => {
    expect(
      countProductsAwaitingFacts([
        { status: "needs_input", facts: null },
        { status: "failed", facts: null },
      ]),
    ).toBe(0);
  });
});
