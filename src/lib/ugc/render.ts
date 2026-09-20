import { CLIP_SPEC, DEFAULT_VIDEO_SETTINGS, PRISM_MEDIA } from "./constants";
import type { VideoAspectRatio, VideoMode } from "./constants";
import { TEMPLATE_BRIEFS } from "./templates";
import type { ProductFacts, ScriptBeat } from "./types";
import type { ScriptTemplate } from "./constants";
import type { ClipStorage } from "./storage";

export interface RenderSubject {
  productName: string;
  productDescription: string;
  market: string;
  locale: string;
  template: ScriptTemplate;
  talentPrompt: string | null;
  /** The place this clip is filmed in, when the operator picked one. */
  scenePrompt: string | null;
}

/** A talent and a scene are both described the same way: by their expanded
 * prompt, falling back to whatever the operator actually typed. */
function describedBy(
  record: { prompt: string | null; description: string; name: string } | null,
): string | null {
  return record ? record.prompt || record.description || record.name : null;
}

/** The one place a work's render subject is assembled, so the storyboard and
 * the video describe the same product, performer, and location. */
export function renderSubjectFor(input: {
  product: { name: string; facts: ProductFacts | null };
  work: { market: string; locale: string; template: ScriptTemplate };
  talent?: { prompt: string | null; description: string; name: string } | null;
  scene?: { prompt: string | null; description: string; name: string } | null;
}): RenderSubject {
  return {
    productName: input.product.name,
    productDescription: input.product.facts?.overview ?? "",
    market: input.work.market,
    locale: input.work.locale,
    template: input.work.template,
    talentPrompt: describedBy(input.talent ?? null),
    scenePrompt: describedBy(input.scene ?? null),
  };
}

/**
 * What the attached photographs are for. A listing photo is a studio backdrop
 * with props and printed marketing text, and a model handed it without this
 * line rebuilds that scene instead of the one the script asked for.
 */
const EVIDENCE_ONLY =
  "Any attached product photo is evidence of the product's true colour, finish, proportions, and label text only. Do not reproduce its background, surface, props, packaging shots, or any text printed into the photo.";

/**
 * Which of a product's photos travel with a request, best first.
 *
 * A listing carries a main shot, detail shots, a lifestyle scene, a size
 * chart and a packaging shot, in whatever order the page happened to list
 * them. Taking the first two blind is how a styled scene ends up as the
 * evidence of what the product looks like — and the model rebuilds that scene.
 * The reader marks the useful ones while it is already looking at them; the
 * rest follow in their own order so a product read before that still works.
 */
export function productReferenceUrls(
  product: { images: string[]; facts: Pick<ProductFacts, "keyImages"> | null },
  limit: number,
): string[] {
  const picked = (product.facts?.keyImages ?? [])
    .filter((index) => Number.isInteger(index) && index in product.images)
    .map((index) => product.images[index]!);
  const rest = product.images.filter((url) => !picked.includes(url));
  return [...picked, ...rest].slice(0, limit);
}

/**
 * How many product photos a video can still carry.
 *
 * A drawn frame simply takes all of them. A video cannot: the provider
 * accepts nine references in total, and a storyboard work spends up to six of
 * those on the key frames the clip is actually made of. The performer sheet
 * is set aside first, because a clip that loses the face is not a retake away
 * from being right, and the product fills whatever is left. Passing more than
 * nine is not an error the provider reports — it silently drops the tail,
 * which is exactly where the sheet would sit.
 */
export function videoProductBudget(
  frameCount: number,
  hasTalentSheet: boolean,
): number {
  const reserved = frameCount + (hasTalentSheet ? 1 : 0);
  return Math.max(0, PRISM_MEDIA.maxVideoReferences - reserved);
}

/**
 * What an attached reference sheet is for.
 *
 * A talent and a scene arrive as one image divided into panels. Without this
 * line a model reads that grid as the composition it was asked for and draws
 * the panels, the gutters, and the plain studio ground into the clip.
 */
const SHEET_NOT_A_LAYOUT =
  "Any attached reference sheet is a grid of panels showing one person or one place from several angles. Use it only to match appearance, materials, and light. Never reproduce its panel grid, its gutters, its plain studio ground, or its layout: the generated image is a single continuous photograph.";

function frameDescription(aspectRatio: VideoAspectRatio): string {
  return `${aspectRatio === "9:16" ? "Portrait" : "Landscape"} ${aspectRatio}`;
}

const GARMENT_TEMPLATES = new Set<ScriptTemplate>([
  "apparel",
  "styling",
  "fit_check",
]);

function garmentOrientationRule(template: ScriptTemplate): string {
  return GARMENT_TEMPLATES.has(template)
    ? "Garment orientation is literal. When the assignment says back, rear, turn away, side, or three-quarter, show that view clearly; never turn the torso or garment back toward camera just to keep the performer's face visible."
    : "";
}

/**
 * How much of a subject prompt goes into one frame request.
 *
 * Identity and location prompts are written by a model against a 12,000
 * character schema, and a frame also carries the production direction. Three
 * unbounded fields in one request can pass Prism's own 32,000 ceiling, which
 * it refuses outright rather than trimming.
 */
const FRAME_SUBJECT_LIMIT = 4000;

/**
 * Where the clip is filmed. A chosen scene is an operator decision and the
 * attached views are photographs of it, so it outranks both the generic market
 * fallback and whatever location the production direction improvised.
 */
function settingLine(subject: RenderSubject): string {
  return subject.scenePrompt
    ? `Setting — this frame happens inside the location described here. Match its layout, materials, and colours to the attached location reference sheet, and let the light of that room fall on everything in the frame:\n${fitCharacters(subject.scenePrompt, FRAME_SUBJECT_LIMIT)}`
    : `Setting: an ordinary home or street scene that reads as ${subject.market}.`;
}

/**
 * What stops a frame reading as three things pasted together.
 *
 * The model is handed a person, a place, and a product as three separate
 * references and three separate paragraphs, and the most literal thing it can
 * do with them is arrange them in one rectangle. Nothing above tells it they
 * were photographed at the same moment, so nothing makes them look like it.
 *
 * What separates a photograph from an arrangement is physical, and each line
 * here answers one way the eye catches the difference: one light, contact
 * where things touch, one lens, one atmosphere, and a frame composed rather
 * than laid out.
 */
const ONE_PHOTOGRAPH = [
  "This is a single photograph made by one camera in one exposure. The performer, the product, and the location are lit by the same sources at the same colour temperature, with the same contrast and the same exposure.",
  "The reference sheets fix identity, wardrobe, materials, and the layout of the place — never the lighting. Relight the performer and the product for this location: the direction, hardness, and colour of the light come from the room they are standing in, and every shadow in the frame falls away from that light the same way.",
  "Things touch the world they are in. Feet and furniture meet the floor with shadow gathering under them, a held product is gripped with the fingers wrapping around its form and pressing into it, and anything resting on a surface darkens where it meets that surface and picks up a soft reflection in it. Nothing floats, and no edge looks cut out.",
  "One lens throughout: the performer, the product, and the room share a single eye level, a single vanishing point, and the perspective of one focal length. Depth falls off continuously from the focal plane, rather than a sharp subject sitting on a blurred backdrop.",
  "The same air in front of everything: one colour grade, one level of grain, the same softness and falloff toward the frame edges, and bounced light carrying colour from nearby surfaces onto skin, clothing, and the product.",
  "Compose the frame, do not lay it out. Place the subject off-centre, let the frame edge crop what it would really crop, let objects overlap and pass in front of one another at different distances, and leave the room doing its own thing behind the action instead of arranged neatly around it.",
];

/**
 * The opening frame is generated first and then handed to the video model as
 * the first frame, which is what keeps the performer and the product looking
 * the same throughout the finished clip.
 */
export function buildCoverPrompt(
  subject: RenderSubject,
  firstBeat: ScriptBeat | undefined,
  productionPrompt?: string | null,
  aspectRatio: VideoAspectRatio = DEFAULT_VIDEO_SETTINGS.aspectRatio,
): string {
  return [
    `${frameDescription(aspectRatio)} opening frame for a user-generated product video.`,
    firstBeat
      ? [
          `OPENING-FRAME ASSIGNMENT — depict only ${firstBeat.start.toFixed(1)}-${firstBeat.end.toFixed(1)}s of the script:`,
          `Shot: ${firstBeat.shot}`,
          `Visible action at this exact moment: ${firstBeat.action}`,
          `Camera: ${firstBeat.camera ?? "natural handheld phone framing"}`,
          "Do not preview, combine, or foreshadow any later action from the clip.",
        ].join("\n")
      : "",
    garmentOrientationRule(subject.template),
    productionPrompt
      ? `Whole-clip visual direction only — use this for identity, setting, light, texture, and camera character, never for additional actions or shots in this image. The opening-frame assignment above overrides it:\n${productionPrompt.slice(0, 20_000)}`
      : "",
    `Product: ${subject.productName}. ${subject.productDescription}`,
    subject.talentPrompt
      ? `Performer: ${fitCharacters(subject.talentPrompt, FRAME_SUBJECT_LIMIT)}. Take the face, build, hair, and wardrobe from the attached reference sheet; take the pose, the eye line, and the light from this frame.`
      : "Product-led frame with hands only, no recognisable face.",
    settingLine(subject),
    SHEET_NOT_A_LAYOUT,
    EVIDENCE_ONLY,
    ...ONE_PHOTOGRAPH,
    "No added on-screen text, subtitles, interface overlays, or watermarks. Preserve authentic branding and label text on the product itself.",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * One storyboard key frame. Frames are what the operator judges before any
 * video is paid for, so each one describes a single beat literally rather than
 * summarising the clip.
 */
export function buildFramePrompt(
  subject: RenderSubject,
  beat: ScriptBeat,
  position: number,
  productionPrompt?: string | null,
  aspectRatio: VideoAspectRatio = DEFAULT_VIDEO_SETTINGS.aspectRatio,
): string {
  return [
    `${frameDescription(aspectRatio)} key frame ${position + 1} of a user-generated product video.`,
    `CURRENT-FRAME ASSIGNMENT — depict only ${beat.start.toFixed(1)}-${beat.end.toFixed(1)}s of the script. This assignment has priority over every reference image and every whole-clip direction below.`,
    `Shot: ${beat.shot}`,
    `Visible action at this exact moment: ${beat.action}`,
    `Camera: ${beat.camera ?? "natural handheld phone framing"}`,
    "Render one frozen moment from this assignment only. Do not combine, preview, foreshadow, repeat, or summarise any other beat from the script.",
    garmentOrientationRule(subject.template),
    productionPrompt
      ? `Whole-clip visual direction only — use this for identity, setting, light, texture, and camera character, never for additional actions, poses, or shots in this image:\n${productionPrompt.slice(0, 20_000)}`
      : "",
    `Product: ${subject.productName}. ${subject.productDescription}`,
    subject.talentPrompt
      ? `Performer: ${fitCharacters(subject.talentPrompt, FRAME_SUBJECT_LIMIT)}. Take the face, build, hair, and wardrobe from the attached reference sheet; take the pose, the eye line, and the light from this frame.`
      : "Product-led frame with hands only, no recognisable face.",
    // The production direction already carries a location of its own, so it is
    // only restated when a scene was chosen and has to win.
    productionPrompt && !subject.scenePrompt ? "" : settingLine(subject),
    SHEET_NOT_A_LAYOUT,
    EVIDENCE_ONLY,
    ...ONE_PHOTOGRAPH,
    "No added on-screen text, subtitles, interface overlays, or watermarks. Preserve authentic branding and label text on the product itself.",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * What the frame before this one is attached for.
 *
 * Key frames drawn independently disagree with each other. The same room comes
 * back with the cushions moved, the same jumper in a different weave, the same
 * afternoon an hour later — none of it wrong against the prompt, all of it
 * wrong against the frame before. A photograph settles what prose cannot.
 *
 * What it must not settle is the framing: it is the shot before, not the shot
 * being drawn, and a model given it without this line simply redraws it. So
 * the line is written as two explicit lists — what carries over and what
 * moves on — because a model told only to "continue" produces the same
 * photograph again, and one told only "this is a new shot" drifts exactly the
 * way drawing them apart did.
 */
export const CONTINUES_FROM_PREVIOUS = [
  "One attached photograph is the previous key frame of this same clip, made moments earlier: the same person, in the same place, during the same continuous filming.",
  "Carry these over from it unchanged, because the viewer sees both frames within seconds of each other: the performer's face, hair, and make-up; every garment they wear, down to its colour, fabric, length, and how it is creased, fastened, and pushed up; the product itself, in the same condition, in the same packaging, with the same label text; the room, with the same furniture, surfaces, and objects in the same positions; the light, with the same direction, hardness, colour temperature, and time of day; and the colour grade, contrast, and grain.",
  "Change these deliberately, because this is the next shot and not the same one: the camera, which takes the shot size, angle, distance, and eye level described in the CURRENT-FRAME ASSIGNMENT rather than the ones in that photograph; the performer's body orientation, pose, gesture, weight, and eye line, which have moved on with the action; and what the frame is built around. The previous image is continuity evidence, never a pose or composition reference.",
  "Make the new frame visibly different from the previous frame in at least two ways among shot size, viewpoint, body orientation, pose, and product interaction. If the CURRENT-FRAME ASSIGNMENT asks for a rear, side, or detail view, that view must be unmistakable even when the previous frame faces camera.",
  "Never redraw the previous frame, never repeat its composition, and never place it inside this image.",
].join("\n");

const DIRECTION_PREFIX = "Follow this approved production direction exactly:\n";

/**
 * Identity and location prompts are written for an image model and run to
 * thousands of characters each. The video prompt has a hard provider cap, and
 * the beat list is what must survive it, so these two are cut to the length
 * that still describes a person and a place.
 */
const SUBJECT_PROMPT_LIMIT = 1200;

/** Providers count characters, not UTF-16 units, so cut on code points. */
function fitCharacters(text: string, limit: number): string {
  const characters = Array.from(text);
  return characters.length <= limit
    ? text
    : characters.slice(0, Math.max(0, limit)).join("");
}

function characterCount(lines: string[]): number {
  return Array.from(lines.join("\n")).length;
}

/**
 * The whole clip as one provider request, built to the provider's own cap.
 *
 * The beat list is the contract — what happens when, and what is said word for
 * word — and the closing line is what keeps captions and fake shopping UI out
 * of the frame. The production direction is context around both, so it is the
 * part that gives way when the prompt runs long. Truncating the assembled text
 * instead would drop exactly the instructions that matter, and do it silently.
 */
export function buildVideoPrompt(
  subject: RenderSubject,
  beats: ScriptBeat[],
  productionPrompt: string | null | undefined,
  settings: {
    videoMode: VideoMode;
    aspectRatio: VideoAspectRatio;
  },
  maxCharacters: number,
): string {
  const brief = TEMPLATE_BRIEFS[subject.template];
  const opening = [
    `A ${CLIP_SPEC.durationSeconds}-second ${frameDescription(settings.aspectRatio).toLowerCase()} user-generated product video shot on a phone.`,
    `Format: ${brief.structure}`,
    settings.videoMode === "one_take"
      ? "Film this as one continuous take with no cuts, transitions, or scene changes. Use natural camera movement to connect every beat."
      : "Use the supplied storyboard images as the visual reference for each beat.",
    `Delivery: ${brief.voice} Spoken in ${subject.locale} for the ${subject.market} market.`,
    `Product: ${subject.productName}. ${subject.productDescription}`,
  ];
  const instructions = [
    subject.talentPrompt
      ? `Keep the performer identical to the first frame: ${fitCharacters(subject.talentPrompt, SUBJECT_PROMPT_LIMIT)}`
      : "Keep the product identical to the first frame.",
    subject.scenePrompt
      ? `The clip stays in this one place from first frame to last: ${fitCharacters(subject.scenePrompt, SUBJECT_PROMPT_LIMIT)}`
      : "",
    "The reference images begin with the approved key frames for this clip: match their performer, product, wardrobe, location, and lighting exactly.",
    SHEET_NOT_A_LAYOUT,
    EVIDENCE_ONLY,
    "Everything in shot was filmed at once: one light, one lens, shadow gathering where things touch, and no element that reads as pasted over the others.",
    "Beats:",
    "The approved beat list below overrides any conflicting timing, action, camera, or dialogue wording inside the production direction.",
    ...beats.map(
      (beat) =>
        `${beat.start.toFixed(1)}-${beat.end.toFixed(1)}s | shot: ${beat.shot} | visual: ${beat.action} | camera: ${beat.camera ?? "natural handheld phone movement"} | exact dialogue: ${beat.voiceover || "none"}`,
    ),
    "No burned-in captions, no on-screen buttons, no fake shopping widgets, no watermark. Authentic product packaging and brand text must remain unchanged.",
  ];

  const room =
    maxCharacters -
    characterCount([...opening, ...instructions]) -
    Array.from(DIRECTION_PREFIX).length -
    2;
  const direction = fitCharacters(productionPrompt ?? "", room);

  return [
    ...opening,
    direction ? `${DIRECTION_PREFIX}${direction}` : "",
    ...instructions,
  ]
    .filter(Boolean)
    .join("\n");
}

function formatTimestamp(seconds: number): string {
  const clamped = Math.max(0, seconds);
  const hours = String(Math.floor(clamped / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((clamped % 3600) / 60)).padStart(2, "0");
  const secs = String(Math.floor(clamped % 60)).padStart(2, "0");
  const millis = String(Math.round((clamped % 1) * 1000)).padStart(3, "0");
  return `${hours}:${minutes}:${secs},${millis}`;
}

/** Subtitles are authored from the locked beats, never transcribed back. */
export function buildSubtitleTrack(beats: ScriptBeat[]): string {
  return beats
    .filter((beat) => beat.voiceover.trim().length > 0)
    .map((beat, index) =>
      [
        String(index + 1),
        `${formatTimestamp(beat.start)} --> ${formatTimestamp(beat.end)}`,
        beat.voiceover.trim(),
        "",
      ].join("\n"),
    )
    .join("\n");
}

const ASSET_CONTENT_TYPES = {
  cover: "image/webp",
  video: "video/mp4",
  subtitle: "text/plain",
} as const;

const ASSET_EXTENSIONS = {
  cover: "webp",
  video: "mp4",
  subtitle: "srt",
} as const;

export type ClipAssetKind = keyof typeof ASSET_CONTENT_TYPES;

/**
 * Provider output URLs expire. Every delivered asset is copied into the
 * project's own storage so a finished work still resolves weeks later.
 */
export async function archiveRemoteAsset(input: {
  storeFile: ClipStorage;
  userId: string;
  reference: string;
  kind: ClipAssetKind;
  sourceUrl: string;
}): Promise<string> {
  const response = await fetch(input.sourceUrl, {
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) {
    throw new Error(
      `Generated asset could not be downloaded (${response.status}).`,
    );
  }
  const body = Buffer.from(await response.arrayBuffer());
  const record = await input.storeFile({
    userId: input.userId,
    identity: `${input.reference}:${input.kind}`,
    fileName: `${input.reference}.${ASSET_EXTENSIONS[input.kind]}`,
    contentType:
      response.headers.get("content-type")?.split(";")[0] ||
      ASSET_CONTENT_TYPES[input.kind],
    body,
  });
  return record.url;
}

export async function archiveSubtitleTrack(input: {
  storeFile: ClipStorage;
  userId: string;
  reference: string;
  content: string;
}): Promise<string> {
  const record = await input.storeFile({
    userId: input.userId,
    identity: `${input.reference}:subtitle`,
    fileName: `${input.reference}.srt`,
    contentType: "text/plain",
    body: Buffer.from(input.content, "utf8"),
  });
  return record.url;
}

/**
 * What every reference sheet has in common.
 *
 * A sheet is one image divided into panels, not a collage and not a scene: the
 * panels share one subject, one light, and one plain ground, and nothing is
 * written on them. Printed labels would be reproduced by the models that are
 * later handed this sheet, which is how caption text ends up baked into a
 * finished clip.
 */
const SHEET_RULES = [
  "Draw this as one single image divided into clean rectangular panels of equal size, edge to edge, with thin even gutters and no overlap between panels.",
  "Every panel shows the same subject under the same lighting against the same plain neutral ground. Nothing changes between panels except what each panel is specified to show.",
  "No text, no letters, no numbers, no labels, no captions, no watermark, no logo, and no arrows anywhere in the image.",
  "Photorealistic throughout. No illustration, no sketch lines, no collage edges, no drop shadows between panels.",
];

/**
 * The panels of a talent sheet. One photograph settles a face and nothing
 * else: it cannot say how a garment falls on this person, what their head
 * looks like turned, or how their hands and hair read up close. Four panels in
 * one square image answer all four questions at once, and because they are
 * drawn together the person cannot drift between them.
 */
const TALENT_SHEET_PANELS = [
  "Top left: head-and-shoulders portrait, face square to camera, eyes to camera, neutral expression.",
  "Top right: the same head and shoulders turned about forty-five degrees away from camera, eyes to camera, so the structure of the face reads from the side as well as the front.",
  "Bottom left: the whole figure from head to feet, both shoes fully visible, standing relaxed with weight on one leg and arms at the sides, face to camera, the complete outfit in frame.",
  "Bottom right: close detail of the cut and texture of the hair and of the hands, with any jewellery or accessory this person wears, near enough to read skin texture and fabric weave.",
];

/**
 * The panels of a scene sheet. A location is not one photograph: the wide
 * shot settles the space, the eye-level shot settles where a person stands in
 * it, and the detail shot settles the surface a product is set down on.
 */
const SCENE_SHEET_PANELS = [
  "Top half, spanning the full width: wide establishing shot of the whole space from its natural entrance, camera at chest height, taking in the floor, the far wall, and the main light source so the layout reads at a glance.",
  "Bottom left: eye-level shot from where a person would stand and talk in this place, camera at about 1.6 metres, framed on the part of the space that would be behind them.",
  "Bottom right: close shot of the surface a small object would be set down on here, camera low and near, showing the material and the everyday objects immediately around it.",
];

/**
 * One talent reference sheet.
 *
 * The identity prompt is reused verbatim so the face and wardrobe cannot
 * drift, and the panel layout is stated after it because framing is the one
 * thing being overridden — the identity prompt describes a single viewpoint of
 * its own.
 */
export function buildTalentSheetPrompt(
  identityPrompt: string,
  hasReference: boolean,
): string {
  return [
    "A photographic character reference sheet of one adult person, laid out as a two-by-two grid of four panels in a square image.",
    `Identity, wardrobe, and appearance to reproduce in every panel:\n${identityPrompt}`,
    "This layout overrides every crop, camera height, and viewpoint named above:",
    ...TALENT_SHEET_PANELS,
    hasReference
      ? "The attached image shows this same person. Facial identity, facial proportions, complexion, eyes, hair, and the colour, cut, and length of every garment must match it exactly."
      : "",
    ...SHEET_RULES,
    "Both hands empty in every panel. No products, props, packages, devices, bags, or branded objects anywhere in the image.",
    "Even neutral studio light, the subject sharp and unobstructed. No beauty filter, no plastic skin, no anatomical errors.",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * One scene reference sheet, built the same way: the location prompt verbatim,
 * then the layout that overrides the viewpoint it described.
 */
export function buildSceneSheetPrompt(
  locationPrompt: string,
  hasReference: boolean,
): string {
  return [
    "A photographic location reference sheet of one place, laid out as three panels in a square image: one wide panel across the top half, two panels side by side below it.",
    `Location to reproduce in every panel:\n${locationPrompt}`,
    "This layout overrides every viewpoint, camera height, and crop named above:",
    ...SCENE_SHEET_PANELS,
    hasReference
      ? "The attached images show this same place. The layout, materials, fittings, colours, light direction, and time of day must match them exactly; only the viewpoint changes between panels."
      : "",
    ...SHEET_RULES,
    "No people, no hands, no pets, no products, no packages, and no branded objects anywhere in the image.",
    // A location model handed a room description draws the advertisement for
    // that room: everything squared up, nothing out of place, every surface
    // new. A clip shot in it then reads as an advertisement too.
    "Photograph this as a real place rather than an interiors advertisement. Available light, nothing arranged for the camera, no colour-matched styling, no magazine symmetry, no showroom gloss, and no empty pristine surfaces. Ordinary use should show: things left where someone put them, soft creases in fabric, light wear on what gets touched. Keep it clean and cared for — no mess, no grime, no damage, nothing shabby.",
    "Natural light consistent with the description. No fisheye distortion, no HDR halo, no impossible architecture.",
  ]
    .filter(Boolean)
    .join("\n");
}
