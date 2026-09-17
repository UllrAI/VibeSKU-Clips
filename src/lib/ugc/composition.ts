import { execFile } from "node:child_process";
import { createWriteStream } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";
import type { TranscriptWord } from "@/database/ugc";
import type { VideoAspectRatio, VideoResolution } from "./constants";

const runFile = promisify(execFile);
const MAX_DOWNLOAD_BYTES = 2_000_000_000;

export interface CompositionSegment {
  videoUrl: string;
  audioUrl: string | null;
  durationMs: number;
  words: TranscriptWord[];
  hasSpeech: boolean;
  preserveVideoAudio: boolean;
}

export interface CompositionPlan {
  segments: CompositionSegment[];
  aspectRatio: VideoAspectRatio;
  resolution: VideoResolution;
}

interface ProbeResult {
  format?: { duration?: string };
  streams?: { codec_type?: string; duration?: string }[];
}

async function run(
  program: string,
  args: string[],
  timeout = 900_000,
): Promise<string> {
  try {
    const { stdout } = await runFile(program, args, {
      timeout,
      maxBuffer: 1024 * 1024,
    });
    return stdout;
  } catch (error) {
    const detail =
      error instanceof Error ? error.message.slice(0, 1200) : String(error);
    throw new Error(`${program} failed: ${detail}`);
  }
}

async function probeMedia(
  path: string,
): Promise<{ durationMs: number; video: boolean; audio: boolean }> {
  const raw = await run(
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
  return {
    durationMs: Math.round(duration * 1000),
    video: Boolean(
      data.streams?.some((stream) => stream.codec_type === "video"),
    ),
    audio: Boolean(
      data.streams?.some((stream) => stream.codec_type === "audio"),
    ),
  };
}

async function download(url: string, path: string): Promise<void> {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:")
    throw new Error("Invalid media URL.");
  const response = await fetch(parsed, {
    signal: AbortSignal.timeout(180_000),
  });
  if (!response.ok || !response.body)
    throw new Error(`Media download failed (${response.status}).`);
  if (Number(response.headers.get("content-length") ?? 0) > MAX_DOWNLOAD_BYTES)
    throw new Error("Media is too large.");
  let bytes = 0;
  await pipeline(
    Readable.fromWeb(response.body as import("node:stream/web").ReadableStream),
    new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        bytes += chunk.length;
        callback(
          bytes > MAX_DOWNLOAD_BYTES ? new Error("Media is too large.") : null,
          chunk,
        );
      },
    }),
    createWriteStream(path),
  );
}

function dimensions(
  ratio: VideoAspectRatio,
  resolution: VideoResolution,
): [number, number] {
  const shortSide = { "480p": 480, "720p": 720, "1080p": 1080, "2k": 1440 }[
    resolution
  ];
  const longSide = Math.round((shortSide * 16) / 9 / 2) * 2;
  return ratio === "9:16" ? [shortSide, longSide] : [longSide, shortSide];
}

function srtTime(ms: number): string {
  const value = Math.max(0, Math.round(ms));
  const hours = Math.floor(value / 3_600_000);
  const minutes = Math.floor(value / 60_000) % 60;
  const seconds = Math.floor(value / 1000) % 60;
  const millis = value % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")},${String(millis).padStart(3, "0")}`;
}

/** Actual ASR timings determine subtitle cues; no estimated beat timing is used. */
export function buildWordSubtitleTrack(
  segments: readonly Pick<CompositionSegment, "durationMs" | "words">[],
): string {
  const cues: { start: number; end: number; text: string }[] = [];
  let offset = 0;
  for (const segment of segments) {
    let group: TranscriptWord[] = [];
    const flush = () => {
      if (!group.length) return;
      const cjk = group.some((word) =>
        /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(
          word.text,
        ),
      );
      cues.push({
        start: offset + group[0]!.startMs,
        end: offset + group.at(-1)!.endMs,
        text: group.map((word) => word.text).join(cjk ? "" : " "),
      });
      group = [];
    };
    for (const word of segment.words) {
      if (
        word.startMs < 0 ||
        word.endMs <= word.startMs ||
        word.endMs > segment.durationMs + 200
      )
        throw new Error("ASR word timing is outside its shot.");
      const cjk =
        /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(
          word.text,
        );
      const currentLength =
        group.reduce((sum, item) => sum + item.text.length, 0) +
        group.length +
        word.text.length;
      if (
        group.length &&
        (group.length >= 7 ||
          word.endMs - group[0]!.startMs > 2400 ||
          currentLength > (cjk ? 20 : 42))
      )
        flush();
      group.push(word);
    }
    flush();
    offset += segment.durationMs;
  }
  return cues
    .map(
      (cue, index) =>
        `${index + 1}\n${srtTime(cue.start)} --> ${srtTime(cue.end)}\n${cue.text}\n`,
    )
    .join("\n");
}

/** Deterministic FFmpeg recipe: normalize every shot, concatenate, burn timed captions, normalize audio. */
export async function composeMedia(
  plan: CompositionPlan,
  directory: string,
): Promise<{
  videoPath: string;
  subtitlePath: string;
  durationMs: number;
}> {
  if (!plan.segments.length) throw new Error("Composition has no shots.");
  const [width, height] = dimensions(plan.aspectRatio, plan.resolution);
  const normalized: string[] = [];
  for (const [index, segment] of plan.segments.entries()) {
    if (segment.durationMs < 3000 || segment.durationMs > 15000)
      throw new Error("Shot duration is unsupported.");
    const videoPath = join(directory, `source-${index}.mp4`);
    await download(segment.videoUrl, videoPath);
    const video = await probeMedia(videoPath);
    if (!video.video) throw new Error(`Shot ${index + 1} has no video stream.`);
    if (Math.abs(video.durationMs - segment.durationMs) > 2000)
      throw new Error(
        `Shot ${index + 1} differs too much from its approved duration.`,
      );
    if (
      segment.hasSpeech &&
      !segment.audioUrl &&
      (!segment.preserveVideoAudio || !video.audio)
    )
      throw new Error(`Shot ${index + 1} has no speech audio.`);

    const args = ["-hide_banner", "-loglevel", "error", "-y", "-i", videoPath];
    let audioInput = "0:a:0";
    if (segment.audioUrl) {
      const audioPath = join(directory, `narration-${index}.wav`);
      await download(segment.audioUrl, audioPath);
      const audio = await probeMedia(audioPath);
      if (!audio.audio || audio.durationMs > segment.durationMs + 150)
        throw new Error(`Narration does not fit shot ${index + 1}.`);
      args.push("-i", audioPath);
      audioInput = "1:a:0";
    } else if (!segment.preserveVideoAudio || !video.audio) {
      args.push("-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo");
      audioInput = "1:a:0";
    }
    const seconds = (segment.durationMs / 1000).toFixed(3);
    const output = join(directory, `normalized-${index}.mp4`);
    args.push(
      "-filter_complex",
      `[0:v:0]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,fps=30,tpad=stop_mode=clone:stop_duration=2,trim=duration=${seconds},setpts=PTS-STARTPTS,format=yuv420p[v];[${audioInput}]aresample=48000,apad,atrim=duration=${seconds},asetpts=PTS-STARTPTS[a]`,
      "-map",
      "[v]",
      "-map",
      "[a]",
      "-c:v",
      "libx264",
      "-preset",
      "medium",
      "-crf",
      "20",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-ar",
      "48000",
      "-ac",
      "2",
      "-movflags",
      "+faststart",
      output,
    );
    await run("ffmpeg", args);
    normalized.push(output);
  }
  const concatList = join(directory, "shots.txt");
  await writeFile(
    concatList,
    normalized
      .map((path) => `file '${path.replace(/'/g, "'\\''")}'`)
      .join("\n"),
  );
  const joinedPath = join(directory, "joined.mp4");
  await run("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    concatList,
    "-c",
    "copy",
    joinedPath,
  ]);

  const subtitlePath = join(directory, "captions.srt");
  const subtitle = buildWordSubtitleTrack(plan.segments);
  await writeFile(subtitlePath, subtitle, "utf8");
  const videoPath = join(directory, "final.mp4");
  const margin =
    plan.aspectRatio === "9:16"
      ? Math.round(height * 0.15)
      : Math.round(height * 0.1);
  const fontSize = Math.round(
    width * (plan.aspectRatio === "9:16" ? 0.055 : 0.035),
  );
  const args = ["-hide_banner", "-loglevel", "error", "-y", "-i", joinedPath];
  if (subtitle.trim()) {
    args.push(
      "-vf",
      `subtitles=${subtitlePath}:force_style='Alignment=2,MarginV=${margin},FontSize=${fontSize},Outline=2,Shadow=1'`,
    );
  }
  args.push(
    "-af",
    "loudnorm=I=-16:TP=-1.5:LRA=11",
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    "20",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-movflags",
    "+faststart",
    videoPath,
  );
  await run("ffmpeg", args);
  const result = await probeMedia(videoPath);
  if (!result.video || !result.audio)
    throw new Error("Composition is missing video or audio.");
  const targetMs = plan.segments.reduce(
    (sum, segment) => sum + segment.durationMs,
    0,
  );
  if (Math.abs(result.durationMs - targetMs) > 700)
    throw new Error("Composed video duration differs from approved script.");
  return { videoPath, subtitlePath, durationMs: result.durationMs };
}
