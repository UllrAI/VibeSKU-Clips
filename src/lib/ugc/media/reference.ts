import { join } from "node:path";
import type { VideoAspectRatio } from "../constants";
import { probeMedia, runMediaTool, type MediaFacts } from "./ffmpeg";

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

export interface ReferenceFrame {
  path: string;
  atMs: number;
}

export class ReferenceFetchError extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = "ReferenceFetchError";
  }
}

/**
 * Save a linked video with yt-dlp, preferring a single MP4 so no stream
 * merging is needed. Whether a given site permits this is the operator's call,
 * recorded against the reference before this runs.
 */
export async function fetchLinkedVideo(
  url: string,
  path: string,
): Promise<void> {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new ReferenceFetchError("A reference link must be http or https.");
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
    // The downloader's own message names the site's reason, which is the only
    // thing that tells an operator whether to retry or upload the file.
    throw new ReferenceFetchError(
      error instanceof Error ? error.message.slice(0, 600) : "Fetch failed.",
    );
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
    throw new ReferenceFetchError("That file carries no video track.");
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
