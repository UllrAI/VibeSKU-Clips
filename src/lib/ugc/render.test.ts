import { describe, expect, it } from "@jest/globals";
import { PRISM_MEDIA, SCRIPT_TEMPLATES } from "./constants";
import { TEMPLATE_BRIEFS } from "./templates";
import {
  buildCoverPrompt,
  buildFramePrompt,
  buildSceneSheetPrompt,
  buildSubtitleTrack,
  buildTalentSheetPrompt,
  buildVideoPrompt,
  renderSubjectFor,
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
  scenePrompt: null,
};

describe("render prompts", () => {
  it("anchors the opening frame on the talent reference", () => {
    const prompt = buildCoverPrompt(subject, beats[0]);

    expect(prompt).toContain("Match the supplied reference sheet");
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
  it("says a reference sheet is a set of angles, not a layout to copy", () => {
    // Without this the model reads the panel grid as the composition it was
    // asked for and draws the gutters into the clip.
    for (const prompt of [
      buildCoverPrompt(subject, beats[0]),
      buildFramePrompt(subject, beats[0], 0),
      buildVideoPrompt(
        subject,
        beats,
        null,
        { videoMode: "one_take", aspectRatio: "9:16" },
        PRISM_MEDIA.maxVideoPromptCharacters,
      ),
    ]) {
      expect(prompt).toContain("Never reproduce its panel grid");
    }
  });
});

describe("a chosen scene", () => {
  const location =
    "A small city kitchen with a pale oak counter and white tiles.";
  const staged = { ...subject, scenePrompt: location };

  it("replaces the generic market setting in the opening frame", () => {
    const prompt = buildCoverPrompt(staged, beats[0]);

    expect(prompt).toContain(location);
    expect(prompt).not.toContain("ordinary home or street scene");
  });

  it("still states the location when production direction is present", () => {
    // The operator picked this place; the direction improvised its own.
    const prompt = buildFramePrompt(
      staged,
      beats[0],
      0,
      "LOCATION: a rooftop at dusk",
    );

    expect(prompt).toContain(location);
  });

  it("leaves the market fallback in place when no scene was chosen", () => {
    expect(buildFramePrompt(subject, beats[0], 0)).toContain(
      "ordinary home or street scene",
    );
    expect(
      buildFramePrompt(subject, beats[0], 0, "LOCATION: a rooftop"),
    ).not.toContain("ordinary home or street scene");
  });

  it("holds the clip in one place for the whole video", () => {
    const prompt = buildVideoPrompt(
      staged,
      beats,
      null,
      { videoMode: "one_take", aspectRatio: "9:16" },
      PRISM_MEDIA.maxVideoPromptCharacters,
    );

    expect(prompt).toContain("stays in this one place");
    expect(prompt).toContain(location);
  });

  it("cuts long subject prompts so the beats keep their room", () => {
    // Identity and location prompts are written for an image model and run to
    // thousands of characters; the beat list is what must survive the cap.
    const prompt = buildVideoPrompt(
      {
        ...staged,
        talentPrompt: "T".repeat(8000),
        scenePrompt: "S".repeat(8000),
      },
      beats,
      null,
      { videoMode: "one_take", aspectRatio: "9:16" },
      PRISM_MEDIA.maxVideoPromptCharacters,
    );

    expect(Array.from(prompt).length).toBeLessThanOrEqual(
      PRISM_MEDIA.maxVideoPromptCharacters,
    );
    expect(prompt).toContain("0.0-3.5s");
    expect(prompt).toContain("No burned-in captions");
  });

  it("describes the talent and the scene by their expanded prompts", () => {
    const built = renderSubjectFor({
      product: { name: "Cordless hand vacuum", facts: null },
      work: { market: "US", locale: "en", template: "spokesperson" },
      talent: { prompt: "", description: "", name: "Mia" },
      scene: { prompt: location, description: "kitchen", name: "Kitchen" },
    });

    expect(built.scenePrompt).toBe(location);
    // An empty expanded prompt falls through to what the operator typed.
    expect(built.talentPrompt).toBe("Mia");
    expect(built.appearance).toBe("");
  });
});

describe("reference sheets", () => {
  const location = "A small city kitchen with a pale oak counter.";
  const identity = "A woman in her thirties, waist-up crop, bright kitchen.";

  it("keeps the subject prompt verbatim so it cannot drift", () => {
    expect(buildSceneSheetPrompt(location, false)).toContain(location);
    expect(buildTalentSheetPrompt(identity, false)).toContain(identity);
  });

  it("states that the layout overrides the viewpoint the prompt named", () => {
    expect(buildSceneSheetPrompt(location, false)).toContain(
      "overrides every viewpoint",
    );
    expect(buildTalentSheetPrompt(identity, false)).toContain(
      "overrides every crop",
    );
  });

  it("asks for one image of panels rather than several images", () => {
    for (const prompt of [
      buildSceneSheetPrompt(location, false),
      buildTalentSheetPrompt(identity, false),
    ]) {
      expect(prompt).toContain("one single image divided into clean");
      expect(prompt).toContain("same lighting against the same plain");
    }
  });

  it("keeps text off the sheet, because a later model would draw it back in", () => {
    expect(buildTalentSheetPrompt(identity, false)).toContain(
      "No text, no letters",
    );
  });

  it("gives a talent sheet every angle one photograph cannot carry", () => {
    const prompt = buildTalentSheetPrompt(identity, false);

    expect(prompt).toContain("forty-five degrees");
    expect(prompt).toContain("head to feet");
    expect(prompt).toContain("texture of the hair");
    expect(prompt).toContain("Both hands empty");
  });

  it("gives a scene sheet the space, the eye line, and the surface", () => {
    const prompt = buildSceneSheetPrompt(location, false);

    expect(prompt).toContain("wide establishing shot");
    expect(prompt).toContain("where a person would stand");
    expect(prompt).toContain("set down on");
    expect(prompt).toContain("No people");
  });

  it("matches an uploaded reference only when one was attached", () => {
    expect(buildSceneSheetPrompt(location, true)).toContain("same place");
    expect(buildSceneSheetPrompt(location, false)).not.toContain("same place");
    expect(buildTalentSheetPrompt(identity, true)).toContain("same person");
    expect(buildTalentSheetPrompt(identity, false)).not.toContain(
      "same person",
    );
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
