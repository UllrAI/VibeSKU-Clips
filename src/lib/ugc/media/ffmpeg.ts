import { execFile } from "node:child_process";
import { createWriteStream } from "node:fs";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";

/**
 * The media-tool calls shared by everything that runs on the render worker.
 * Composition and reference ingestion both probe, both download, and both need
 * the same bounded, non-shell invocation.
 */
const runFile = promisify(execFile);

const MAX_MEDIA_BYTES = 2_000_000_000;

export async function runMediaTool(
  program: string,
  args: string[],
  timeout = 900_000,
): Promise<string> {
  try {
    const { stdout } = await runFile(program, args, {
      timeout,
      maxBuffer: 1024 * 1024,
      shell: false,
    });
    return stdout;
  } catch (error) {
    const detail =
      error instanceof Error ? error.message.slice(0, 1200) : String(error);
    throw new Error(`${program} failed: ${detail}`);
  }
}

interface ProbeResult {
  format?: { duration?: string };
  streams?: {
    codec_type?: string;
    duration?: string;
    width?: number;
    height?: number;
  }[];
}

export interface MediaFacts {
  durationMs: number;
  video: boolean;
  audio: boolean;
  width: number | null;
  height: number | null;
}

export async function probeMedia(path: string): Promise<MediaFacts> {
  const raw = await runMediaTool(
    "ffprobe",
    ["-v", "error", "-show_format", "-show_streams", "-of", "json", path],
    30_000,
  );
  const data = JSON.parse(raw) as ProbeResult;
  const duration = Number(
    data.format?.duration ??
      data.streams?.find((stream) => stream.duration)?.duration,
  );
  if (!Number.isFinite(duration) || duration <= 0)
    throw new Error("Media probe did not report a valid duration.");
  const videoStream = data.streams?.find(
    (stream) => stream.codec_type === "video",
  );
  return {
    durationMs: Math.round(duration * 1000),
    video: Boolean(videoStream),
    audio: Boolean(
      data.streams?.some((stream) => stream.codec_type === "audio"),
    ),
    width: videoStream?.width ?? null,
    height: videoStream?.height ?? null,
  };
}

/** Stream a remote file to disk, refusing anything oversized as it arrives. */
export async function downloadToFile(
  url: string,
  path: string,
  maxBytes = MAX_MEDIA_BYTES,
): Promise<void> {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:")
    throw new Error("Invalid media URL.");
  const response = await fetch(parsed, {
    signal: AbortSignal.timeout(180_000),
  });
  if (!response.ok || !response.body)
    throw new Error(`Media download failed (${response.status}).`);
  if (Number(response.headers.get("content-length") ?? 0) > maxBytes)
    throw new Error("Media is too large.");
  let bytes = 0;
  await pipeline(
    Readable.fromWeb(response.body as import("node:stream/web").ReadableStream),
    new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        bytes += chunk.length;
        callback(
          bytes > maxBytes ? new Error("Media is too large.") : null,
          chunk,
        );
      },
    }),
    createWriteStream(path),
  );
}
