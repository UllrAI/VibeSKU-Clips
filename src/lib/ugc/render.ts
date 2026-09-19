import { CLIP_SPEC, DEFAULT_VIDEO_SETTINGS } from "./constants";
import type {
  SceneAngle,
  TalentAngle,
  VideoAspectRatio,
  VideoMode,
} from "./constants";
import { TEMPLATE_BRIEFS } from "./templates";
import type { ProductFacts, ReferenceView, ScriptBeat } from "./types";
import type { ScriptTemplate } from "./constants";
import type { ClipStorage } from "./storage";

export interface RenderSubject {
  productName: string;
  appearance: string;
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
    appearance: input.product.facts?.appearance ?? "",
    market: input.work.market,
    locale: input.work.locale,
    template: input.work.template,
    talentPrompt: describedBy(input.talent ?? null),
    scenePrompt: describedBy(input.scene ?? null),
  };
}

/**
 * How much of a subject reaches one request.
 *
 * Views are stored in the order they are drawn, which is also their order of
 * importance, so the first two are the ones worth sending. More would only
 * crowd out the rest of the reference set, which the provider caps anyway.
 */
export function referenceViewUrls(
  subject: { views: ReferenceView[] } | null | undefined,
  limit = 2,
): string[] {
  return (subject?.views ?? []).slice(0, limit).map((view) => view.imageUrl);
}

/**
 * What the attached photographs are for. A listing photo is a studio backdrop
 * with props and printed marketing text, and a model handed it without this
 * line rebuilds that scene instead of the one the script asked for.
 */
const EVIDENCE_ONLY =
  "Any attached product photo is evidence of the product's true colour, finish, proportions, and label text only. Do not reproduce its background, surface, props, packaging shots, or any text printed into the photo.";

function frameDescription(aspectRatio: VideoAspectRatio): string {
  return `${aspectRatio === "9:16" ? "Portrait" : "Landscape"} ${aspectRatio}`;
}

/**
 * Where the clip is filmed. A chosen scene is an operator decision and the
 * attached views are photographs of it, so it outranks both the generic market
 * fallback and whatever location the production direction improvised.
 */
function settingLine(subject: RenderSubject): string {
  return subject.scenePrompt
    ? `Setting — compose this frame inside the location described here, matching the attached location reference images for layout, materials, and light:\n${subject.scenePrompt}`
    : `Setting: an ordinary home or street scene that reads as ${subject.market}.`;
}

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
    productionPrompt
      ? `Production direction:\n${productionPrompt.slice(0, 20_000)}`
      : "",
    `Product: ${subject.productName}. ${subject.appearance}`,
    firstBeat
      ? `This frame only: ${firstBeat.shot}. ${firstBeat.action}. Camera: ${firstBeat.camera ?? "natural handheld phone framing"}.`
      : "",
    subject.talentPrompt
      ? `Performer: ${subject.talentPrompt}. Match the supplied reference image.`
      : "Product-led frame with hands only, no recognisable face.",
    settingLine(subject),
    EVIDENCE_ONLY,
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
    productionPrompt
      ? `Production direction shared by every frame:\n${productionPrompt.slice(0, 20_000)}`
      : "",
    `Product: ${subject.productName}. ${subject.appearance}`,
    `Shot: ${beat.shot}`,
    `Action: ${beat.action}`,
    `Camera: ${beat.camera ?? "natural handheld phone framing"}`,
    subject.talentPrompt
      ? `Performer: ${subject.talentPrompt}. Match the supplied reference image exactly.`
      : "Product-led frame with hands only, no recognisable face.",
    // The production direction already carries a location of its own, so it is
    // only restated when a scene was chosen and has to win.
    productionPrompt && !subject.scenePrompt ? "" : settingLine(subject),
    EVIDENCE_ONLY,
    "No added on-screen text, subtitles, interface overlays, or watermarks. Preserve authentic branding and label text on the product itself.",
  ]
    .filter(Boolean)
    .join("\n");
}

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
    `Product: ${subject.productName}. ${subject.appearance}`,
  ];
  const instructions = [
    subject.talentPrompt
      ? `Keep the performer identical to the first frame: ${fitCharacters(subject.talentPrompt, SUBJECT_PROMPT_LIMIT)}`
      : "Keep the product identical to the first frame.",
    subject.scenePrompt
      ? `The clip stays in this one place from first frame to last: ${fitCharacters(subject.scenePrompt, SUBJECT_PROMPT_LIMIT)}`
      : "",
    "The reference images begin with the approved key frames for this clip: match their performer, product, wardrobe, location, and lighting exactly.",
    EVIDENCE_ONLY,
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
 * How each viewpoint of a scene is framed. The three answer different
 * questions about the same place: where it is, where a person stands in it,
 * and what a product is set down on.
 */
const SCENE_VIEW_FRAMING: Record<SceneAngle, string> = {
  establishing:
    "Wide establishing shot of the whole space from its natural entrance, camera at chest height, taking in the floor, the far wall, and the main light source so the layout reads at a glance.",
  eye_level:
    "Eye-level shot from where a person would stand and talk in this place, camera at about 1.6 metres, framed on the part of the space that would be behind them, at a natural conversational distance.",
  detail:
    "Close shot of the surface a small object would be set down on in this place, camera low and near, shallow depth of field, showing the material and the everyday objects immediately around it.",
};

/**
 * One viewpoint of a location.
 *
 * The location prompt is reused verbatim so the place cannot drift, and the
 * framing is restated after it because framing is the one thing being
 * overridden — the location prompt describes a viewpoint of its own. Views
 * after the first take the earlier ones as references, which is what makes
 * three photographs read as one room rather than three rooms.
 */
export function buildSceneViewPrompt(
  locationPrompt: string,
  angle: SceneAngle,
  hasReference: boolean,
): string {
  return [
    "Photograph of the place described below, as it is, with nobody in it.",
    `Location to reproduce:\n${locationPrompt}`,
    `This framing overrides every viewpoint, camera height, and crop named above: ${SCENE_VIEW_FRAMING[angle]}`,
    hasReference
      ? "The attached images are other photographs of this same place. The layout, materials, fittings, colours, light direction, and time of day must match them exactly; only the viewpoint changes."
      : "",
    "No people, no hands, no pets, no products, no packages, no logos, and no branded objects anywhere in the frame.",
    "Natural light consistent with the description. No text overlay, no watermark, no fisheye distortion, no impossible architecture.",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * How each viewpoint of a talent is framed. The portrait is not here: it is
 * the identity prompt itself, which already describes its own viewpoint and
 * crop, and overriding those would throw away the phone-camera framing that
 * makes the person read as real. Every later view overrides it deliberately.
 */
const TALENT_VIEW_FRAMING: Record<Exclude<TalentAngle, "portrait">, string> = {
  full_body:
    "Photograph the whole figure from head to feet, both shoes fully visible, with clear space above the head and below the feet. Place the camera at chest height and far enough back that the entire body fits without distortion. Natural relaxed standing pose, weight on one leg, arms at the sides, face to camera.",
  three_quarter:
    "Waist-up photograph with the head and shoulders turned about forty-five degrees away from the camera, eyes to camera. Camera at eye height at a natural conversational distance, so the structure of the face reads from the side as well as the front.",
  detail:
    "Close photograph of the details that identify this person: the cut and texture of their hair, their hands, and any jewellery or accessory they wear. Camera near, shallow depth of field, even light, skin texture and fabric weave clearly visible. The face may be partly out of frame.",
};

/**
 * One viewpoint of a talent.
 *
 * The identity prompt is reused verbatim so the face and wardrobe cannot
 * drift, and the framing is restated after it because framing is the one thing
 * being overridden. Views after the first take the earlier ones as references,
 * which is what keeps four photographs on one person.
 */
export function buildTalentViewPrompt(
  identityPrompt: string,
  angle: Exclude<TalentAngle, "portrait">,
  hasReference: boolean,
): string {
  return [
    "Photograph of the person described below.",
    `Identity, wardrobe, and setting to reproduce:\n${identityPrompt}`,
    `This framing overrides every crop, camera height, and viewpoint named above: ${TALENT_VIEW_FRAMING[angle]}`,
    hasReference
      ? "The attached images are other photographs of this same person. Facial identity, facial proportions, complexion, eyes, hair, and the colour, cut, and length of every garment must match them exactly; only the viewpoint changes."
      : "",
    "Both hands empty. No products, props, packages, devices, bags, logos, or branded objects anywhere in the frame.",
    "Plain uncluttered setting, even light, the subject sharp and unobstructed. No text overlay, no watermark, no beauty filter, no anatomical errors.",
  ]
    .filter(Boolean)
    .join("\n");
}
