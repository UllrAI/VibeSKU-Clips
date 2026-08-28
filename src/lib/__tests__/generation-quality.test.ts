import { describe, expect, it } from "vitest";
import {
  buildShotQualityContract,
  parseGenerationQuality,
  qualityDisposition,
  rankQualityCandidates,
} from "@/lib/generation-quality";
import type { Shot } from "@/lib/db/schema";

const shot: Shot = {
  shotId: 2,
  type: "demo",
  duration: 5,
  description: "A presenter presses the blue pump once and spreads one drop on the back of her hand",
  camera: "locked macro close-up",
  visualSource: "ai_generate",
  transition: "ai_reference",
  voiceover: "One pump is enough",
  prompt: "blue serum bottle, one pump, hand demo",
};

describe("generation quality contracts", () => {
  it("weights video, product, action, and continuity requirements from the real shot", () => {
    const contract = buildShotQualityContract({
      shot,
      mediaType: "video",
      intent: { subject: "blue serum bottle", action: "press the pump once", productConstraints: ["same blue label"] },
      bible: {
        characterAnchors: ["black bob"],
        productAnchors: ["blue glass bottle"],
        wardrobeAnchors: [],
        environmentAnchors: ["white vanity"],
        lightingAnchors: ["soft daylight"],
        forbiddenChanges: ["red bottle"],
      },
      hasProductReference: true,
      hasPreviousReference: true,
      hasSourceKeyframe: true,
    });

    expect(contract.dimensions.reduce((sum, dimension) => sum + dimension.weight, 0)).toBe(100);
    expect(contract.dimensions.find((dimension) => dimension.id === "temporal-coherence")?.required).toBe(true);
    expect(contract.dimensions.find((dimension) => dimension.id === "subject-fidelity")?.required).toBe(true);
    expect(contract.dimensions.find((dimension) => dimension.id === "continuity")?.required).toBe(true);
    expect(contract.referenceRoles).toEqual(["generated-output", "source-keyframe", "product-reference", "previous-shot-tail"]);
  });

  it("drops the temporal dimension for a still image", () => {
    const contract = buildShotQualityContract({ shot, mediaType: "image" });
    expect(contract.dimensions.some((dimension) => dimension.id === "temporal-coherence")).toBe(false);
    expect(contract.dimensions.reduce((sum, dimension) => sum + dimension.weight, 0)).toBe(100);
  });

  it("recomputes the weighted result and refuses a critical identity failure", () => {
    const contract = buildShotQualityContract({ shot, mediaType: "video", hasProductReference: true });
    const dimensions = contract.dimensions.map((dimension) => ({
      id: dimension.id,
      score: dimension.id === "subject-fidelity" ? 35 : 94,
      confidence: 0.9,
      summary: "checked",
      evidence: [{ time: 2.1, observation: "visible evidence", severity: dimension.id === "subject-fidelity" ? "critical" : "positive" }],
    }));
    const report = parseGenerationQuality(JSON.stringify({
      summary: "The bottle changes shape",
      dimensions,
      issues: [{ code: "product-shape-drift", dimension: "subject-fidelity", severity: "critical", summary: "Bottle silhouette changes", suggestedFix: "Reuse the product reference", time: 2.1 }],
    }), contract, new Date("2026-08-28T00:00:00Z"));

    expect(report.verdict).toBe("reject");
    expect(report.overall).toBeLessThan(90);
    expect(qualityDisposition(report)).toMatchObject({ action: "regenerate", paid: true, automatic: false });
    expect(qualityDisposition(report, { priorRejectsForModel: 2 })).toMatchObject({ action: "switch-model", paid: true });
  });

  it("forces human review when a required score is missing instead of inventing confidence", () => {
    const contract = buildShotQualityContract({ shot, mediaType: "image", hasProductReference: true });
    const report = parseGenerationQuality('{"summary":"partial","dimensions":[],"issues":[]}', contract);
    expect(report.verdict).toBe("reject");
    expect(report.confidence).toBe(0.2);
    expect(report.dimensions.every((dimension) => dimension.summary === "Not reliably assessed")).toBe(true);
  });

  it("ranks reviewed candidates before unreviewed or selected-but-weaker candidates", () => {
    const contract = buildShotQualityContract({ shot, mediaType: "image" });
    const make = (score: number) => parseGenerationQuality(JSON.stringify({
      summary: "candidate",
      dimensions: contract.dimensions.map((dimension) => ({ id: dimension.id, score, confidence: 0.9, summary: "ok", evidence: [] })),
      issues: [],
    }), contract);
    const ranked = rankQualityCandidates([
      { id: "unreviewed", selected: true, report: null },
      { id: "good", selected: false, report: make(90) },
      { id: "okay", selected: false, report: make(75) },
    ]);
    expect(ranked.map((candidate) => candidate.id)).toEqual(["good", "okay", "unreviewed"]);
  });
});
