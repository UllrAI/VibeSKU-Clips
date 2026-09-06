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
import { defaultDisclosure, TEMPLATE_BRIEFS } from "./templates";

const factsSchema = z.object({
  summary: z.string().min(1),
  appearance: z.string().min(1),
  specs: z.array(z.string()).max(12),
  sellingPoints: z.array(z.string()).min(1).max(8),
  scenarios: z.array(z.string()).max(6),
  sources: z.array(z.string()).max(8),
  missing: z.array(z.string()).max(6),
});

const scriptSchema = z.object({
  title: z.string().min(1),
  hook: z.string().min(1),
  beats: z
    .array(
      z.object({
        start: z.number().min(0),
        end: z.number().min(0),
        shot: z.string().min(1),
        action: z.string().min(1),
        voiceover: z.string(),
      }),
    )
    .min(2)
    .max(6),
  voiceover: z.string().min(1),
  captions: z.array(z.string().min(1)).min(2).max(8),
  publishCaption: z.string().min(1),
  disclosure: z.string().min(1),
});

export interface AnalyzeProductInput {
  name: string;
  sourceText?: string;
  imageUrls: string[];
  brief?: ProductBrief | null;
  market?: string | null;
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
              input.market ? `Target market: ${input.market}` : "",
              input.brief?.audience ? `Audience: ${input.brief.audience}` : "",
              input.brief?.sellingPoints?.length
                ? `Operator selling points: ${input.brief.sellingPoints.join("; ")}`
                : "",
              input.brief?.bannedPhrases?.length
                ? `Do not use: ${input.brief.bannedPhrases.join("; ")}`
                : "",
              input.sourceText
                ? `Product page text:\n${input.sourceText.slice(0, 6000)}`
                : "No product page text was supplied.",
            ]
              .filter(Boolean)
              .join("\n"),
          },
          ...input.imageUrls.slice(0, 6).map((url) => ({
            type: "file" as const,
            data: new URL(url),
            mediaType: "image",
          })),
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
  /** Product shots, and the talent reference when one is cast. */
  imageUrls?: string[];
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

  if (input.brief?.providedScript) {
    return lockedScriptFrom(input.brief.providedScript, input);
  }

  const images = (input.imageUrls ?? []).slice(0, 6);
  const brief_ = [
    `Product: ${input.productName}`,
    `Summary: ${input.facts.summary}`,
    `Appearance: ${input.facts.appearance}`,
    `Selling points: ${input.facts.sellingPoints.join("; ")}`,
    input.facts.specs.length ? `Specs: ${input.facts.specs.join("; ")}` : "",
    input.facts.scenarios.length
      ? `Scenarios: ${input.facts.scenarios.join("; ")}`
      : "",
    input.talentNote ? `Performer: ${input.talentNote}` : "",
    input.brief?.audience ? `Audience: ${input.brief.audience}` : "",
    input.brief?.tone ? `Tone: ${input.brief.tone}` : "",
    input.brief?.scenes ? `Requested scenes: ${input.brief.scenes}` : "",
    input.brief?.bannedPhrases?.length
      ? `Banned expressions: ${input.brief.bannedPhrases.join("; ")}`
      : "",
    `Creative angle: ${brief.angles[0]}`,
  ]
    .filter(Boolean)
    .join("\n");

  const { object } = await generateObject({
    model: getAuthoringModel(),
    schema: scriptSchema,
    system: [
      `You write ${CLIP_SPEC.durationSeconds}-second vertical UGC scripts for TikTok Shop creators.`,
      `Structure: ${brief.structure}`,
      `Voice: ${brief.voice}`,
      `Write every field in ${input.locale} for the ${input.market} market, using local wording, units, and everyday scenes.`,
      `The spoken track must fit ${budget} units of speech; do not pad it.`,
      "Use only the supplied product facts. Never state a price, a discount, a medical or safety claim, or a consumer testimonial.",
      "Captions must be short enough to sit clear of the platform buttons and the product card, and must never describe a tappable shopping element.",
      "`disclosure` is a single sentence stating that the clip is AI-generated content, written in the same language.",
      "Beat timings must cover the full duration without gaps or overlap.",
      images.length
        ? "Reference images of the product and the performer are attached. Describe what is actually in them; do not invent a colour, a finish, or a component you cannot see."
        : "",
    ]
      .filter(Boolean)
      .join("\n"),
    messages: [
      {
        role: "user",
        content: [
          { type: "text" as const, text: brief_ },
          ...images.map((url) => ({
            type: "file" as const,
            data: new URL(url),
            mediaType: "image",
          })),
        ],
      },
    ],
  });

  return object;
}

/**
 * A supplied script is treated as locked copy: it is split into beats for the
 * renderer but its wording is passed through untouched.
 */
function lockedScriptFrom(
  providedScript: string,
  input: ComposeScriptInput,
): ScriptDraft {
  const lines = providedScript
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const spoken = lines.join(" ");
  const step = CLIP_SPEC.durationSeconds / Math.max(1, lines.length);

  return {
    title: `${input.productName} · ${input.locale}`,
    hook: lines[0] ?? spoken,
    beats: lines.map((line, index) => ({
      start: Number((index * step).toFixed(2)),
      end: Number(((index + 1) * step).toFixed(2)),
      shot: templateBrief(input.template).shots[
        index % templateBrief(input.template).shots.length
      ],
      action: line,
      voiceover: line,
    })),
    voiceover: spoken,
    captions: lines,
    publishCaption: lines[0] ?? spoken,
    disclosure: defaultDisclosure(input.locale),
  };
}
