import { generateObject } from "ai";
import { z } from "zod";
import { getAuthoringModel } from "./model";
import {
  CLIP_SPEC,
  beatsCoverDuration,
  type ScriptTemplate,
  type VideoAspectRatio,
} from "./constants";
import { voiceoverFitsBeats } from "./speech-estimate";
import type {
  CloneBlueprint,
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

const talentImagePromptSchema = z.object({
  prompt: z.string().min(1).max(12_000),
});

export interface ComposeTalentImagePromptInput {
  name: string;
  description: string;
  referenceImageUrls: string[];
}

/** Turns a short operator brief into one complete, shootable portrait prompt. */
export async function composeTalentImagePrompt(
  input: ComposeTalentImagePromptInput,
): Promise<string> {
  const { object } = await generateObject({
    model: getAuthoringModel(),
    schema: talentImagePromptSchema,
    system: [
      "You write one production-ready prompt for a photorealistic adult talent reference image.",
      "This image is a reusable identity reference, never a product scene or an advertisement. Show only the person and an ordinary unobtrusive environment.",
      "Preserve every explicit fact in the operator brief. Expand missing photographic detail coherently without changing the requested identity, clothing, setting, or mood.",
      "The person must not hold, touch, present, point to, look at, or interact with any product, package, device, prop, tool, container, food, drink, bag, or branded object. Keep both hands visibly empty and relaxed, or place them naturally outside the crop.",
      "If the operator brief or a reference image mentions or shows an object, use it only as context for the person's identity and omit the object completely from the generated scene. Never invent a generic substitute such as 'a small digital product'.",
      "Write in the same language as the operator brief.",
      "Describe camera type, selfie or photographer viewpoint, camera height and angle, crop, facial structure, complexion, eyes, lips, hair, complete modest outfit, accessories, pose, setting, background depth, light direction, colour temperature, expression, attitude, skin texture, and phone-camera realism.",
      "Finish with positive identity and wardrobe locks plus concise negative constraints. The subject must be an adult. Explicitly include empty hands and no products, props, packages, devices, logos, or branded objects. Also exclude swimwear, exposed midriff, sexualised pose, text overlay, watermark, beauty filter, plastic skin, and anatomical errors.",
      input.referenceImageUrls.length
        ? "Reference images are attached. State that facial identity, facial proportions, complexion, eyes, and hair must match the reference exactly; use the operator brief for intentional wardrobe or setting changes. Do not reproduce any item held by the person in a reference image."
        : "No reference image is attached. Define one coherent fictional adult identity from the operator brief.",
      "Return only the final image prompt in `prompt`, with no explanation or markdown.",
      "Before returning, audit the prompt sentence by sentence and remove every product interaction, held item, display gesture, and branded object. Identity and appearance are the only subject matter.",
    ].join("\n"),
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text" as const,
            text: `Talent name: ${input.name}\nOperator brief:\n${input.description}`,
          },
          ...input.referenceImageUrls.flatMap((url, index) => [
            {
              type: "text" as const,
              text: `Talent reference image ${index + 1} of ${input.referenceImageUrls.length}`,
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

  return object.prompt;
}

const scriptSchema = (durationSeconds: number, locale: string) =>
  z
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
        .min(
          Math.max(2, Math.ceil(durationSeconds / CLIP_SPEC.maxSegmentSeconds)),
        )
        .max(Math.ceil(durationSeconds / CLIP_SPEC.minSegmentSeconds))
        .refine(
          (beats) =>
            beatsCoverDuration(beats, durationSeconds) &&
            voiceoverFitsBeats(beats, locale),
        ),
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
      "Do not record prices, discounts, availability, inventory, or storefront state; they are not part of this product record.",
      "When prior analysis is supplied, revise it rather than merely repeating it. Operator feedback is a requested correction or clarification; apply it wherever the supplied material supports it and call out unresolved conflicts under `missing`.",
      "List anything a short product video would need but the material does not provide under `missing`.",
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
  aspectRatio: VideoAspectRatio;
  productName: string;
  productImageUrls?: string[];
  talentImageUrl?: string | null;
  talentNote?: string | null;
  durationSeconds?: number;
  /** Set when this clip rebuilds a reference video rather than starting blank. */
  blueprint?: CloneBlueprint | null;
}

/**
 * The blueprint as instructions rather than as a record.
 *
 * Only the relationships travel. Source seconds are left behind on purpose:
 * this clip has its own duration and its own performer, and copying the
 * reference's clock is the one way a clone reliably goes wrong.
 */
function blueprintDirection(blueprint: CloneBlueprint): string {
  return [
    `Reference format: ${blueprint.format}.`,
    `How its opening earns attention: ${blueprint.hook}`,
    `Why the piece works: ${blueprint.whyItWorks}`,
    "Rebuild these beats in order, in proportion to this clip's own duration:",
    ...blueprint.beats.map((beat, index) => {
      const events = beat.events
        .map(
          (event) =>
            `${event.kind} answering "${event.respondsTo}" — ${event.purpose}`,
        )
        .join("; ");
      return [
        `${index + 1}. [${beat.role}] ${beat.purpose}`,
        beat.spokenGist ? ` Said here, in gist: ${beat.spokenGist}.` : "",
        events ? ` Visual events: ${events}.` : "",
      ].join("");
    }),
    `Preserve: ${blueprint.preserve.join("; ")}`,
    blueprint.redesign.length
      ? `Belongs to the original and must be replaced with something of this product's own: ${blueprint.redesign.join("; ")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function templateBrief(template: ScriptTemplate): ScriptTemplateBrief {
  return TEMPLATE_BRIEFS[template];
}

/**
 * Writes a script divided into independently generatable timed shots.
 */
export async function composeScript(
  input: ComposeScriptInput,
): Promise<ScriptDraft> {
  const brief = templateBrief(input.template);
  const durationSeconds = input.durationSeconds ?? CLIP_SPEC.durationSeconds;

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
    schema: scriptSchema(durationSeconds, input.locale),
    system: [
      `You are both the writer and director of a ${durationSeconds}-second ${input.aspectRatio} UGC video. Produce a shootable production script, not a marketing outline.`,
      `Compose every shot and camera move for a ${input.aspectRatio === "9:16" ? "portrait" : "landscape"} frame. Record the ${input.aspectRatio} ratio in OUTPUT SETTINGS.`,
      `Structure: ${brief.structure}`,
      `Voice: ${brief.voice}`,
      `Write every field in ${input.locale} for the ${input.market} market, using local wording, units, and everyday scenes.`,
      `The whole spoken track must be sayable in ${durationSeconds} seconds at an unhurried, natural pace; do not pad it.`,
      "Each beat's spoken line must also fit its own duration. Keep narration concise and leave natural pauses.",
      "Use only the supplied product facts. Never state a price, a discount, a medical or safety claim, or a consumer testimonial.",
      "The result must feel like a real person filming themselves, not a polished advert. Use concrete micro-behaviour, natural pauses, imperfect phone-camera movement, focus changes, material physics, and ambient sound appropriate to the scene.",
      "Keep one coherent performer identity, product appearance, wardrobe, location, lighting condition, and time of day from first frame to last. Product packaging, colours, proportions, finish, texture, and any supported label text must remain accurate and legible when shown.",
      "The `productionPrompt` must be a complete standalone prompt with clearly labelled sections: OVERVIEW, TALENT, PRODUCT, LOCATION, LIGHTING, FRAMING, PERFORMANCE, VOICE, REALISM, PHYSICS, CAMERA CHARACTER, STYLE, AUDIO, OUTPUT SETTINGS, POSITIVE LOCKS, and NEGATIVE CONSTRAINTS. Include the exact timed beats and dialogue inside it as well.",
      `Each beat is a separately generated shot lasting ${CLIP_SPEC.minSegmentSeconds}-${CLIP_SPEC.maxSegmentSeconds} seconds. Use at least ${Math.max(2, Math.ceil(durationSeconds / CLIP_SPEC.maxSegmentSeconds))} beats. Every beat must include a visible action, shot, camera movement, and exact spoken dialogue. Keep locations, identity and product consistent across shots.`,
      "Captions must be short enough to sit clear of the platform buttons and the product card, and must never describe a tappable shopping element.",
      "`disclosure` is a single sentence stating that the clip is AI-generated content, written in the same language.",
      "Beat timings must cover the full duration without gaps or overlap.",
      "Two optional annotations may appear inside `voiceover`, and nowhere else. Write `<GT-7000|gee tee seven thousand>` when the caption should read one way and the performer should say it another; use it for model numbers, units, abbreviations and invented product words, and keep the spoken side to a few short words. Write `||` where a caption must break, at the end of a complete thought. Use both sparingly; plain text is correct when neither is needed.",
      input.blueprint
        ? "A reference blueprint is supplied. Rebuild what it describes for this product: the same roles in the same order, the same reasons for each visual event, the same shape of argument. Nothing else carries over."
        : "",
      input.blueprint
        ? "Write every line from this product's own facts. Do not reuse the reference's wording, its examples, its jokes, or its claims, and never mention the reference or its creator."
        : "",
      input.blueprint
        ? "The reference's own timings do not apply. Fit the rebuilt structure to this clip's duration, dropping or merging beats when it is shorter."
        : "",
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
          ...(input.blueprint
            ? [
                {
                  type: "text" as const,
                  text: `Reference blueprint to rebuild:\n${blueprintDirection(input.blueprint)}`,
                },
              ]
            : []),
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
