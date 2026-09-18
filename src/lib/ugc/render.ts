import {
  type ContentLocale,
  DEFAULT_VIDEO_SETTINGS,
  LANGUAGE_NAMES,
  shotDurationSeconds,
} from "./constants";
import { spokenText } from "./script-notation";
import type { VideoAspectRatio } from "./constants";
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

function frameDescription(aspectRatio: VideoAspectRatio): string {
  return `${aspectRatio === "9:16" ? "Portrait" : "Landscape"} ${aspectRatio}`;
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
    "No added on-screen text, subtitles, interface overlays, or watermarks. Preserve authentic branding and label text on the product itself.",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * What the provider is told about sound. A beat carries a line or it does not,
 * and saying "speak this: no speech in this shot" is an instruction to read
 * that sentence aloud, which is how silent beats came back talking.
 */
function speechDirection(
  audioMode: "native" | "tts",
  beat: ScriptBeat,
  locale: string,
): string {
  if (audioMode === "tts")
    return "Do not show speaking or lip movement. The final edit will add separate narration. Generate only natural scene ambience.";
  const line = spokenText(beat.voiceover).trim();
  if (!line)
    return "Nobody speaks in this shot. No voice and no lip movement, natural scene ambience only.";
  const language = LANGUAGE_NAMES[locale as ContentLocale] ?? locale;
  return `The performer says this in ${language}, word for word and nothing else: ${line}`;
}

/** One self-contained provider request, with continuity cues but only one timed action. */
export function buildSegmentVideoPrompt(
  subject: RenderSubject,
  beats: ScriptBeat[],
  position: number,
  productionPrompt: string | null,
  audioMode: "native" | "tts",
  aspectRatio: VideoAspectRatio,
): string {
  const beat = beats[position]!;
  const duration = shotDurationSeconds(beat);
  return [
    `Generate shot ${position + 1} of ${beats.length}, lasting exactly ${duration} seconds, for a ${frameDescription(aspectRatio)} product video.`,
    "This is one shot only. Keep the same adult performer, product, clothing, room, lighting, and camera character as the other shots.",
    `Product: ${subject.productName}. ${subject.appearance}`,
    subject.talentPrompt
      ? `Performer: ${subject.talentPrompt}`
      : "Product-led shot with no recognisable face.",
    `Global production direction for continuity only; its total duration and other beats do not apply to this shot: ${(productionPrompt ?? "").slice(0, 8000)}`,
    position > 0 ? `Previous shot context: ${beats[position - 1]!.action}` : "",
    position + 1 < beats.length
      ? `Next shot context: ${beats[position + 1]!.action}`
      : "",
    `Current shot: ${beat.shot}. Action: ${beat.action}. Camera: ${beat.camera ?? "natural handheld phone camera"}.`,
    speechDirection(audioMode, beat, subject.locale),
    "Do not add captions, titles, buttons, fake shopping UI, or watermarks. Preserve authentic product branding.",
  ]
    .filter(Boolean)
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
