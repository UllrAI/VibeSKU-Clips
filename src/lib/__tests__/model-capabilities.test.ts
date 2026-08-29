import { describe, expect, it } from "vitest";
import { getVideoModelCapabilities, preflightVideoGeneration } from "@/lib/model-capabilities";

describe("video model capabilities", () => {
  it("normalizes a schema-backed image-to-video model", () => {
    const caps = getVideoModelCapabilities("google/veo3.1/image-to-video");
    expect(caps).toMatchObject({
      confidence: "known",
      textToVideo: false,
      imageToVideo: true,
      referenceImages: false,
      referenceVideo: false,
      referenceAudio: false,
      lastFrame: true,
      nativeAudio: true,
      durationValues: [4, 6, 8],
    });
  });

  it("finds schema-backed reference siblings and their quotas", () => {
    const caps = getVideoModelCapabilities("bytedance/seedance-2.5/image-to-video", true, "atlas-cloud");
    expect(caps).toMatchObject({
      referenceImages: true,
      referenceVideo: true,
      referenceAudio: true,
      nativeAudio: true,
    });
    expect(caps.maxReferenceImages).toBeGreaterThan(0);
  });

  it("does not invent a reference sibling for the fast-only family", () => {
    const caps = getVideoModelCapabilities("bytedance/seedance-2.0-fast/image-to-video", false, "atlas-cloud");
    expect(caps.referenceImages).toBe(false);
    expect(caps.referenceVideo).toBe(false);
  });

  it("recognizes Volcengine multimodal reference and audio conditioning", () => {
    const caps = getVideoModelCapabilities("doubao-seedance-2-0-pro-250528", true, "volcengine");
    expect(caps).toMatchObject({
      referenceImages: true,
      referenceVideo: true,
      referenceAudio: true,
      nativeAudio: true,
    });
  });

  it("keeps unknown custom models permissive", () => {
    const result = preflightVideoGeneration({
      modelId: "my-company/video-v9",
      duration: 5,
      resolution: "1080p",
      aspectRatio: "9:16",
      chainMode: "pin",
    });
    expect(result.capabilities.confidence).toBe("unknown");
    expect(result.capabilities.lastFrame).toBeNull();
    expect(result.adjustments).toEqual([]);
    expect(result.warnings).toEqual(["capabilities-unknown"]);
  });

  it("keeps provider-hosted custom models permissive when their mode is undeclared", () => {
    const result = preflightVideoGeneration({
      modelId: "my-company/video-v9",
      provider: "atlas-cloud",
      resolution: "1080p",
      aspectRatio: "9:16",
      chainMode: "off",
      referenceImageCount: 2,
    });
    expect(result.capabilities.referenceImages).toBeNull();
    expect(result.warnings).toEqual(["capabilities-unknown"]);
  });

  it("previews provider duration, resolution, ratio and tail-frame adaptation", () => {
    const result = preflightVideoGeneration({
      modelId: "minimax/hailuo-2.3/i2v-standard",
      duration: 8,
      resolution: "1080p",
      aspectRatio: "9:16",
      chainMode: "pin",
    });
    expect(result.adjustments).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "duration", requested: 8, effective: 6 }),
      expect.objectContaining({ field: "chainMode", effective: "off" }),
    ]));
  });

  it("shows adaptive framing and tier mapping before generation", () => {
    const result = preflightVideoGeneration({
      modelId: "minimax/h3/image-to-video",
      duration: 5,
      resolution: "1080p",
      aspectRatio: "9:16",
      chainMode: "pin",
    });
    expect(result.adjustments).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "resolution", effective: "2K" }),
      expect.objectContaining({ field: "aspectRatio", effective: "adaptive" }),
    ]));
    expect(result.adjustments.some((item) => item.field === "chainMode")).toBe(false);
  });

  it("warns before dropping unsupported reference conditioning", () => {
    const result = preflightVideoGeneration({
      modelId: "google/veo3.1/image-to-video",
      provider: "atlas-cloud",
      resolution: "1080p",
      aspectRatio: "9:16",
      chainMode: "off",
      referenceImageCount: 2,
      referenceAudioCount: 1,
    });
    expect(result.warnings).toEqual(expect.arrayContaining([
      "reference-conditioning-unavailable",
      "reference-audio-unavailable",
    ]));
  });
});
