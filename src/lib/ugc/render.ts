import { CLIP_SPEC, DEFAULT_VIDEO_SETTINGS } from "./constants";
import type { VideoAspectRatio, VideoMode } from "./constants";
import { TEMPLATE_BRIEFS } from "./templates";
import type { ScriptBeat } from "./types";
import type { ScriptTemplate } from "./constants";
import type { ClipStorage } from "./storage";

export interface RenderSubject {
  productName: string;
  appearance: string;
  market: string;
  locale: string;
  template: ScriptTemplate;
  talentPrompt: string | null;
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
    `Setting: an ordinary home or street scene that reads as ${subject.market}.`,
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
    productionPrompt
      ? ""
      : `Setting: an ordinary home or street scene that reads as ${subject.market}.`,
    EVIDENCE_ONLY,
    "No added on-screen text, subtitles, interface overlays, or watermarks. Preserve authentic branding and label text on the product itself.",
  ]
    .filter(Boolean)
    .join("\n");
}

const DIRECTION_PREFIX = "Follow this approved production direction exactly:\n";

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
      ? `Keep the performer identical to the first frame: ${subject.talentPrompt}`
      : "Keep the product identical to the first frame.",
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
 * The same person at full length.
 *
 * A portrait reference settles who the performer is; it cannot settle how a
 * garment falls on them, which is the only thing an apparel clip is about. The
 * identity prompt is reused verbatim so the face and wardrobe stay put, and
 * the framing is restated after it because framing is the one thing being
 * overridden — the identity prompt describes a crop of its own.
 */
export function buildTalentFullBodyPrompt(identityPrompt: string): string {
  return [
    "Full-length standing photograph of the person described below, matching the attached reference image.",
    `Identity, wardrobe, and setting to reproduce:\n${identityPrompt}`,
    "This framing overrides every crop, camera height, and viewpoint named above: photograph the whole figure from head to feet, both shoes fully visible, with clear space above the head and below the feet. Place the camera at chest height and far enough back that the entire body fits without distortion.",
    "Natural relaxed standing pose, weight on one leg, arms at the sides, face to camera.",
    "Facial identity, facial proportions, complexion, eyes, hair, and the colour, cut, and length of every garment must match the reference image.",
    "Both hands empty. No products, props, packages, devices, bags, logos, or branded objects anywhere in the frame.",
    "Plain uncluttered setting, even light, the whole body sharp and unobstructed. No text overlay, no watermark, no beauty filter, no anatomical errors.",
  ].join("\n");
}
