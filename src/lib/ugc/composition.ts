import { execFile } from "node:child_process";
import { createWriteStream } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";
import type { TranscriptWord } from "@/database/ugc";
import { alignScriptToEvidence, type TimedToken } from "./media/alignment";
import { CLIP_SPEC } from "./constants";
import type { VideoAspectRatio, VideoResolution } from "./constants";

const runFile = promisify(execFile);
const MAX_DOWNLOAD_BYTES = 2_000_000_000;

export interface CompositionSegment {
  videoUrl: string;
  audioUrl: string | null;
  durationMs: number;
  /** Measured recognition, used for timing only. */
  words: TranscriptWord[];
  /** The approved script line. Captions are rendered from this wording. */
  voiceover: string;
  /**
   * Which stream carries this shot's speech. `video` keeps the generated
   * performance's own audio; `audio` means separate narration was added and
   * has to fit the shot. Naming it keeps the decision out of inference.
   */
  spanAuthority: "video" | "audio";
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

const CUE_MAX_MS = 2400;
const CUE_MIN_MS = 300;
const CUE_MAX_CHARACTERS = { latin: 42, cjk: 20 } as const;
const CJK_TOKEN =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

/** Joins two rendered fragments the way their scripts are written. */
function joinText(left: string, right: string): string {
  if (!left) return right;
  if (!right) return left;
  const seam = CJK_TOKEN.test(left.at(-1)!) || CJK_TOKEN.test(right[0]!);
  return seam ? left + right : `${left} ${right}`;
}

function cueText(tokens: readonly TimedToken[]): string {
  return tokens.reduce((line, token, index) => {
    if (!index) return token.text;
    const joined =
      CJK_TOKEN.test(token.text) || CJK_TOKEN.test(tokens[index - 1]!.text);
    return joined ? line + token.text : `${line} ${token.text}`;
  }, "");
}

/**
 * Captions carry the approved wording, positioned by measured recognition.
 * Lines break where the script punctuates, because that is where the writer
 * meant a thought to end; length and duration are only the fallback.
 */
export function buildSubtitleTrack(
  segments: readonly Pick<
    CompositionSegment,
    "durationMs" | "words" | "voiceover"
  >[],
): string {
  const cues: { start: number; end: number; text: string }[] = [];
  let offset = 0;
  for (const segment of segments) {
    for (const [index, word] of segment.words.entries()) {
      if (
        word.startMs < 0 ||
        word.endMs <= word.startMs ||
        word.endMs > segment.durationMs + 200
      )
        throw new Error("ASR word timing is outside its shot.");
      // Cue windows are read off these in order, so out-of-order recognition
      // is a data fault to report, not something to silently caption around.
      if (index && word.startMs < segment.words[index - 1]!.startMs)
        throw new Error("ASR words are not in spoken order.");
    }
    const tokens = alignScriptToEvidence(segment.voiceover, segment.words);
    // One limit per shot, from the script's own language. Deriving it from
    // whichever token is in hand makes a mixed line's limit jump mid-cue.
    const limit = CJK_TOKEN.test(segment.voiceover)
      ? CUE_MAX_CHARACTERS.cjk
      : CUE_MAX_CHARACTERS.latin;
    const first = cues.length;
    let group: TimedToken[] = [];
    /** Local end of this shot's last cue, the floor for anything after it. */
    let spokenEnd = 0;
    /**
     * Words nobody heard carry no window of their own, so they are held back
     * and shown with the next words that do. Dropping them would quietly edit
     * the approved script, which is the one thing captions must never do.
     */
    let held: TimedToken[] = [];
    const flush = () => {
      const timed = group.filter((token) => token.window);
      if (!timed.length) {
        held = [...held, ...group];
      } else {
        // Held words were spoken somewhere between the previous cue and this
        // one, so the cue opens where that gap does. The line can run long,
        // which is the right trade: unreadable beats absent.
        const end = timed.at(-1)!.window!.endMs;
        cues.push({
          start: offset + (held.length ? spokenEnd : timed[0]!.window!.startMs),
          end: offset + end,
          text: joinText(cueText(held), cueText(group)),
        });
        spokenEnd = end;
        held = [];
      }
      group = [];
    };
    for (const token of tokens) {
      const started = group.find((item) => item.window);
      if (
        group.length &&
        (cueText([...group, token]).length > limit ||
          (started &&
            token.window &&
            token.window.endMs - started.window!.startMs > CUE_MAX_MS))
      )
        flush();
      group.push(token);
      if (token.breakAfter === "hard") flush();
      else if (
        token.breakAfter === "soft" &&
        cueText(group).length >= Math.round(limit * 0.6)
      )
        flush();
    }
    flush();
    const last = cues.at(-1);
    // A trailing run that was never heard still belongs on screen, and the
    // last cue of this shot is the only place left to say it.
    if (held.length && last && cues.length > first) {
      last.text = joinText(last.text, cueText(held));
    }
    offset += segment.durationMs;
  }
  // Two cues that start at the same measured instant cannot be told apart on
  // screen, and a cue carrying one leftover word flashes rather than reads.
  // Both are absorbed by the line before them instead of being shown alone.
  const merged = cues.reduce<typeof cues>((kept, cue) => {
    const previous = kept.at(-1);
    if (
      previous &&
      (cue.start <= previous.start ||
        (cue.end - cue.start < CUE_MIN_MS &&
          previous.text.length + cue.text.length <= CUE_MAX_CHARACTERS.latin))
    ) {
      previous.text = joinText(previous.text, cue.text);
      previous.end = Math.max(previous.end, cue.end);
      return kept;
    }
    kept.push(cue);
    return kept;
  }, []);
  // A cue that outlives its successor would sit on screen twice.
  for (const [index, cue] of merged.entries()) {
    cue.end = Math.max(cue.end, cue.start + CUE_MIN_MS);
    const next = merged[index + 1];
    if (next && cue.end > next.start) cue.end = next.start;
  }
  return merged
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
      segment.voiceover.trim() !== "" &&
      !segment.audioUrl &&
      (segment.spanAuthority === "audio" || !video.audio)
    )
      throw new Error(`Shot ${index + 1} has no speech audio.`);

    const args = ["-hide_banner", "-loglevel", "error", "-y", "-i", videoPath];
    let audioInput = "0:a:0";
    if (segment.audioUrl) {
      const audioPath = join(directory, `narration-${index}.wav`);
      await download(segment.audioUrl, audioPath);
      const audio = await probeMedia(audioPath);
      // The shot job measures narration when it is synthesised, so reaching
      // here means that check was bypassed rather than that copy slipped.
      if (
        !audio.audio ||
        audio.durationMs > segment.durationMs + CLIP_SPEC.narrationToleranceMs
      )
        throw new Error(`Narration does not fit shot ${index + 1}.`);
      args.push("-i", audioPath);
      audioInput = "1:a:0";
    } else if (segment.spanAuthority === "audio" || !video.audio) {
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
  const subtitle = buildSubtitleTrack(plan.segments);
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
