import { describe, expect, it } from "@jest/globals";
import { buildFramePrompt, buildSegmentVideoPrompt } from "./render";
import type { ScriptBeat } from "./types";

const beats: ScriptBeat[] = [
  {
    start: 0,
    end: 3.5,
    shot: "handheld medium shot",
    action: "picks up the vacuum",
    camera: "small autofocus correction toward the product",
    voiceover: "This lives by the sofa now.",
  },
  {
    start: 3.5,
    end: 15,
    shot: "close-up of the product",
    action: "runs it over the cushion",
    camera: "slow handheld push-in",
    voiceover: "",
  },
];

const subject = {
  productName: "Cordless hand vacuum",
  appearance: "A white handheld vacuum with a clear dust cup.",
  market: "US",
  locale: "en",
  template: "spokesperson" as const,
  talentPrompt: "A woman in her thirties in a bright living room",
};

describe("render prompts", () => {
  it("anchors a storyboard frame on the talent reference", () => {
    const prompt = buildFramePrompt(subject, beats[0]!, 0);

    expect(prompt).toContain("Match the supplied reference image");
    expect(prompt).toContain("Cordless hand vacuum");
    expect(prompt).toContain("on-screen text");
  });

  it("falls back to a product-led frame when no talent is chosen", () => {
    const prompt = buildFramePrompt(
      { ...subject, talentPrompt: null },
      beats[0]!,
      0,
    );

    expect(prompt).toContain("no recognisable face");
  });

  it("keeps each provider request focused on one shot", () => {
    const prompt = buildSegmentVideoPrompt(
      subject,
      beats,
      0,
      "LOCATION: lived-in sitting room\nLIGHTING: window light",
      "native",
      "9:16",
    );

    expect(prompt).toContain("lasting exactly 4 seconds");
    expect(prompt).toContain("small autofocus correction");
    expect(prompt).toContain("LOCATION: lived-in sitting room");
    expect(prompt).toContain("Speak exactly this line");
    expect(prompt).toContain("Next shot context: runs it over the cushion");
  });

  it("keeps AI narration out of provider-generated audio", () => {
    const prompt = buildSegmentVideoPrompt(
      subject,
      beats,
      0,
      null,
      "tts",
      "16:9",
    );

    expect(prompt).toContain("Do not show speaking or lip movement");
    expect(prompt).toContain("Landscape 16:9");
  });
});
