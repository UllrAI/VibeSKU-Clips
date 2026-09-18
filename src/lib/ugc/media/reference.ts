import { join } from "node:path";
import type { VideoAspectRatio } from "../constants";
import {
  downloadToFile,
  probeMedia,
  runMediaTool,
  type MediaFacts,
} from "./ffmpeg";

/**
 * Reading a reference video: getting it onto disk and sampling it into the
 * evidence an analysis can actually look at.
 *
 * The analysis runs on a language model, and a model reads a short video best
 * as stills paired with the words spoken around them. Frames are sampled
 * evenly rather than at detected cuts: an even grid shows how long each state
 * holds, which is most of what pacing is, while cut detection would report
 * boundaries and lose the holds between them.
 */

/**
 * Enough stills to show a short clip's structure without paying for a frame
 * that says nothing new. A 15-second reference lands near one every second.
 */
const MAX_FRAMES = 16;
const MIN_FRAME_GAP_MS = 700;

/** Matches what the downloader is allowed to pull, so both paths agree. */
const MAX_LINKED_BYTES = 500 * 1024 * 1024;

export interface ReferenceFrame {
  path: string;
  atMs: number;
}

/**
 * Why a link could not be turned into a file. The operator's next action is
 * different for each of these, so the reason travels as a code rather than as
 * the downloader's own sentence.
 */
export type ReferenceFetchFailure =
  | "sign_in_required"
  | "unavailable"
  | "region_blocked"
  | "too_large"
  | "unsupported_site"
  | "unreadable";

export class ReferenceFetchError extends Error {
  readonly failure: ReferenceFetchFailure;

  constructor(failure: ReferenceFetchFailure, detail: string) {
    super(detail);
    this.name = "ReferenceFetchError";
    this.failure = failure;
  }
}

/**
 * What the site actually said, in terms an operator can act on.
 *
 * A platform that wants a signed-in session is not a bug and not a retry; it
 * is a different piece of advice from a video that was taken down. Matching a
 * handful of well-known signatures is worth it because the generic answer
 * — "upload the file instead" — is wrong for half of them.
 */
function classifyDownloaderError(message: string): ReferenceFetchFailure {
  const text = message.toLowerCase();
  if (
    text.includes("sign in to confirm") ||
    text.includes("confirm you") ||
    text.includes("login required") ||
    text.includes("use --cookies") ||
    text.includes("private video") ||
    text.includes("members-only")
  )
    return "sign_in_required";
  if (
    text.includes("video unavailable") ||
    text.includes("has been removed") ||
    text.includes("no longer available") ||
    text.includes("account has been terminated")
  )
    return "unavailable";
  if (
    text.includes("not available in your country") ||
    text.includes("geo restricted") ||
    text.includes("geo-restricted") ||
    text.includes("blocked it in your country")
  )
    return "region_blocked";
  if (text.includes("file is larger than max-filesize")) return "too_large";
  if (
    text.includes("unsupported url") ||
    text.includes("no video formats found")
  )
    return "unsupported_site";
  return "unreadable";
}

/**
 * Whether this link is the video itself rather than a page about it.
 *
 * A direct file is the reliable path: it is fetched with an ordinary request,
 * so no platform gets to decide whether we look like a person. Platform pages
 * are still attempted, but they are the fallback, not the assumption.
 */
async function directMediaUrl(url: URL): Promise<boolean> {
  if (/\.(mp4|mov|m4v|webm)$/i.test(url.pathname)) return true;
  try {
    const response = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: AbortSignal.timeout(20_000),
    });
    return (response.headers.get("content-type") ?? "").startsWith("video/");
  } catch {
    // A site that refuses HEAD tells us nothing either way; let the downloader
    // have its turn rather than failing on a probe.
    return false;
  }
}

/**
 * Save a linked video: the file itself when the link is one, and otherwise
 * whatever the platform will hand over. Whether a given site permits this is
 * the operator's call, recorded against the reference before this runs.
 */
export async function fetchLinkedVideo(
  url: string,
  path: string,
): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new ReferenceFetchError("unreadable", "That is not a valid link.");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new ReferenceFetchError(
      "unreadable",
      "A reference link must be http or https.",
    );
  }

  if (await directMediaUrl(parsed)) {
    try {
      await downloadToFile(parsed.toString(), path, MAX_LINKED_BYTES);
      return;
    } catch (error) {
      throw new ReferenceFetchError(
        error instanceof Error && error.message.includes("too large")
          ? "too_large"
          : "unreadable",
        error instanceof Error ? error.message.slice(0, 600) : "Fetch failed.",
      );
    }
  }

  try {
    await runMediaTool(
      "yt-dlp",
      [
        "--no-playlist",
        "--no-warnings",
        "--max-filesize",
        "500M",
        "--format",
        "best[ext=mp4][height<=1080]/best[height<=1080]/best",
        "--output",
        path,
        parsed.toString(),
      ],
      600_000,
    );
  } catch (error) {
    const detail =
      error instanceof Error ? error.message.slice(0, 600) : "Fetch failed.";
    throw new ReferenceFetchError(classifyDownloaderError(detail), detail);
  }
}

/** Evenly spaced sample times across a clip, in milliseconds. */
export function frameTimes(durationMs: number): number[] {
  const count = Math.max(
    2,
    Math.min(MAX_FRAMES, Math.floor(durationMs / MIN_FRAME_GAP_MS)),
  );
  // Sample inside each slice rather than on its edge: a frame taken exactly on
  // a cut can catch the transition instead of either shot.
  const slice = durationMs / count;
  return Array.from({ length: count }, (_, index) =>
    Math.round(slice * index + slice / 2),
  );
}

export async function extractFrames(
  videoPath: string,
  directory: string,
  durationMs: number,
): Promise<ReferenceFrame[]> {
  const frames: ReferenceFrame[] = [];
  for (const [index, atMs] of frameTimes(durationMs).entries()) {
    const path = join(directory, `frame-${String(index).padStart(2, "0")}.jpg`);
    await runMediaTool(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        // Seeking before the input is the fast path and is accurate enough for
        // a sample taken mid-shot.
        "-ss",
        (atMs / 1000).toFixed(3),
        "-i",
        videoPath,
        "-frames:v",
        "1",
        "-vf",
        "scale=512:-2",
        "-q:v",
        "4",
        path,
      ],
      60_000,
    );
    frames.push({ path, atMs });
  }
  return frames;
}

export async function readReferenceFacts(path: string): Promise<MediaFacts> {
  const facts = await probeMedia(path);
  if (!facts.video) {
    throw new ReferenceFetchError(
      "unreadable",
      "That file carries no video track.",
    );
  }
  return facts;
}

/**
 * The frame a clone of this piece should be made in.
 *
 * Only two frames can be produced, so anything else is reported as the nearer
 * of the two rather than as a third shape nothing downstream can honour. A
 * square reference is read as portrait, which is where shoppable feeds live.
 */
export function referenceAspectRatio(facts: {
  width: number | null;
  height: number | null;
}): VideoAspectRatio | null {
  if (!facts.width || !facts.height) return null;
  return facts.width > facts.height ? "16:9" : "9:16";
}
