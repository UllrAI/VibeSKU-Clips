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
        overview: "summary",
        highlights: ["point"],
        sources: [],
        warnings: [],
        keyImages: [],
      },
    });
    const images = Array.from(
      { length: 8 },
      (_, index) => `https://example.com/product-${index + 1}.jpg`,
    );

    await analyzeProduct({
      name: "Night mask",
      info: "70 ml night mask",
      imageUrls: images,
      feedback: "The second image is the back label.",
      previousFacts: {
        overview: "old summary",
        highlights: ["old point"],
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
    expect(content[0]!.text).toContain("70 ml night mask");
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
        productionDirection: {
          performance: "Underplayed delivery",
          physics: "Natural hand contact",
          cameraCharacter: "Small handheld corrections",
          style: "Casual phone footage",
          audio: "Quiet room tone",
          outputSettings: "Portrait 9:16, 15 seconds",
        },
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
        overview: "A sleeping mask in a blue 70 ml jar",
        highlights: ["Hydrating", "For bedtime use"],
        sources: ["uploaded images"],
      },
      template: "spokesperson",
      locale: "en",
      market: "US",
      aspectRatio: "9:16",
      creativeDirection:
        "Keep it quiet and natural. Start mid-sentence and avoid sales language.",
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
    expect(request.system).toContain(
      "PERFORMANCE, PHYSICS, CAMERA CHARACTER, STYLE, AUDIO, OUTPUT SETTINGS",
    );
    expect(request.system).toContain(
      "No `productionDirection` field may describe or rename the performer",
    );
    expect(request.system).toContain("visibly different in action");
    expect(request.system).toContain("unsent voice note");
    expect(request.system).toContain("one narrow creative angle");
    expect(request.system).toContain("stock creator hooks");
    expect(content[0]!.text).toContain(
      "Direction for this clip (highest-priority creative instruction;",
    );
    expect(content[0]!.text).toContain("Keep it quiet and natural");
    expect(content[0]!.text).toContain("Candidate creative angles");
    expect(content[0]!.text).toContain(
      "open on the practical question this demo answers",
    );
    expect(result.productionPrompt).toContain(
      "PERFORMANCE: Underplayed delivery",
    );
    expect(result.productionPrompt).toContain(
      "OUTPUT SETTINGS: Portrait 9:16, 15 seconds",
    );
    expect(result.productionPrompt).not.toContain("TALENT:");
    expect(result.voiceover).toBe("Last step. Then sleep.");
  });

  it("treats a garment talent's existing outfit as identity evidence only", async () => {
    const { composeScript } = await import("./authoring");
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        title: "Fit check",
        hook: "Here is the fit.",
        productionDirection: {
          performance: "Relaxed fit check",
          physics: "Natural fabric movement",
          cameraCharacter: "Steady handheld phone",
          style: "Natural phone capture",
          audio: "Quiet room tone",
          outputSettings: "Portrait 9:16, 15 seconds",
        },
        beats: [
          {
            start: 0,
            end: 7,
            shot: "full-length front view",
            action: "wears the product garment",
            camera: "steady phone framing",
            voiceover: "Here is the front.",
          },
          {
            start: 7,
            end: 15,
            shot: "full-length rear view",
            action: "turns to show the back",
            camera: "small handheld correction",
            voiceover: "And the back.",
          },
        ],
        captions: [],
        publishCaption: "Fit check",
        disclosure: "AI-generated content.",
      },
    });

    await composeScript({
      productName: "Linen overshirt",
      facts: {
        overview: "A beige linen overshirt",
        highlights: [],
        sources: ["uploaded images"],
      },
      template: "apparel",
      locale: "en",
      market: "US",
      aspectRatio: "9:16",
      talentImageUrl: "https://example.com/talent.jpg",
      talentNote: "A creator wearing a red jacket and black boots",
    });

    const request = mockGenerateObject.mock.calls[0]![0] as {
      system: string;
      messages: { content: { type: string; text?: string }[] }[];
    };
    expect(request.system).toContain(
      "talent reference supplies identity and body build only",
    );
    expect(request.system).toContain(
      "product is the garment the performer wears",
    );
    expect(request.messages[0]!.content[0]!.text).toContain(
      "Performer identity reference only",
    );
    expect(request.messages[0]!.content[0]!.text).not.toContain("red jacket");
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
    // The identity describes the person; the sheet decides how they are shot.
    expect(request.system).toContain("Do not specify a camera");
    expect(request.system).toContain("facial identity");
    expect(request.system).toContain("reusable identity reference");
    expect(request.system).toContain("replaceable default styling");
    expect(request.system).toContain(
      "Omit any location, scene, camera, or product context",
    );
    expect(request.system).toContain("both hands visibly empty");
    expect(request.system).toContain("small digital product");
    expect(request.system).toContain(
      "Do not reproduce any item held by the person",
    );
    expect(content.filter((part) => part.type === "file")).toHaveLength(1);
    expect(content[0]!.text).toContain("Mia");
    expect(content[0]!.text).toContain("Mediterranean cafe");
    expect(result).toContain("iPhone selfie");
  });
});

describe("composeSceneImagePrompt", () => {
  it("keeps a reusable scene separate from people, products, and shots", async () => {
    const { composeSceneImagePrompt } = await import("./authoring");
    mockGenerateObject.mockResolvedValueOnce({
      object: { prompt: "A lived-in pale oak kitchen in afternoon light." },
    });

    await composeSceneImagePrompt({
      name: "Kitchen",
      description: "Small city kitchen with pale oak counters",
      referenceImageUrls: ["https://example.com/kitchen.jpg"],
    });

    const request = mockGenerateObject.mock.calls[0]![0] as {
      system: string;
      messages: { content: { type: string; text?: string }[] }[];
    };
    expect(request.system).toContain("empty place");
    expect(request.system).toContain(
      "No people, no hands, no pets, and no product",
    );
    expect(request.system).toContain("Do not specify a camera");
    expect(request.system).toContain(
      "Omit any person or product visible in a reference image",
    );
    expect(
      request.messages[0]!.content.filter((part) => part.type === "file"),
    ).toHaveLength(1);
  });
});
