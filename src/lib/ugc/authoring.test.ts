import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockGenerateObject = jest.fn();

jest.mock("ai", () => ({
  ...jest.requireActual<typeof import("ai")>("ai"),
  generateObject: mockGenerateObject,
}));
jest.mock("./model", () => ({ getAuthoringModel: () => ({}) }));

beforeEach(() => mockGenerateObject.mockReset());

describe("analyzeProduct", () => {
  it("sends every product image with the product record and revision context", async () => {
    const { analyzeProduct } = await import("./authoring");
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        summary: "summary",
        appearance: "appearance",
        specs: [],
        sellingPoints: ["point"],
        scenarios: [],
        sources: [],
        missing: [],
      },
    });
    const images = Array.from(
      { length: 8 },
      (_, index) => `https://example.com/product-${index + 1}.jpg`,
    );

    await analyzeProduct({
      name: "Night mask",
      variant: "70 ml",
      market: "US",
      imageUrls: images,
      feedback: "The second image is the back label.",
      previousFacts: {
        summary: "old summary",
        appearance: "old appearance",
        specs: [],
        sellingPoints: ["old point"],
        scenarios: [],
        sources: ["uploaded image 1"],
      },
    });

    const request = mockGenerateObject.mock.calls[0]![0] as {
      messages: { content: { type: string; text?: string }[] }[];
    };
    const content = request.messages[0]!.content;
    expect(content.filter((part) => part.type === "file")).toHaveLength(8);
    expect(content.filter((part) => part.type === "text").at(-1)?.text).toBe(
      "Product reference image 8 of 8",
    );
    expect(content[0]!.text).toContain("Variant: 70 ml");
    expect(content[0]!.text).toContain("Previous analysis to revise");
    expect(content[0]!.text).toContain("The second image is the back label.");
  });
});

describe("composeScript", () => {
  it("uses the talent and every product reference and derives spoken copy from beats", async () => {
    const { composeScript } = await import("./authoring");
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        title: "Bedtime routine",
        hook: "Last step.",
        productionPrompt:
          "OVERVIEW: close phone vlog\nTALENT: reference talent",
        beats: [
          {
            start: 0,
            end: 7,
            shot: "selfie close-up",
            action: "opens the jar",
            camera: "brief autofocus shift",
            voiceover: "Last step.",
          },
          {
            start: 7,
            end: 15,
            shot: "tighter close-up",
            action: "presses gel into cheek",
            camera: "small handheld drift",
            voiceover: "Then sleep.",
          },
        ],
        captions: [],
        publishCaption: "Night routine",
        disclosure: "AI-generated content.",
      },
    });
    const productImages = Array.from(
      { length: 8 },
      (_, index) => `https://example.com/product-${index + 1}.jpg`,
    );

    const result = await composeScript({
      productName: "Night mask",
      facts: {
        summary: "A sleeping mask",
        appearance: "Blue jar",
        specs: ["70 ml"],
        sellingPoints: ["Hydrating"],
        scenarios: ["Bedtime"],
        sources: ["uploaded images"],
      },
      template: "spokesperson",
      locale: "en",
      market: "US",
      aspectRatio: "9:16",
      productImageUrls: productImages,
      talentImageUrl: "https://example.com/talent.jpg",
      talentNote: "Young adult woman",
    });

    const request = mockGenerateObject.mock.calls[0]![0] as {
      system: string;
      messages: { content: { type: string; text?: string }[] }[];
    };
    const content = request.messages[0]!.content;
    expect(content.filter((part) => part.type === "file")).toHaveLength(9);
    expect(request.system).toContain("CAMERA CHARACTER");
    expect(request.system).toContain("exact spoken dialogue");
    expect(request.system).toContain("portrait");
    expect(request.system).toContain("9:16");
    expect(result.voiceover).toBe("Last step. Then sleep.");
  });
});

describe("composeTalentImagePrompt", () => {
  it("expands the user's direction and sends the optional reference image", async () => {
    const { composeTalentImagePrompt } = await import("./authoring");
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        prompt:
          "iPhone selfie, slightly below eye level, photoreal adult creator, warm late-afternoon light.",
      },
    });

    const result = await composeTalentImagePrompt({
      name: "Mia",
      description:
        "Young adult woman with long light-brown hair at a Mediterranean cafe.",
      referenceImageUrls: ["https://example.com/mia.jpg"],
    });

    const request = mockGenerateObject.mock.calls[0]![0] as {
      system: string;
      messages: { content: { type: string; text?: string }[] }[];
    };
    const content = request.messages[0]!.content;
    expect(request.system).toContain("camera type");
    expect(request.system).toContain("facial identity");
    expect(content.filter((part) => part.type === "file")).toHaveLength(1);
    expect(content[0]!.text).toContain("Mia");
    expect(content[0]!.text).toContain("Mediterranean cafe");
    expect(result).toContain("iPhone selfie");
  });
});
