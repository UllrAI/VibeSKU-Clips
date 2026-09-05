import { describe, expect, it } from "vitest";
import { getVideoModelCapabilities, preflightVideoGeneration } from "@/lib/model-capabilities";

/**
 * The preflight is what tells someone "15s becomes 10s on this model" before they pay, so it has
 * to mirror buildPrismVideoBody exactly. These tests pin the two halves together.
 */

describe("video model capabilities", () => {
  it("reads H3's limits from the catalog", () => {
    const caps = getVideoModelCapabilities("minimax-h3");
    expect(caps).toMatchObject({
      confidence: "known",
      textToVideo: true,
      imageToVideo: true,
      referenceImages: true,
      referenceVideo: false,
      referenceAudio: true,
      lastFrame: true,
      nativeAudio: true,
    });
    expect(caps.maxReferenceImages).toBeGreaterThan(0);
    expect(caps.resolutionValues).toEqual(["480p", "720p"]);
  });

  it("marks Seedance 2.5 as accepting video conditioning", () => {
    const caps = getVideoModelCapabilities("seedance2.5");
    expect(caps).toMatchObject({
      referenceImages: true,
      referenceVideo: true,
      referenceAudio: true,
      videoEdit: true,
      performanceReference: true,
    });
  });

  it("never claims capabilities Prism's schema does not expose", () => {
    const caps = getVideoModelCapabilities("minimax-h3");
    expect(caps.temporalRetake).toBe(false);
    expect(caps.regionMask).toBe(false);
    expect(caps.multiKeyframes).toBe(false);
  });

  it("promises nothing for a model id that is not in the catalog", () => {
    const caps = getVideoModelCapabilities("my-company/video-v9");
    expect(caps.confidence).toBe("unknown");
    expect(caps.lastFrame).toBe(false);
    expect(caps.durationValues).toEqual([]);
  });
});

describe("preflight", () => {
  it("a stale model id from an older install reports capabilities-unknown, not a crash", () => {
    const result = preflightVideoGeneration({
      modelId: "my-company/video-v9",
      duration: 5,
      resolution: "1080p",
      aspectRatio: "9:16",
      chainMode: "pin",
    });
    expect(result.capabilities.confidence).toBe("unknown");
    expect(result.adjustments).toEqual([]);
    expect(result.warnings).toEqual(["capabilities-unknown"]);
  });

  it("previews the duration and resolution snapping H3 will apply", () => {
    const result = preflightVideoGeneration({
      modelId: "minimax-h3",
      duration: 20,
      resolution: "1080p",
      aspectRatio: "9:16",
      chainMode: "pin",
    });
    expect(result.adjustments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "duration", requested: 20, effective: 15 }),
        expect.objectContaining({ field: "resolution", requested: "1080p", effective: "720p" }),
      ])
    );
    // H3 supports last_frame_url, so keyframe chaining survives
    expect(result.adjustments.some((item) => item.field === "chainMode")).toBe(false);
  });

  it("previews the forced 16:9 reframing of H3 Max", () => {
    const result = preflightVideoGeneration({
      modelId: "minimax-h3-max",
      duration: 6,
      resolution: "720p",
      aspectRatio: "9:16",
      chainMode: "off",
    });
    expect(result.adjustments).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: "aspectRatio", requested: "9:16", effective: "16:9" })])
    );
  });

  it("leaves a request the model already satisfies untouched", () => {
    const result = preflightVideoGeneration({
      modelId: "minimax-h3",
      duration: 6,
      resolution: "720p",
      aspectRatio: "9:16",
      chainMode: "pin",
    });
    expect(result.adjustments).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("warns before dropping reference conditioning the model cannot take", () => {
    const result = preflightVideoGeneration({
      modelId: "sora2",
      resolution: "720p",
      aspectRatio: "9:16",
      chainMode: "off",
      referenceImageCount: 2,
      referenceAudioCount: 1,
    });
    expect(result.warnings).toEqual(
      expect.arrayContaining(["reference-conditioning-unavailable", "reference-audio-unavailable"])
    );
  });

  it("warns when more reference images are attached than the model accepts", () => {
    const result = preflightVideoGeneration({
      modelId: "minimax-h3",
      resolution: "720p",
      aspectRatio: "9:16",
      chainMode: "off",
      referenceImageCount: 30,
    });
    expect(result.warnings).toContain("reference-images-trimmed");
  });
});
