import { describe, expect, it } from "vitest";
import { buildVideoRepairPreview, deriveRepairWindow, sanitizeTimedKeyframes, sanitizeVideoRepairSummary } from "@/lib/video-repair-plan";
import type { GenerationQualityReport, ShotQualityContract } from "@/lib/generation-quality";

const report: GenerationQualityReport = {
  version: 1,
  summary: "motion drift",
  overall: 54,
  confidence: 0.8,
  verdict: "reject",
  dimensions: [],
  issues: [
    { code: "drift", dimension: "temporal-coherence", severity: "critical", summary: "hand deforms", suggestedFix: "keep the hand stable", time: 3.2 },
    { code: "label", dimension: "subject-fidelity", severity: "warning", summary: "label drifts", suggestedFix: "preserve package", time: 4.1 },
  ],
  evaluatedAt: "2026-08-30T00:00:00.000Z",
};

const contract: ShotQualityContract = {
  version: 1,
  shotId: 2,
  shotType: "demo",
  mediaType: "video",
  targetDuration: 8,
  description: "present the product",
  prompt: "product demo",
  camera: "slow push in",
  voiceover: "",
  anchors: { character: [], product: ["red box"], wardrobe: [], environment: [], lighting: [], forbiddenChanges: [] },
  referenceRoles: ["generated-output"],
  dimensions: [],
};

describe("video repair planning", () => {
  it("derives a compact, padded window from issue evidence", () => {
    expect(deriveRepairWindow(8, report).window).toEqual({ start: 2.45, end: 4.85 });
  });

  it("sorts, clamps and deduplicates timed keyframes", () => {
    expect(sanitizeTimedKeyframes([
      { assetId: "a-1", time: 7, role: "product" },
      { assetId: "a-2", time: 1, role: "identity" },
      { assetId: "a-2", time: 1, role: "identity" },
      { assetId: "../bad", time: 2, role: "product" },
    ], 6)).toEqual([
      { assetId: "a-2", time: 1, role: "identity" },
      { assetId: "a-1", time: 6, role: "product" },
    ]);
  });

  it("caps timed anchors at the four exposed by the repair contract", () => {
    expect(sanitizeTimedKeyframes([
      { assetId: "a-1", time: 1, role: "identity" },
      { assetId: "a-2", time: 2, role: "product" },
      { assetId: "a-3", time: 3, role: "composition" },
      { assetId: "a-4", time: 4, role: "continuity" },
      { assetId: "a-5", time: 5, role: "identity" },
    ], 8)).toHaveLength(4);
  });

  it("previews an Atlas reference repair with explicit local-splice fallbacks", () => {
    const preview = buildVideoRepairPreview({
      operationId: "op-1",
      sourceAssetId: "asset-1",
      reviewId: "review-1",
      shotId: 2,
      provider: "atlas-cloud",
      model: "bytedance/seedance-2.0/image-to-video",
      supportsAudio: true,
      sourceDuration: 8,
      report,
      contract,
      requestedScope: "region",
      requestedRegion: { x: 0.1, y: 0.2, width: 0.4, height: 0.5 },
      keyframes: [{ assetId: "anchor-1", time: 3.5, role: "product" }],
      sourceUploadAvailable: true,
      pricePerCall: 0.42,
    });
    expect(preview.executable).toBe(true);
    expect(preview.summary.model).toBe("bytedance/seedance-2.0/reference-to-video");
    expect(preview.summary.effectiveScope).toBe("full-frame");
    expect(preview.summary.estimatedCostUsd).toBe(0.42);
    expect(preview.summary.warnings).toEqual(expect.arrayContaining([
      "provider-native-window-unavailable",
      "region-fallback-full-frame",
      "ordered-keyframes-fallback",
    ]));
    expect(preview.prompt).toContain("2.45–4.85");
    expect(sanitizeVideoRepairSummary(preview.summary)).toEqual(preview.summary);
  });

  it("rejects a summary whose confirmed window was changed", () => {
    const preview = buildVideoRepairPreview({
      operationId: "op-2", sourceAssetId: "asset-1", reviewId: "review-1", shotId: 2,
      provider: "atlas-cloud", model: "bytedance/seedance-2.0/reference-to-video",
      sourceDuration: 8, report, contract, sourceUploadAvailable: true,
    });
    expect(sanitizeVideoRepairSummary({ ...preview.summary, window: { start: 0, end: 8 } })).toBeNull();
  });
});
