import { describe, expect, it } from "vitest";
import { buildVideoControlPlan, sanitizeVideoControlSummary } from "@/lib/video-control-plan";

/**
 * The plan decides what actually reaches a paid request. Two failure shapes matter: silently
 * dropping an identity reference (the shot comes back with the wrong face and the money is spent),
 * and attaching something the model rejects (a 422 after the wait). Both are model-capability
 * questions, so every case below is pinned to a real catalog entry.
 */

describe("video control plan", () => {
  it("carries identity and product references alongside the keyframe", () => {
    const plan = buildVideoControlPlan({
      modelId: "seedance2.5",
      firstFrameUrl: "https://e.com/key.png",
      characterReferenceUrl: "https://e.com/person.png",
      productReferenceUrl: "https://e.com/product.png",
      voiceover: "今天给你看一个细节。",
      locale: "zh",
    });

    expect(plan).toMatchObject({
      strategy: "reference-pack",
      mode: "image-to-video",
      referenceCount: 3,
      referenceRoles: ["keyframe", "character", "product"],
      warnings: [],
    });
    // The keyframe stays a real first frame — references never displace the composition anchor.
    expect(plan.firstFrameUrl).toBe("https://e.com/key.png");
    expect(plan.referenceInputs.map((item) => item.role)).toEqual(["character", "product"]);
    // @Image1 is the keyframe, so the reference map starts at @Image2.
    expect(plan.promptSuffix).toContain("@Image2=人物身份");
  });

  it("keeps the end frame and the identity reference at the same time", () => {
    const plan = buildVideoControlPlan({
      modelId: "seedance2.5",
      firstFrameUrl: "https://e.com/key.png",
      lastFrameUrl: "https://e.com/end.png",
      characterReferenceUrl: "https://e.com/person.png",
      voiceover: "hello",
      locale: "en",
    });

    expect(plan).toMatchObject({
      strategy: "reference-pack",
      referenceCount: 3,
      referenceRoles: ["keyframe", "end-frame", "character"],
      warnings: [],
    });
    expect(plan.lastFrameUrl).toBe("https://e.com/end.png");
    expect(plan.promptSuffix).toContain("@Image3=character identity");
  });

  it("H3 renders its own audio, so the voice-over is bound into the video request", () => {
    const plan = buildVideoControlPlan({
      modelId: "minimax-h3",
      firstFrameUrl: "https://e.com/key.png",
      voiceover: "这个细节你一定没注意过。",
      speakerVisible: true,
      locale: "zh",
    });
    expect(plan.audioMode).toBe("native");
    expect(plan.voiceoverBound).toBe(true);
    expect(plan.audioPrompt).toContain("只自然说一遍");
  });

  it("Seedance renders audio behind a switch, so it counts as native too", () => {
    const plan = buildVideoControlPlan({
      modelId: "seedance2.0",
      firstFrameUrl: "https://e.com/key.png",
      voiceover: "hello",
      locale: "en",
    });
    expect(plan.audioMode).toBe("native");
    expect(plan.voiceoverBound).toBe(true);
  });

  it("a model outside the catalog gets a post-production voice track instead of a silent shot", () => {
    const plan = buildVideoControlPlan({
      modelId: "my-org/unknown",
      firstFrameUrl: "https://e.com/key.png",
      voiceover: "hello",
      locale: "en",
    });
    expect(plan.audioMode).toBe("post");
    expect(plan.voiceoverBound).toBe(false);
    expect(plan.audioPrompt).toBeUndefined();
  });

  it("a reference video makes it a video-to-video request", () => {
    const plan = buildVideoControlPlan({
      modelId: "seedance2.5",
      firstFrameUrl: "https://e.com/key.png",
      motionReferenceUrl: "https://e.com/move.mp4",
      locale: "en",
    });
    expect(plan.mode).toBe("video-to-video");
    expect(plan.referenceInputs.map((item) => item.mediaType)).toEqual(["video"]);
  });

  it("drops what the model cannot take and says so, instead of failing at the provider", () => {
    const plan = buildVideoControlPlan({
      modelId: "sora2",
      firstFrameUrl: "https://e.com/key.png",
      lastFrameUrl: "https://e.com/end.png",
      characterReferenceUrl: "https://e.com/person.png",
      motionReferenceUrl: "https://e.com/move.mp4",
      audioReferenceUrl: "https://e.com/voice.wav",
      locale: "en",
    });
    expect(plan.referenceInputs).toEqual([]);
    expect(plan.lastFrameUrl).toBeUndefined();
    expect(plan.warnings).toEqual([
      "reference-pack-unsupported",
      "reference-video-unsupported",
      "reference-audio-unsupported",
      "end-frame-unsupported",
    ]);
  });

  it("does not label a plain keyframe request as a reference pack", () => {
    const plan = buildVideoControlPlan({
      modelId: "seedance2.0",
      firstFrameUrl: "https://e.com/key.png",
      locale: "zh",
    });
    expect(plan.strategy).toBe("keyframe");
    expect(plan.referenceCount).toBe(1);
    expect(plan.referenceInputs).toEqual([]);
  });

  it("a continuity frame identical to the keyframe does not burn a second reference slot", () => {
    const plan = buildVideoControlPlan({
      modelId: "seedance2.5",
      firstFrameUrl: "https://e.com/key.png",
      continuityReferenceUrl: "https://e.com/key.png",
      locale: "en",
    });
    expect(plan.referenceInputs).toEqual([]);
    expect(plan.referenceCount).toBe(1);
  });

  it("sanitizes persisted summaries and drops unknown fields", () => {
    expect(
      sanitizeVideoControlSummary({
        version: 1,
        strategy: "reference-pack",
        mode: "video-to-video",
        referenceRoles: ["keyframe", "character", "not-a-role"],
        referenceCount: 999,
        audioMode: "native",
        voiceoverBound: true,
        warnings: ["reference-pack-unsupported", "unknown"],
        promptSuffix: "must not persist",
      })
    ).toEqual({
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
