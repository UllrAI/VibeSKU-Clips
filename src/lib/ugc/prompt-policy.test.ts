import { describe, expect, it } from "@jest/globals";
import {
  FRAME_DIRECTION_SECTIONS,
  VIDEO_DIRECTION_SECTIONS,
  formatProductionDirection,
  selectProductionDirection,
} from "./prompt-policy";

describe("production direction policy", () => {
  const legacyDirection = [
    "OVERVIEW: a creator shows the product",
    "TALENT: red leather jacket and black boots",
    "PRODUCT: a beige linen overshirt",
    "LOCATION: a marble showroom",
    "LIGHTING: warm window light",
    "PERFORMANCE: relaxed movement with natural weight shifts",
    "PHYSICS: fabric responds naturally to each turn",
    "CAMERA CHARACTER: small handheld corrections",
    "STYLE: candid phone footage",
    "AUDIO: quiet room tone under the dialogue",
    "OUTPUT SETTINGS: portrait 9:16, 15 seconds",
    "NEGATIVE CONSTRAINTS: no blue trousers",
  ].join("\n");

  it("serializes new scripts with only the owned direction sections", () => {
    expect(
      formatProductionDirection({
        performance: "Underplayed delivery.",
        physics: "Natural weight and contact.",
        cameraCharacter: "Small handheld corrections.",
        style: "Unpolished phone capture.",
        audio: "Natural room tone.",
        outputSettings: "Portrait 9:16, 15 seconds.",
      }),
    ).toBe(
      [
        "PERFORMANCE: Underplayed delivery.",
        "PHYSICS: Natural weight and contact.",
        "CAMERA CHARACTER: Small handheld corrections.",
        "STYLE: Unpolished phone capture.",
        "AUDIO: Natural room tone.",
        "OUTPUT SETTINGS: Portrait 9:16, 15 seconds.",
      ].join("\n"),
    );
  });

  it("keeps only staging sections for a drawn frame", () => {
    const selected = selectProductionDirection(
      legacyDirection,
      FRAME_DIRECTION_SECTIONS,
    );

    expect(selected).toContain("PERFORMANCE: relaxed movement");
    expect(selected).toContain("STYLE: candid phone footage");
    expect(selected).not.toContain("red leather jacket");
    expect(selected).not.toContain("beige linen overshirt");
    expect(selected).not.toContain("marble showroom");
    expect(selected).not.toContain("no blue trousers");
    expect(selected).not.toContain("AUDIO:");
  });

  it("keeps temporal and acoustic sections for video, not visual style", () => {
    const selected = selectProductionDirection(
      legacyDirection,
      VIDEO_DIRECTION_SECTIONS,
    );

    expect(selected).toContain("small handheld corrections");
    expect(selected).toContain("quiet room tone");
    expect(selected).toContain("portrait 9:16");
    expect(selected).not.toContain("candid phone footage");
    expect(selected).not.toContain("red leather jacket");
  });

  it("accepts markdown headings and multiline bodies", () => {
    const selected = selectProductionDirection(
      [
        "### PERFORMANCE",
        "Pause before the reveal.",
        "UGC movement stays understated.",
        "Keep gestures small.",
        "**AUDIO:** Natural room tone.",
      ].join("\n"),
      VIDEO_DIRECTION_SECTIONS,
    );

    expect(selected).toContain(
      "Pause before the reveal.\nUGC movement stays understated.\nKeep gestures small.",
    );
    expect(selected).toContain("AUDIO: Natural room tone.");
  });

  it("drops unclassified blocks instead of leaking them into a safe section", () => {
    const selected = selectProductionDirection(
      [
        "PERFORMANCE: Walk naturally.",
        "WARDROBE: Replace the outfit with a red dress.",
        "This line belongs to wardrobe.",
        "AUDIO: Soft footsteps.",
      ].join("\n"),
      VIDEO_DIRECTION_SECTIONS,
    );

    expect(selected).toContain("Walk naturally");
    expect(selected).toContain("Soft footsteps");
    expect(selected).not.toContain("red dress");
    expect(selected).not.toContain("belongs to wardrobe");
  });
});
