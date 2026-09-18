import { describe, expect, it } from "@jest/globals";
import { PRISM_MEDIA, SCRIPT_TEMPLATES } from "./constants";
import { TEMPLATE_BRIEFS } from "./templates";
import {
  buildCoverPrompt,
  buildSubtitleTrack,
  buildTalentFullBodyPrompt,
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
      { videoMode: "storyboard", aspectRatio: "9:16" },
      PRISM_MEDIA.maxVideoPromptCharacters,
    );

    expect(prompt).toContain("0.0-3.5s");
    expect(prompt).toContain("3.5-15.0s");
    expect(prompt).toContain("small autofocus correction");
    expect(prompt).toContain("LOCATION: lived-in sitting room");
    expect(prompt).toContain("No burned-in captions");
  });

  it("directs one-take video to avoid cuts and scene changes", () => {
    const prompt = buildVideoPrompt(
      subject,
      beats,
      null,
      { videoMode: "one_take", aspectRatio: "16:9" },
      PRISM_MEDIA.maxVideoPromptCharacters,
    );

    expect(prompt).toContain("one continuous take");
    expect(prompt).toContain("no cuts, transitions, or scene changes");
    expect(prompt).toContain("landscape 16:9");
  });

  it("keeps the prompt inside the provider's cap by shortening the direction", () => {
    const settings = {
      videoMode: "one_take" as const,
      aspectRatio: "9:16" as const,
    };
    // The beats and the closing rules are the contract and never give way, so
    // the budget is measured from what they already occupy.
    const floor = Array.from(
      buildVideoPrompt(subject, beats, null, settings, 0),
    ).length;
    const limit = floor + 200;
    const prompt = buildVideoPrompt(
      subject,
      beats,
      "LOCATION: lived-in sitting room. ".repeat(400),
      settings,
      limit,
    );

    // The cap is counted in code points, which is what the provider counts.
    expect(Array.from(prompt).length).toBeLessThanOrEqual(limit);
    expect(Array.from(prompt).length).toBeGreaterThan(floor);
    expect(prompt).toContain("LOCATION: lived-in sitting room");
    // The instructions that matter survive; the direction is what gives way.
    expect(prompt).toContain("0.0-3.5s");
    expect(prompt).toContain("No burned-in captions");
  });

  it("omits the direction entirely when the beats alone fill the budget", () => {
    const prompt = buildVideoPrompt(
      subject,
      beats,
      "LOCATION: lived-in sitting room",
      { videoMode: "one_take", aspectRatio: "9:16" },
      0,
    );

    expect(prompt).not.toContain("Follow this approved production direction");
    expect(prompt).toContain("No burned-in captions");
  });
});

describe("reference images", () => {
  const prompt = buildVideoPrompt(
    subject,
    beats,
    null,
    { videoMode: "one_take", aspectRatio: "9:16" },
    PRISM_MEDIA.maxVideoPromptCharacters,
  );

  it("names the key frames as the thing to match", () => {
    expect(prompt).toContain("approved key frames");
  });

  it("says a listing photo is evidence, not a scene to rebuild", () => {
    // Without this the model reproduces studio backdrops, props, and the
    // marketing text printed into a product photo.
    expect(prompt).toContain("evidence of the product's true colour");
    expect(prompt).toContain("Do not reproduce its background");
  });

  it("carries the same rule into the frames drawn before the video", () => {
    expect(buildCoverPrompt(subject, beats[0])).toContain(
      "Do not reproduce its background",
    );
  });
});

describe("talent full-length reference", () => {
  const identity = "A woman in her thirties, waist-up crop, bright kitchen.";
  const prompt = buildTalentFullBodyPrompt(identity);

  it("keeps the identity prompt so the face and wardrobe cannot drift", () => {
    expect(prompt).toContain(identity);
  });

  it("states that framing overrides the crop the identity prompt named", () => {
    expect(prompt).toContain("overrides every crop");
    expect(prompt).toContain("head to feet");
  });

  it("keeps the talent free of products, as the portrait is", () => {
    expect(prompt).toContain("Both hands empty");
  });
});

describe("format briefs", () => {
  it("gives every format a shot vocabulary to compose beats from", () => {
    // `shots` is what separates a thing held in the hand from a thing worn on
    // the body, so a format without it frames like every other one.
    for (const template of SCRIPT_TEMPLATES) {
      const brief = TEMPLATE_BRIEFS[template];
      expect(brief.shots.length).toBeGreaterThanOrEqual(3);
      expect(brief.angles.length).toBeGreaterThanOrEqual(3);
      expect(brief.structure.length).toBeGreaterThan(0);
      expect(brief.voice.length).toBeGreaterThan(0);
    }
  });

  it("frames apparel on the whole figure rather than on the hands", () => {
    const apparel = TEMPLATE_BRIEFS.apparel.shots.join(" ");
    expect(apparel).toContain("full-length");
    expect(TEMPLATE_BRIEFS.spokesperson.shots.join(" ")).not.toContain(
      "full-length",
    );
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
