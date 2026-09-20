import { describe, expect, it } from "@jest/globals";
import { MAX_PRODUCT_IMAGES, PRISM_MEDIA, SCRIPT_TEMPLATES } from "./constants";
import { TEMPLATE_BRIEFS } from "./templates";
import {
  CONTINUES_FROM_PREVIOUS,
  buildCoverPrompt,
  buildFramePrompt,
  buildSceneSheetPrompt,
  buildSubtitleTrack,
  buildTalentSheetPrompt,
  buildVideoPrompt,
  productReferenceUrls,
  renderSubjectFor,
  videoProductBudget,
  videoReferenceUrls,
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
  productDescription: "A white handheld vacuum with a clear dust cup.",
  market: "US",
  locale: "en",
  template: "spokesperson" as const,
  hasTalent: true,
  scenePrompt: null,
};

describe("render prompts", () => {
  it("anchors the opening frame on the talent reference", () => {
    const prompt = buildCoverPrompt(subject, beats[0]);

    expect(prompt).toContain("from the attached talent sheet");
    expect(prompt).toContain("Cordless hand vacuum");
    expect(prompt).toContain("on-screen text");
  });

  it("falls back to a product-led frame when no talent is chosen", () => {
    const prompt = buildCoverPrompt({ ...subject, hasTalent: false }, beats[0]);

    expect(prompt).toContain("no recognisable face");
  });

  it("makes one beat the frame assignment instead of asking for the whole script", () => {
    const direction = [
      "TALENT: a performer in a red coat",
      "LOCATION: a rooftop at dusk",
      "STYLE: casual phone footage with restrained contrast",
    ].join("\n");
    const prompt = buildFramePrompt(subject, beats[0], 0, direction);

    expect(prompt).toContain("CURRENT-FRAME ASSIGNMENT");
    expect(prompt).toContain("depict only 0.0-3.5s");
    expect(prompt).toContain("picks up the vacuum");
    expect(prompt).toContain("Do not combine, preview, foreshadow");
    expect(prompt).toContain("Supporting production direction");
    expect(prompt).toContain("casual phone footage");
    expect(prompt).not.toContain("red coat");
    expect(prompt).not.toContain("rooftop at dusk");
    expect(prompt.indexOf("CURRENT-FRAME ASSIGNMENT")).toBeLessThan(
      prompt.indexOf("Supporting production direction"),
    );
  });

  it("makes a requested garment back view override a front-facing reference", () => {
    const prompt = buildFramePrompt(
      {
        ...subject,
        template: "apparel",
      },
      {
        ...beats[1]!,
        shot: "full-length rear view",
        action: "turns fully away and pauses with the back unobstructed",
      },
      1,
      "STYLE: natural mirror check",
    );

    expect(prompt).toContain("Garment orientation is literal");
    expect(prompt).toContain(
      "never turn the torso or garment back toward camera",
    );
    expect(prompt).toContain("turns fully away");
    expect(prompt).not.toContain("red leather jacket");
    expect(prompt).toContain("Ignore every garment, outfit, shoe");
  });

  it("locks a garment video to the outfit already drawn in its frames", () => {
    const prompt = buildVideoPrompt(
      {
        ...subject,
        template: "apparel",
      },
      beats,
      { videoMode: "storyboard", aspectRatio: "9:16" },
      PRISM_MEDIA.maxVideoPromptCharacters,
    );

    expect(prompt).not.toContain("red leather jacket");
    expect(prompt).toContain("This product is a garment");
    expect(prompt).toContain("Never replace it, merge it with another outfit");
  });

  it("passes every beat to the video model with its timing", () => {
    const prompt = buildVideoPrompt(
      subject,
      beats,
      { videoMode: "storyboard", aspectRatio: "9:16" },
      PRISM_MEDIA.maxVideoPromptCharacters,
    );

    expect(prompt).toContain("0.0-3.5s");
    expect(prompt).toContain("3.5-15.0s");
    expect(prompt).toContain("small autofocus correction");
    expect(prompt).toContain("No burned-in captions");
  });

  it("keeps asset-generation descriptions out of the video prompt", () => {
    const prompt = buildVideoPrompt(
      {
        ...subject,
        scenePrompt: "A detailed marble showroom",
      },
      beats,
      { videoMode: "storyboard", aspectRatio: "9:16" },
      PRISM_MEDIA.maxVideoPromptCharacters,
      [
        "TALENT: red leather jacket and black boots",
        "LOCATION: detailed marble showroom",
        "PERFORMANCE: relaxed walk with natural weight shifts",
        "AUDIO: quiet room tone under the exact dialogue",
      ].join("\n"),
    );

    expect(prompt).not.toContain("red leather jacket");
    expect(prompt).not.toContain("marble showroom");
    expect(prompt).not.toContain(subject.productDescription);
    expect(prompt).toContain("relaxed walk with natural weight shifts");
    expect(prompt).toContain("quiet room tone");
    expect(prompt).toContain("sole visual authority");
    expect(prompt).toContain("only for motion, timing");
  });

  it("directs one-take video to avoid cuts and scene changes", () => {
    const prompt = buildVideoPrompt(
      subject,
      beats,
      { videoMode: "one_take", aspectRatio: "16:9" },
      PRISM_MEDIA.maxVideoPromptCharacters,
    );

    expect(prompt).toContain("one continuous take");
    expect(prompt).toContain("no cuts, transitions, or scene changes");
    expect(prompt).toContain("landscape 16:9");
  });

  it("keeps the prompt inside the provider's cap by shortening product context", () => {
    const settings = {
      videoMode: "one_take" as const,
      aspectRatio: "9:16" as const,
    };
    // The beats and the closing rules are the contract and never give way, so
    // the budget is measured from what they already occupy.
    const floor = Array.from(
      buildVideoPrompt(
        { ...subject, productDescription: "" },
        beats,
        settings,
        0,
      ),
    ).length;
    const limit = floor + 200;
    const prompt = buildVideoPrompt(
      {
        ...subject,
        productDescription: "A detailed product description. ".repeat(400),
      },
      beats,
      settings,
      limit,
    );

    // The cap is counted in code points, which is what the provider counts.
    expect(Array.from(prompt).length).toBeLessThanOrEqual(limit);
    expect(Array.from(prompt).length).toBeGreaterThan(floor);
    expect(prompt).toContain("A detailed product description");
    // The instructions that matter survive; product context gives way.
    expect(prompt).toContain("0.0-3.5s");
    expect(prompt).toContain("No burned-in captions");
  });

  it("omits the product summary when the motion contract fills the budget", () => {
    const prompt = buildVideoPrompt(
      { ...subject, productDescription: "A detailed product description" },
      beats,
      { videoMode: "one_take", aspectRatio: "9:16" },
      0,
    );

    expect(prompt).not.toContain("A detailed product description");
    expect(prompt).toContain("No burned-in captions");
  });
});

describe("reference images", () => {
  const prompt = buildVideoPrompt(
    subject,
    beats,
    { videoMode: "one_take", aspectRatio: "9:16" },
    PRISM_MEDIA.maxVideoPromptCharacters,
  );

  it("names the opening frame as the primary visual authority", () => {
    expect(prompt).toContain("drawn opening frame");
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

  it("uses the market fallback when no scene was chosen", () => {
    expect(buildFramePrompt(subject, beats[0], 0)).toContain(
      "ordinary home or street scene",
    );
    const legacyPrompt = buildFramePrompt(
      subject,
      beats[0],
      0,
      "LOCATION: a rooftop",
    );
    expect(legacyPrompt).toContain("ordinary home or street scene");
    expect(legacyPrompt).not.toContain("a rooftop");
  });

  it("lets the drawn frame own the location in the video prompt", () => {
    const prompt = buildVideoPrompt(
      staged,
      beats,
      { videoMode: "one_take", aspectRatio: "9:16" },
      PRISM_MEDIA.maxVideoPromptCharacters,
    );

    expect(prompt).not.toContain(location);
    expect(prompt).toContain("location, lighting, and colour grade");
  });

  it("does not repeat long asset prompts beside the key frames", () => {
    const prompt = buildVideoPrompt(
      {
        ...staged,
        scenePrompt: "S".repeat(8000),
      },
      beats,
      { videoMode: "one_take", aspectRatio: "9:16" },
      PRISM_MEDIA.maxVideoPromptCharacters,
    );

    expect(Array.from(prompt).length).toBeLessThanOrEqual(
      PRISM_MEDIA.maxVideoPromptCharacters,
    );
    expect(prompt).not.toContain("SSSS");
    expect(prompt).toContain("0.0-3.5s");
    expect(prompt).toContain("No burned-in captions");
  });

  it("does not carry reusable talent prose into frame generation", () => {
    const built = renderSubjectFor({
      product: { name: "Cordless hand vacuum", facts: null },
      work: { market: "US", locale: "en", template: "spokesperson" },
      talent: {
        prompt: "Mia wearing a red coat on a rooftop",
        description: "creator",
        name: "Mia",
      },
      scene: { prompt: location, description: "kitchen", name: "Kitchen" },
    });

    expect(built.scenePrompt).toBe(location);
    expect(built.hasTalent).toBe(true);
    expect(built.productDescription).toBe("");
    expect(buildFramePrompt(built, beats[0], 0)).not.toContain("red coat");
    expect(buildFramePrompt(built, beats[0], 0)).not.toContain("rooftop");
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
    expect(buildTalentSheetPrompt(identity, true)).toContain(
      "attached image shows this same person",
    );
    expect(buildTalentSheetPrompt(identity, false)).not.toContain(
      "attached image shows this same person",
    );
  });
});

describe("one photograph, not an arrangement", () => {
  const staged = {
    ...subject,
    scenePrompt: "A small city kitchen with a pale oak counter.",
  };

  it("tells both frame builders the elements share one light and one lens", () => {
    for (const prompt of [
      buildCoverPrompt(staged, beats[0]),
      buildFramePrompt(staged, beats[0], 0),
    ]) {
      expect(prompt).toContain("one camera in one exposure");
      expect(prompt).toContain("Relight the performer and the product");
      expect(prompt).toContain("One lens throughout");
    }
  });

  it("asks for contact where things touch, which is what floating looks like", () => {
    const prompt = buildFramePrompt(staged, beats[0], 0);

    expect(prompt).toContain("shadow gathering under them");
    expect(prompt).toContain("Nothing floats");
    expect(prompt).toContain("no edge looks cut out");
  });

  it("takes the pose and the light from the frame, not from the sheet", () => {
    // "Match the sheet exactly" pulled the sheet's studio lighting into the
    // frame along with the face, which is half of why frames read as pasted.
    const prompt = buildFramePrompt(staged, beats[0], 0);

    expect(prompt).toContain(
      "Take the pose, eye line, action, and light only from this frame",
    );
    expect(prompt).not.toContain("Match the supplied reference sheet exactly");
  });

  it("composes the frame rather than laying it out", () => {
    expect(buildFramePrompt(staged, beats[0], 0)).toContain(
      "Compose the frame, do not lay it out",
    );
  });

  it("carries the short form into the video prompt, which has a hard cap", () => {
    const prompt = buildVideoPrompt(
      staged,
      beats,
      { videoMode: "one_take", aspectRatio: "9:16" },
      PRISM_MEDIA.maxVideoPromptCharacters,
    );

    expect(prompt).toContain("filmed at once");
    expect(prompt).toContain("shadow gathering where things touch");
  });

  it("bounds the subject prompts so a frame request cannot pass 32k", () => {
    // Identity, location, and production direction are each written against a
    // schema of their own; unbounded they can exceed what Prism accepts.
    const prompt = buildFramePrompt(
      {
        ...staged,
        scenePrompt: "S".repeat(20_000),
      },
      beats[0],
      0,
      "D".repeat(30_000),
    );

    expect(Array.from(prompt).length).toBeLessThan(32_000);
    expect(prompt).toContain("Nothing floats");
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

  it("gives each garment format its own question to answer", () => {
    const garments = ["apparel", "styling", "fit_check"] as const;

    // All three are worn, so all three must frame the whole figure.
    for (const template of garments) {
      expect(TEMPLATE_BRIEFS[template].shots.join(" ")).toMatch(
        /full-length|head to feet/,
      );
      expect(TEMPLATE_BRIEFS[template].shots.join(" ")).toMatch(/back|rear/);
    }

    // And none of them is a rename of another: what it looks like on, what
    // else it goes with, and what size to order are three different clips.
    expect(
      new Set(garments.map((template) => TEMPLATE_BRIEFS[template].structure))
        .size,
    ).toBe(garments.length);
    expect(TEMPLATE_BRIEFS.styling.structure).toContain("restyled");
    expect(TEMPLATE_BRIEFS.fit_check.structure).toContain("size");
  });

  it("provides distinct recipes for technology, beauty, and food", () => {
    expect(TEMPLATE_BRIEFS.tech_demo.structure).toContain("one real task");
    expect(TEMPLATE_BRIEFS.beauty_routine.shots.join(" ")).toContain(
      "dispensed texture",
    );
    expect(TEMPLATE_BRIEFS.food_drink.voice).toContain("preparation sounds");
  });
});

describe("continuing a storyboard", () => {
  it("separates what carries over from what has to move on", () => {
    // Told only to continue, a model redraws the previous frame; told only
    // that this is a new shot, it drifts the way drawing frames apart did.
    expect(CONTINUES_FROM_PREVIOUS).toContain("Carry these over");
    expect(CONTINUES_FROM_PREVIOUS).toContain("Change these deliberately");

    const [, carried, changed] = CONTINUES_FROM_PREVIOUS.split("\n");
    // Wardrobe and light hold the clip together; the camera is what moves.
    expect(carried).toMatch(/garment/);
    expect(carried).toMatch(/light/);
    expect(carried).not.toMatch(/camera/);
    expect(changed).toMatch(/camera/);
    expect(changed).toMatch(/pose/);
    expect(CONTINUES_FROM_PREVIOUS).toContain(
      "visibly different from the previous frame",
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

describe("product reference photos", () => {
  const images = ["a.jpg", "b.jpg", "c.jpg", "d.jpg"];

  it("leads with the images the product read marked, then the rest", () => {
    expect(
      productReferenceUrls({ images, facts: { keyImages: [2, 0] } }, 4),
    ).toEqual(["c.jpg", "a.jpg", "b.jpg", "d.jpg"]);
  });

  it("falls back to page order when nothing was marked", () => {
    expect(productReferenceUrls({ images, facts: null }, 2)).toEqual([
      "a.jpg",
      "b.jpg",
    ]);
  });

  it("ignores a mark that points outside the kept images", () => {
    expect(
      productReferenceUrls({ images, facts: { keyImages: [9] } }, 1),
    ).toEqual(["a.jpg"]);
  });
});

describe("video reference budget", () => {
  it("keeps a reference set within the provider limit", () => {
    const frames = 6;
    const budget = videoProductBudget(frames, true);

    expect(frames + budget + 1).toBeLessThanOrEqual(
      PRISM_MEDIA.maxVideoReferences,
    );
    expect(budget).toBeGreaterThan(0);
  });

  it("gives a one-take clip every product photo it has", () => {
    expect(videoProductBudget(1, true)).toBeGreaterThanOrEqual(
      MAX_PRODUCT_IMAGES,
    );
  });

  it("never asks for a negative number of photos", () => {
    expect(videoProductBudget(PRISM_MEDIA.maxVideoReferences + 2, true)).toBe(
      0,
    );
  });

  it("sends only accepted frames for a storyboard video", () => {
    expect(
      videoReferenceUrls({
        videoMode: "storyboard",
        template: "apparel",
        frameUrls: ["frame-1.jpg", null, "frame-2.jpg"],
        product: {
          images: ["product-1.jpg", "product-2.jpg"],
          facts: { keyImages: [1] },
        },
        talentSheetUrl: "talent.jpg",
      }),
    ).toEqual(["frame-1.jpg", "frame-2.jpg"]);
  });

  it("keeps source evidence for a one-take video", () => {
    expect(
      videoReferenceUrls({
        videoMode: "one_take",
        template: "spokesperson",
        frameUrls: ["cover.jpg"],
        product: {
          images: ["product-1.jpg", "product-2.jpg"],
          facts: { keyImages: [1] },
        },
        talentSheetUrl: "talent.jpg",
      }),
    ).toEqual(["cover.jpg", "product-2.jpg", "product-1.jpg", "talent.jpg"]);
  });

  it("does not send a reusable talent outfit with a one-take garment", () => {
    expect(
      videoReferenceUrls({
        videoMode: "one_take",
        template: "apparel",
        frameUrls: ["cover.jpg"],
        product: {
          images: ["garment-front.jpg", "garment-back.jpg"],
          facts: { keyImages: [0, 1] },
        },
        talentSheetUrl: "talent-in-another-outfit.jpg",
      }),
    ).toEqual(["cover.jpg", "garment-front.jpg", "garment-back.jpg"]);
  });
});
