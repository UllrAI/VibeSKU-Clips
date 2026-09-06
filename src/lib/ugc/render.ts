import { CLIP_SPEC } from "./constants";
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
 * The opening frame is generated first and then handed to the video model as
 * the first frame, which is what keeps the performer and the product looking
 * the same across every clip in a batch.
 */
export function buildCoverPrompt(
  subject: RenderSubject,
  firstBeat: ScriptBeat | undefined,
): string {
  return [
    `Vertical ${CLIP_SPEC.aspectRatio} opening frame for a user-generated product video.`,
    `Product: ${subject.productName}. ${subject.appearance}`,
    firstBeat ? `Shot: ${firstBeat.shot}. Action: ${firstBeat.action}` : "",
    subject.talentPrompt
      ? `Performer: ${subject.talentPrompt}. Match the supplied reference image.`
      : "Product-led frame with hands only, no recognisable face.",
    `Setting: an ordinary home or street scene that reads as ${subject.market}.`,
    "Natural available light, phone-camera framing, no on-screen text, no logos, no user-interface overlays.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildVideoPrompt(
  subject: RenderSubject,
  beats: ScriptBeat[],
): string {
  const brief = TEMPLATE_BRIEFS[subject.template];
  return [
    `A ${CLIP_SPEC.durationSeconds}-second vertical ${CLIP_SPEC.aspectRatio} user-generated product video shot on a phone.`,
    `Format: ${brief.structure}`,
    `Delivery: ${brief.voice} Spoken in ${subject.locale} for the ${subject.market} market.`,
    `Product: ${subject.productName}. ${subject.appearance}`,
    subject.talentPrompt
      ? `Keep the performer identical to the first frame: ${subject.talentPrompt}`
      : "Keep the product identical to the first frame.",
    "Beats:",
    ...beats.map(
      (beat) =>
        `${beat.start.toFixed(1)}-${beat.end.toFixed(1)}s | ${beat.shot} | ${beat.action} | says: ${beat.voiceover}`,
    ),
    "No burned-in captions, no on-screen buttons, no fake shopping widgets, no watermark.",
  ].join("\n");
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
 * project's own storage so an export made weeks later still resolves.
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
