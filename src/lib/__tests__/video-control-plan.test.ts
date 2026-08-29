import { describe, expect, it } from "vitest";
import { buildVideoControlPlan, sanitizeVideoControlSummary } from "@/lib/video-control-plan";

describe("video control plan", () => {
  it("uses an Atlas reference sibling for a multi-subject pack", () => {
    const plan = buildVideoControlPlan({
      provider: "atlas-cloud",
      modelId: "bytedance/seedance-2.5/image-to-video",
      supportsAudio: true,
      firstFrameUrl: "https://e.com/key.png",
      characterReferenceUrl: "https://e.com/person.png",
      productReferenceUrl: "https://e.com/product.png",
      voiceover: "今天给你看一个细节。",
      locale: "zh",
    });

    expect(plan).toMatchObject({
      strategy: "reference-pack",
      mode: "video-to-video",
      audioMode: "native",
      voiceoverBound: true,
      referenceCount: 3,
      referenceRoles: ["keyframe", "character", "product"],
      warnings: [],
    });
    expect(plan.firstFrameUrl).toBeUndefined();
    expect(plan.referenceInputs.map((item) => item.role)).toEqual(["keyframe", "character", "product"]);
    expect(plan.promptSuffix).toContain("只自然说一遍");
  });

  it("keeps identity references and carries the end frame as a target anchor", () => {
    const plan = buildVideoControlPlan({
      provider: "atlas-cloud",
      modelId: "bytedance/seedance-2.5/image-to-video",
      firstFrameUrl: "https://e.com/key.png",
      lastFrameUrl: "https://e.com/end.png",
      characterReferenceUrl: "https://e.com/person.png",
      voiceover: "hello",
      locale: "en",
    });

    expect(plan).toMatchObject({
      strategy: "reference-pack",
      mode: "video-to-video",
      audioMode: "native",
      referenceCount: 3,
      referenceRoles: ["keyframe", "end-frame", "character"],
      warnings: [],
    });
    expect(plan.referenceInputs.map((item) => item.role)).toEqual(["keyframe", "end-frame", "character"]);
  });

  it("keeps native start/end frames when only a soft continuity reference competes", () => {
    const plan = buildVideoControlPlan({
      provider: "atlas-cloud",
      modelId: "bytedance/seedance-2.5/image-to-video",
      firstFrameUrl: "https://e.com/key.png",
      lastFrameUrl: "https://e.com/end.png",
      continuityReferenceUrl: "https://e.com/previous.png",
      locale: "en",
    });
    expect(plan).toMatchObject({
      strategy: "keyframe",
      mode: "image-to-video",
      firstFrameUrl: "https://e.com/key.png",
      lastFrameUrl: "https://e.com/end.png",
      warnings: ["reference-pack-deferred-for-end-frame"],
    });
  });

  it("attaches references and native audio alongside Volcengine frames", () => {
    const plan = buildVideoControlPlan({
      provider: "volcengine",
      modelId: "doubao-seedance-2-0-pro-250528",
      supportsAudio: true,
      firstFrameUrl: "https://e.com/key.png",
      continuityReferenceUrl: "https://e.com/tail.png",
      audioReferenceUrl: "https://e.com/voice.wav",
      description: "a hand opens the box",
      locale: "en",
    });

    expect(plan).toMatchObject({
      strategy: "reference-pack",
      mode: "image-to-video",
      audioMode: "native",
      referenceCount: 3,
      referenceRoles: ["keyframe", "continuity", "audio"],
    });
    expect(plan.referenceInputs.map((item) => item.mediaType)).toEqual(["image", "audio"]);
    expect(plan.promptSuffix).toContain("@Image2=previous-shot continuity");
  });

  it("does not label a plain keyframe request as a reference pack", () => {
    const plan = buildVideoControlPlan({
      provider: "volcengine",
      modelId: "doubao-seedance-2-0-pro-250528",
      firstFrameUrl: "https://e.com/key.png",
      locale: "zh",
    });
    expect(plan.strategy).toBe("keyframe");
    expect(plan.referenceCount).toBe(1);
  });

  it("sanitizes persisted summaries and drops unknown fields", () => {
    expect(sanitizeVideoControlSummary({
      version: 1,
      strategy: "reference-pack",
      mode: "video-to-video",
      referenceRoles: ["keyframe", "character", "not-a-role"],
      referenceCount: 999,
      audioMode: "native",
      voiceoverBound: true,
      warnings: ["reference-pack-unsupported", "unknown"],
      promptSuffix: "must not persist",
    })).toEqual({
      version: 1,
      strategy: "reference-pack",
      mode: "video-to-video",
      referenceRoles: ["keyframe", "character"],
      referenceCount: 32,
      audioMode: "native",
      voiceoverBound: true,
      warnings: ["reference-pack-unsupported"],
    });
  });
});
