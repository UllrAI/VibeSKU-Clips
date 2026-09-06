import { generateObject } from "ai";
import { z } from "zod";
import { getAuthoringModel } from "./model";
import {
  CLIP_SPEC,
  voiceoverBudgetFor,
  type ScriptTemplate,
} from "./constants";
import type {
  ProductBrief,
  ProductFacts,
  ScriptDraft,
  ScriptTemplateBrief,
} from "./types";
import { TEMPLATE_BRIEFS } from "./templates";

const factsSchema = z.object({
  summary: z.string().min(1),
  appearance: z.string().min(1),
  specs: z.array(z.string()).max(12),
  sellingPoints: z.array(z.string()).min(1).max(8),
  scenarios: z.array(z.string()).max(6),
  sources: z.array(z.string()).max(16),
  missing: z.array(z.string()).max(6),
});

function timingsCoverClip(beats: { start: number; end: number }[]): boolean {
  return (
    beats.every(
      (beat, index) =>
        beat.end > beat.start &&
        Math.abs(beat.start - (index === 0 ? 0 : beats[index - 1]!.end)) < 0.01,
    ) && Math.abs(beats.at(-1)!.end - CLIP_SPEC.durationSeconds) < 0.01
  );
}

const scriptSchema = z
  .object({
    title: z.string().min(1),
    hook: z.string().min(1),
    productionPrompt: z.string().min(1).max(30_000),
    beats: z
      .array(
        z.object({
          start: z.number().min(0),
          end: z.number().min(0),
          shot: z.string().min(1),
          action: z.string().min(1),
          camera: z.string().min(1),
          voiceover: z.string(),
        }),
      )
      .min(2)
      .max(6)
      .refine(timingsCoverClip),
    captions: z.array(z.string().min(1)).max(8),
    publishCaption: z.string().min(1),
    disclosure: z.string().min(1),
  })
  .refine((script) => script.beats.some((beat) => beat.voiceover.trim()));

export interface AnalyzeProductInput {
  name: string;
  variant?: string | null;
  sourceText?: string;
  imageUrls: string[];
  brief?: ProductBrief | null;
  market?: string | null;
  previousFacts?: ProductFacts | null;
  feedback?: string | null;
}

/**
 * Turns operator-supplied material into recorded product facts. Anything the
 * material does not support is listed under `missing` so the product can be
 * paused for a top-up instead of being invented by the script step.
 */
export async function analyzeProduct(
  input: AnalyzeProductInput,
): Promise<ProductFacts> {
  const { object } = await generateObject({
    model: getAuthoringModel(),
    schema: factsSchema,
    system: [
      "You extract product facts for short-form commerce video production.",
      "Only record what the supplied material supports. Never infer a price, a certification, a health claim, or a comparison.",
      "When prior analysis is supplied, revise it rather than merely repeating it. Operator feedback is a requested correction or clarification; apply it wherever the supplied material supports it and call out unresolved conflicts under `missing`.",
      "List anything a 15-second product video would need but the material does not provide under `missing`.",
      "`sources` names where each group of facts came from, for example 'product page' or 'uploaded image 2'.",
      "Write every field in the language of the supplied material.",
    ].join("\n"),
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text" as const,
            text: [
              `Product name: ${input.name}`,
              input.variant ? `Variant: ${input.variant}` : "",
              input.market ? `Target market: ${input.market}` : "",
              input.brief?.audience ? `Audience: ${input.brief.audience}` : "",
              input.brief?.sellingPoints?.length
                ? `Operator selling points: ${input.brief.sellingPoints.join("; ")}`
                : "",
              input.brief?.bannedPhrases?.length
                ? `Do not use: ${input.brief.bannedPhrases.join("; ")}`
                : "",
              input.brief?.tone ? `Creative tone: ${input.brief.tone}` : "",
              input.brief?.scenes
                ? `Requested scenes: ${input.brief.scenes}`
                : "",
              input.brief?.providedScript
                ? `Operator script or production direction:\n${input.brief.providedScript}`
                : "",
              input.previousFacts
                ? `Previous analysis to revise:\n${JSON.stringify(input.previousFacts)}`
                : "No previous analysis exists.",
              input.feedback
                ? `Operator feedback for this revision:\n${input.feedback}`
                : "No revision feedback was supplied.",
              input.sourceText
                ? `Product page text:\n${input.sourceText.slice(0, 6000)}`
                : "No product page text was supplied.",
            ]
              .filter(Boolean)
              .join("\n"),
          },
          ...input.imageUrls.flatMap((url, index) => [
            {
              type: "text" as const,
              text: `Product reference image ${index + 1} of ${input.imageUrls.length}`,
            },
            {
              type: "file" as const,
              data: new URL(url),
              mediaType: "image",
            },
          ]),
        ],
      },
    ],
  });

  return object;
}

export interface ComposeScriptInput {
  facts: ProductFacts;
  brief?: ProductBrief | null;
  template: ScriptTemplate;
  locale: string;
  market: string;
  productName: string;
  productImageUrls?: string[];
  talentImageUrl?: string | null;
  talentNote?: string | null;
}

function templateBrief(template: ScriptTemplate): ScriptTemplateBrief {
  return TEMPLATE_BRIEFS[template];
}

/**
 * Writes one localised 15-second script from the confirmed product facts.
 */
export async function composeScript(
  input: ComposeScriptInput,
): Promise<ScriptDraft> {
  const brief = templateBrief(input.template);
  const budget = voiceoverBudgetFor(input.locale);

  const productImages = input.productImageUrls ?? [];
  const brief_ = [
    `Product: ${input.productName}`,
    `Summary: ${input.facts.summary}`,
    `Appearance: ${input.facts.appearance}`,
    `Selling points: ${input.facts.sellingPoints.join("; ")}`,
    input.facts.specs.length ? `Specs: ${input.facts.specs.join("; ")}` : "",
    input.facts.scenarios.length
      ? `Scenarios: ${input.facts.scenarios.join("; ")}`
      : "",
    input.talentNote
      ? `Performer: ${input.talentNote}`
      : "Performer: none. Keep the video product-led with hands only and no recognisable face.",
    input.brief?.audience ? `Audience: ${input.brief.audience}` : "",
    input.brief?.tone ? `Tone: ${input.brief.tone}` : "",
    input.brief?.scenes ? `Requested scenes: ${input.brief.scenes}` : "",
    input.brief?.bannedPhrases?.length
      ? `Banned expressions: ${input.brief.bannedPhrases.join("; ")}`
      : "",
    input.brief?.providedScript
      ? `Operator-supplied script or production direction (honour every explicit constraint and keep quoted dialogue verbatim):\n${input.brief.providedScript}`
      : "",
    `Creative angle: ${brief.angles[0]}`,
  ]
    .filter(Boolean)
    .join("\n");

  const { object } = await generateObject({
    model: getAuthoringModel(),
    schema: scriptSchema,
    system: [
      `You are both the writer and director of a ${CLIP_SPEC.durationSeconds}-second vertical UGC video. Produce a shootable production script, not a marketing outline.`,
      `Structure: ${brief.structure}`,
      `Voice: ${brief.voice}`,
      `Write every field in ${input.locale} for the ${input.market} market, using local wording, units, and everyday scenes.`,
      `The spoken track must fit ${budget} units of speech; do not pad it.`,
      "Use only the supplied product facts. Never state a price, a discount, a medical or safety claim, or a consumer testimonial.",
      "The result must feel like a real person filming themselves, not a polished advert. Use concrete micro-behaviour, natural pauses, imperfect phone-camera movement, focus changes, material physics, and ambient sound appropriate to the scene.",
      "Keep one coherent performer identity, product appearance, wardrobe, location, lighting condition, and time of day from first frame to last. Product packaging, colours, proportions, finish, texture, and any supported label text must remain accurate and legible when shown.",
      "The `productionPrompt` must be a complete standalone prompt with clearly labelled sections: OVERVIEW, TALENT, PRODUCT, LOCATION, LIGHTING, FRAMING, PERFORMANCE, VOICE, REALISM, PHYSICS, CAMERA CHARACTER, STYLE, AUDIO, OUTPUT SETTINGS, POSITIVE LOCKS, and NEGATIVE CONSTRAINTS. Include the exact timed beats and dialogue inside it as well.",
      "Each beat must say exactly what is visible in `action`, how it is framed in `shot`, how the phone/camera moves and focuses in `camera`, and the exact spoken dialogue in `voiceover`. Use three to five beats unless the supplied direction explicitly needs another count.",
      "Captions must be short enough to sit clear of the platform buttons and the product card, and must never describe a tappable shopping element.",
      "`disclosure` is a single sentence stating that the clip is AI-generated content, written in the same language.",
      "Beat timings must cover the full duration without gaps or overlap.",
      productImages.length || input.talentImageUrl
        ? "Reference images are attached and labelled. Use every attached image as evidence. Do not invent a colour, finish, label, facial feature, garment, or component that is not visible or recorded in the facts."
        : "",
    ]
      .filter(Boolean)
      .join("\n"),
    messages: [
      {
        role: "user",
        content: [
          { type: "text" as const, text: brief_ },
          ...(input.talentImageUrl
            ? [
                { type: "text" as const, text: "Talent reference image" },
                {
                  type: "file" as const,
                  data: new URL(input.talentImageUrl),
                  mediaType: "image",
                },
              ]
            : []),
          ...productImages.flatMap((url, index) => [
            {
              type: "text" as const,
              text: `Product reference image ${index + 1} of ${productImages.length}`,
            },
            {
              type: "file" as const,
              data: new URL(url),
              mediaType: "image",
            },
          ]),
        ],
      },
    ],
  });

  return {
    ...object,
    voiceover: object.beats
      .map((beat) => beat.voiceover.trim())
      .filter(Boolean)
      .join(" "),
  };
}
