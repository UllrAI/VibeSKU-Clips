import { describe, expect, it } from "@jest/globals";
import { PRISM_MEDIA } from "./constants";
import { framePromptSchema } from "./frame-prompt";

describe("frame prompt validation", () => {
  it("accepts an edited generated prompt longer than a short form field", () => {
    const prompt = "detailed frame direction ".repeat(200);

    expect(prompt.length).toBeGreaterThan(2000);
    expect(framePromptSchema.safeParse(prompt).success).toBe(true);
  });

  it("keeps edited prompts within the image provider limit", () => {
    const prompt = "x".repeat(PRISM_MEDIA.maxImagePromptCharacters + 1);

    expect(framePromptSchema.safeParse(prompt).success).toBe(false);
  });
});
