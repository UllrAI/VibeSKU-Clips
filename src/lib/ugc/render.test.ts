import { describe, expect, it } from "@jest/globals";
import { PRISM_MEDIA, SCRIPT_TEMPLATES } from "./constants";
import { TEMPLATE_BRIEFS } from "./templates";
import {
  buildCoverPrompt,
  buildFramePrompt,
  buildSceneViewPrompt,
  buildSubtitleTrack,
  buildTalentFullBodyPrompt,
  buildVideoPrompt,
  renderSubjectFor,
  sceneReferenceUrls,
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

  it("hands at most two views to one request", () => {
    const views = [
      { angle: "establishing" as const, imageUrl: "https://x/1.webp" },
      { angle: "eye_level" as const, imageUrl: "https://x/2.webp" },
      { angle: "detail" as const, imageUrl: "https://x/3.webp" },
    ];

    expect(sceneReferenceUrls({ views })).toEqual([
      "https://x/1.webp",
      "https://x/2.webp",
    ]);
    expect(sceneReferenceUrls(null)).toEqual([]);
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

describe("scene views", () => {
  const location = "A small city kitchen with a pale oak counter.";

  it("keeps the location prompt so the place cannot drift", () => {
    expect(buildSceneViewPrompt(location, "establishing", false)).toContain(
      location,
    );
  });

  it("frames each view for the question it answers", () => {
    expect(buildSceneViewPrompt(location, "establishing", false)).toContain(
      "Wide establishing shot",
    );
    expect(buildSceneViewPrompt(location, "eye_level", false)).toContain(
      "where a person would stand",
    );
    expect(buildSceneViewPrompt(location, "detail", false)).toContain(
      "set down on",
    );
  });

  it("matches earlier views only once there are some", () => {
    expect(buildSceneViewPrompt(location, "detail", true)).toContain(
      "same place",
    );
    expect(buildSceneViewPrompt(location, "detail", false)).not.toContain(
      "same place",
    );
  });

  it("keeps people and products out of a location reference", () => {
    expect(buildSceneViewPrompt(location, "eye_level", false)).toContain(
      "No people",
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
