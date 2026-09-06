import { describe, expect, it } from "@jest/globals";
import {
  buildCoverPrompt,
  buildSubtitleTrack,
  buildVideoPrompt,
} from "./render";
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
  it("anchors the opening frame on the talent reference", () => {
    const prompt = buildCoverPrompt(subject, beats[0]);

    expect(prompt).toContain("Match the supplied reference image");
    expect(prompt).toContain("Cordless hand vacuum");
    expect(prompt).toContain("on-screen text");
  });

  it("falls back to a product-led frame when no talent is chosen", () => {
    const prompt = buildCoverPrompt(
      { ...subject, talentPrompt: null },
      beats[0],
    );

    expect(prompt).toContain("no recognisable face");
  });

  it("passes every beat to the video model with its timing", () => {
    const prompt = buildVideoPrompt(
      subject,
      beats,
      "LOCATION: lived-in sitting room\nLIGHTING: window light",
    );

    expect(prompt).toContain("0.0-3.5s");
    expect(prompt).toContain("3.5-15.0s");
    expect(prompt).toContain("small autofocus correction");
    expect(prompt).toContain("LOCATION: lived-in sitting room");
    expect(prompt).toContain("No burned-in captions");
  });

  it("directs one-take video to avoid cuts and scene changes", () => {
    const prompt = buildVideoPrompt(subject, beats, null, "one_take");

    expect(prompt).toContain("one continuous take");
    expect(prompt).toContain("no cuts, transitions, or scene changes");
  });
});

describe("subtitle track", () => {
  it("writes SRT cues only for beats that are spoken", () => {
    expect(buildSubtitleTrack(beats)).toBe(
      [
        "1",
        "00:00:00,000 --> 00:00:03,500",
        "This lives by the sofa now.",
        "",
      ].join("\n"),
    );
  });
});
