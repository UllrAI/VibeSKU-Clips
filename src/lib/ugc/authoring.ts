import { generateObject } from "ai";
import { z } from "zod";
import { getAuthoringModel } from "./model";
import {
  CLIP_SPEC,
  MAX_PRODUCT_IMAGES,
  voiceoverBudgetFor,
  type ScriptTemplate,
  type VideoAspectRatio,
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
  keyImages: z.array(z.number().int().min(0)).max(MAX_PRODUCT_IMAGES),
});

const talentImagePromptSchema = z.object({
  prompt: z.string().min(1).max(12_000),
});

export interface ComposeTalentImagePromptInput {
  name: string;
  description: string;
  referenceImageUrls: string[];
}

/**
 * Turns a short operator brief into one complete description of a person.
 *
 * This is the identity, not a photograph of it: the reference sheet fixes the
 * viewpoints, so a camera angle or a crop written in here would only be
 * something the sheet has to override.
 */
export async function composeTalentImagePrompt(
  input: ComposeTalentImagePromptInput,
): Promise<string> {
  const { object } = await generateObject({
    model: getAuthoringModel(),
    schema: talentImagePromptSchema,
    system: [
      "You describe one photorealistic adult person for a reusable identity reference sheet.",
      "This is an identity reference, never a product scene or an advertisement. Only the person is described; they will be drawn against a plain neutral ground.",
      "Preserve every explicit fact in the operator brief. Expand missing photographic detail coherently without changing the requested identity, clothing, setting, or mood.",
      "The person must not hold, touch, present, point to, look at, or interact with any product, package, device, prop, tool, container, food, drink, bag, or branded object. Keep both hands visibly empty and relaxed, or place them naturally outside the crop.",
      "If the operator brief or a reference image mentions or shows an object, use it only as context for the person's identity and omit the object completely from the generated scene. Never invent a generic substitute such as 'a small digital product'.",
      "Write in the same language as the operator brief.",
      "Describe the person rather than a photograph of them: age, build and height, facial structure, complexion, eyes, lips, the colour, cut, and texture of the hair, a complete modest outfit with its colours and materials, footwear, accessories, bearing, expression, attitude, and skin texture.",
      "Do not specify a camera, a viewpoint, a camera height, a crop, or a pose. The reference sheet fixes all of those, and anything written here would only have to be overridden.",
      "Finish with positive identity and wardrobe locks plus concise negative constraints. The subject must be an adult. Explicitly include empty hands and no products, props, packages, devices, logos, or branded objects. Also exclude swimwear, exposed midriff, sexualised pose, text overlay, watermark, beauty filter, plastic skin, and anatomical errors.",
      input.referenceImageUrls.length
        ? "Reference images are attached. State that facial identity, facial proportions, complexion, eyes, and hair must match the reference exactly; use the operator brief for intentional wardrobe changes. Do not reproduce any item held by the person in a reference image."
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

const sceneImagePromptSchema = z.object({
  prompt: z.string().min(1).max(12_000),
});

export interface ComposeSceneImagePromptInput {
  name: string;
  description: string;
  referenceImageUrls: string[];
}

/**
 * Turns a short operator brief into one complete description of a place.
 *
 * A scene is a location, not a shot: the prompt has to fix the architecture,
 * surfaces, furniture, props, light and time of day precisely enough that
 * three separate draws land in the same room, and say nothing about who is in
 * it or what is being sold.
 */
export async function composeSceneImagePrompt(
  input: ComposeSceneImagePromptInput,
): Promise<string> {
  const { object } = await generateObject({
    model: getAuthoringModel(),
    schema: sceneImagePromptSchema,
    system: [
      "You describe one photorealistic place for a reusable location reference sheet.",
      "This is a set reference: an empty place, described as it is. It is never an advertisement and never a scene with a story happening in it.",
      "No people, no hands, no pets, and no product, package, device, or branded object anywhere in the frame. The place must stay recognisable and usable on its own.",
      "Preserve every explicit fact in the operator brief. Expand missing detail coherently without changing the requested location, period, style, or mood.",
      "Write in the same language as the operator brief.",
      "Describe the type of place, the architecture and layout, wall, floor and surface materials, furniture and fittings, the everyday objects that belong there, what is visible through any window, the depth of the space, the direction and quality of the light, the time of day, the weather where it applies, the colour temperature, and the palette.",
      "Describe a place someone lives or works in, not a showroom: a few ordinary things left where they were last put down, furniture that does not line up perfectly, textiles that hang and fold as used textiles do, and the light wear that daily use leaves on surfaces and finishes.",
      "Keep it clean, cared for, and unremarkable. No styling for a catalogue, no colour-matched props, no symmetry arranged for a camera — and equally no mess, no grime, no damage, no clutter, and nothing derelict or poor.",
      "Fix the details that must not drift between viewpoints of this place: the layout, the materials, the light direction, and the time of day.",
      "Do not specify a camera, a viewpoint, a camera height, or a crop. The reference sheet fixes those.",
      "Finish with concise negative constraints: no people, no products, no logos, no text overlay, no watermark, no fisheye distortion, no HDR halo, no impossible architecture, no showroom staging.",
      input.referenceImageUrls.length
        ? "Reference images are attached. State that the layout, materials, fittings, and light of the place must match the references exactly; use the operator brief for intentional changes. Omit any person or product visible in a reference image."
        : "No reference image is attached. Define one coherent real-feeling place from the operator brief.",
      "Return only the final image prompt in `prompt`, with no explanation or markdown.",
    ].join("\n"),
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text" as const,
            text: `Scene name: ${input.name}\nOperator brief:\n${input.description}`,
          },
          ...input.referenceImageUrls.flatMap((url, index) => [
            {
              type: "text" as const,
              text: `Scene reference image ${index + 1} of ${input.referenceImageUrls.length}`,
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
      "Do not record prices, discounts, availability, inventory, or storefront state; they are not part of this product record.",
      "When prior analysis is supplied, revise it rather than merely repeating it. Operator feedback is a requested correction or clarification; apply it wherever the supplied material supports it and call out unresolved conflicts under `missing`.",
      "List anything a 15-second product video would need but the material does not provide under `missing`.",
      "`sources` names where each group of facts came from, for example 'product page' or 'uploaded image 2'.",
      "`keyImages` lists the supplied images that show the product itself most clearly, best first, by their 1-based number minus one. Prefer a clean view of the whole product and a close view of its material or finish. Leave out any image that is mostly a person, a styled lifestyle scene, packaging, a size chart, or text, because a later model is given these as evidence of what the product looks like and will rebuild whatever else is in them. Return an empty list when no image is supplied.",
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
  /** Direction for this clip only, separate from the reusable product brief. */
  creativeDirection?: string | null;
  template: ScriptTemplate;
  locale: string;
  market: string;
  aspectRatio: VideoAspectRatio;
  productName: string;
  productImageUrls?: string[];
  talentImageUrl?: string | null;
  talentNote?: string | null;
  sceneImageUrls?: string[];
  sceneNote?: string | null;
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
  const sceneImages = input.sceneImageUrls ?? [];
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
    input.sceneNote
      ? `Location, already chosen and photographed — every beat happens here:\n${input.sceneNote}`
      : "",
    input.brief?.audience ? `Audience: ${input.brief.audience}` : "",
    input.brief?.tone ? `Tone: ${input.brief.tone}` : "",
    input.brief?.scenes ? `Requested scenes: ${input.brief.scenes}` : "",
    input.brief?.bannedPhrases?.length
      ? `Banned expressions: ${input.brief.bannedPhrases.join("; ")}`
      : "",
    input.brief?.providedScript
      ? `Product-level creative notes (honour every explicit constraint and keep quoted dialogue verbatim):\n${input.brief.providedScript}`
      : "",
    input.creativeDirection
      ? `Direction for this clip (highest-priority creative instruction; honour every explicit constraint and keep quoted dialogue verbatim):\n${input.creativeDirection}`
      : "",
    `Candidate creative angles (choose the single strongest fit for the supplied facts and audience; do not combine them): ${brief.angles.join("; ")}`,
  ]
    .filter(Boolean)
    .join("\n");

  const { object } = await generateObject({
    model: getAuthoringModel(),
    schema: scriptSchema,
    system: [
      `You are both the writer and director of a ${CLIP_SPEC.durationSeconds}-second ${input.aspectRatio} UGC video. Produce a shootable production script, not a marketing outline.`,
      `Compose every shot and camera move for a ${input.aspectRatio === "9:16" ? "portrait" : "landscape"} frame. Record the ${input.aspectRatio} ratio in OUTPUT SETTINGS.`,
      `Structure: ${brief.structure}`,
      `Voice: ${brief.voice}`,
      // The shot vocabulary is what separates a thing held in the hand from a
      // thing worn on the body. Without it every format frames the same way.
      `Compose the beats from this format's shot vocabulary, adapting each one to this product rather than repeating it word for word: ${brief.shots.join("; ")}`,
      `Write every field in ${input.locale} for the ${input.market} market, using local wording, units, and everyday scenes.`,
      input.sceneNote
        ? "A location has been chosen and photographed for this clip. Set every beat inside it, compose the shots from what that place actually contains, and do not move to another location or invent a second one."
        : "",
      `The spoken track must fit ${budget} units of speech; do not pad it.`,
      "Use only the supplied product facts. Never state a price, a discount, a medical or safety claim, or a consumer testimonial.",
      "Choose one narrow creative angle for the whole clip: one concrete buyer question, hesitation, task, or visible detail. Make the opening specific to this product and audience; do not stack several benefits or turn the clip into a feature list.",
      "Write the voiceover like an unsent voice note to one person, not finished ad copy. Short fragments, one small aside or self-correction, and an uneven sentence rhythm are welcome when they sound natural; fake stutters, repeated filler words, and exaggerated reactions are not.",
      "Avoid stock creator hooks and ad language such as 'stop scrolling', 'you need this', 'game changer', 'run, don't walk', 'I'm obsessed', and generic 'I didn't expect this to work' claims. Begin with the specific observation or action instead.",
      "If the supplied facts, product notes, or operator direction contain real customer wording or a real objection, preserve its concrete phrasing instead of polishing it into marketing language. Never invent a quote, review, purchase history, or personal result.",
      "Keep the template structure invisible: the speaker must not sound as if they are stepping through hook, problem, solution, and CTA. End on a plain verdict, best-fit use, caveat, or visible result; only include a sales CTA when the operator explicitly supplied one.",
      "The result must feel like a real person filming themselves, not a polished advert. Use concrete micro-behaviour, natural pauses, imperfect phone-camera movement, focus changes, material physics, and ambient sound appropriate to the scene.",
      "Do not invent personal experience, purchase history, popularity, review counts, long-term results, or a customer testimonial. UGC authenticity comes from the creator's filming and speech patterns, not from made-up proof.",
      "Keep one coherent performer identity, product appearance, wardrobe, location, lighting condition, and time of day from first frame to last. Product packaging, colours, proportions, finish, texture, and any supported label text must remain accurate and legible when shown.",
      "The `productionPrompt` must be a complete standalone visual and performance direction with clearly labelled sections: OVERVIEW, TALENT, PRODUCT, LOCATION, LIGHTING, FRAMING, PERFORMANCE, VOICE, REALISM, PHYSICS, CAMERA CHARACTER, STYLE, AUDIO, OUTPUT SETTINGS, POSITIVE LOCKS, and NEGATIVE CONSTRAINTS. Do not repeat the beat list, timestamps, shot list, actions, or dialogue inside it; those belong only in `beats` so one storyboard frame cannot accidentally depict the whole script.",
      "Each beat must say exactly what is visible in `action`, how it is framed in `shot`, how the phone/camera moves and focuses in `camera`, and the exact spoken dialogue in `voiceover`. Use three to five beats unless the supplied direction explicitly needs another count.",
      "Make adjacent beats visibly different in action and composition. Change at least two of shot size, camera viewpoint, performer orientation, body pose, or product interaction between neighbouring beats; never fill a storyboard with repeated front-facing poses.",
      ["apparel", "styling", "fit_check"].includes(input.template)
        ? "This is a garment format. Across the beats, show the garment from the front, from a side or three-quarter angle, and from the back, plus one useful material or fit detail. Include an explicit turn or walk that makes the back visible; do not keep the performer facing camera throughout."
        : "",
      "Captions must be short enough to sit clear of the platform buttons and the product card, and must never describe a tappable shopping element.",
      "`disclosure` is a single sentence stating that the clip is AI-generated content, written in the same language.",
      "Beat timings must cover the full duration without gaps or overlap.",
      productImages.length || input.talentImageUrl || sceneImages.length
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
          ...sceneImages.flatMap((url, index) => [
            {
              type: "text" as const,
              text: `Location reference image ${index + 1} of ${sceneImages.length}`,
            },
            {
              type: "file" as const,
              data: new URL(url),
              mediaType: "image",
            },
          ]),
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
