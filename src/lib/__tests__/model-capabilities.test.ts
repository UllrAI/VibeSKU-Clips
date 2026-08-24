import { describe, expect, it } from "vitest";
import { getVideoModelCapabilities, preflightVideoGeneration } from "@/lib/model-capabilities";

describe("video model capabilities", () => {
  it("normalizes a schema-backed image-to-video model", () => {
    const caps = getVideoModelCapabilities("google/veo3.1/image-to-video");
    expect(caps).toMatchObject({
      confidence: "known",
      textToVideo: false,
      imageToVideo: true,
      referenceVideo: false,
      lastFrame: true,
      nativeAudio: true,
      durationValues: [4, 6, 8],
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
});
