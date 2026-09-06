import { describe, expect, it } from "@jest/globals";
import { CLIP_SPEC } from "./constants";
import { evaluateClipQuality } from "./qc";

const script = {
  voiceover: "It picks up crumbs from the sofa in one pass.",
  captions: ["Crumbs, gone", "One pass"],
};

describe("clip quality gate", () => {
  it("passes a clip that meets the delivery specification", () => {
    const report = evaluateClipQuality({
      locale: "en",
      durationMs: CLIP_SPEC.durationSeconds * 1000,
      script,
      hasTalentReference: true,
    });

    expect(report.passed).toBe(true);
  });

  it("fails a clip whose duration drifts past the tolerance", () => {
    const report = evaluateClipQuality({
      locale: "en",
      durationMs: CLIP_SPEC.durationSeconds * 1000 + 2000,
      script,
      hasTalentReference: false,
    });

    expect(report.passed).toBe(false);
    expect(report.checks.find((check) => check.id === "duration")?.passed).toBe(
      false,
    );
  });

  it("fails when the renderer reports a missing duration", () => {
    const report = evaluateClipQuality({
      locale: "en",
      durationMs: null,
      script,
      hasTalentReference: false,
    });

    expect(
      report.checks.find((check) => check.id === "duration")?.detail,
    ).toContain("did not report");
  });

  it("counts a Chinese voiceover against the character budget", () => {
    const report = evaluateClipQuality({
      locale: "zh-Hans",
      durationMs: CLIP_SPEC.durationSeconds * 1000,
      script: { voiceover: "这是一段很短的口播。", captions: ["很短"] },
      hasTalentReference: false,
    });

    expect(
      report.checks.find((check) => check.id === "voiceoverLength")?.passed,
    ).toBe(true);
  });

  it("rejects a voiceover that cannot fit the target duration", () => {
    const report = evaluateClipQuality({
      locale: "en",
      durationMs: CLIP_SPEC.durationSeconds * 1000,
      script: { ...script, voiceover: "word ".repeat(120) },
      hasTalentReference: false,
    });

    expect(report.passed).toBe(false);
    expect(
      report.checks.find((check) => check.id === "voiceoverLength")?.passed,
    ).toBe(false);
  });

  it("surfaces renderer findings instead of a generic pass", () => {
    const report = evaluateClipQuality({
      locale: "en",
      durationMs: CLIP_SPEC.durationSeconds * 1000,
      script,
      hasTalentReference: true,
      rendererFindings: { productAccuracy: "The label does not match." },
    });

    expect(report.passed).toBe(false);
    expect(
      report.checks.find((check) => check.id === "productAccuracy")?.detail,
    ).toBe("The label does not match.");
  });
});
