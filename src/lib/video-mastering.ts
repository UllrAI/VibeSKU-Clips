import { execFile } from "child_process";
import { copyFile, mkdir, readFile, rm, writeFile } from "fs/promises";
import { dirname } from "path";
import { promisify } from "util";
import { buildAigcMetadataArgv } from "@/lib/compliance-metadata";
import { ffmpegBin } from "@/lib/ffmpeg-path";
import { validateMediaFile } from "@/lib/media-validate";
import { probeMedia } from "@/lib/media-probe";
import { COMPOSE_TIMEOUT_MS, withComposeSlot } from "@/lib/video-composer/composer";
import { detectSceneTimes } from "@/lib/video-composer/contact-sheet";

const execFileAsync = promisify(execFile);
const MAX_BOUNDARIES = 40;

export interface FrameSignalStats {
  y: number;
  u: number;
  v: number;
  saturation: number;
}

export type BoundaryLevel = "ok" | "review" | "strong";

export interface BoundaryContinuity {
  at: number;
  before: FrameSignalStats;
  after: FrameSignalStats;
  lumaDelta: number;
  chromaDelta: number;
  saturationDelta: number;
  score: number;
  level: BoundaryLevel;
}

export interface LoudnessMeasurement {
  inputI: number;
  inputTp: number;
  inputLra: number;
  inputThresh: number;
  targetOffset: number;
}

export interface MasteringAnalysis {
  version: 1;
  duration: number;
  hasAudio: boolean;
  boundarySource: "timeline" | "scene" | "none";
  boundaries: BoundaryContinuity[];
  loudness: LoudnessMeasurement | null;
  summary: {
    total: number;
    review: number;
    strong: number;
    maxScore: number;
    truncated: boolean;
  };
  recommendations: {
    normalizeAudio: boolean;
    deflicker: false;
  };
}

export interface MasteringOptions {
  normalizeAudio: boolean;
  deflicker: boolean;
}

interface BoundaryTimes {
  times: number[];
  source: MasteringAnalysis["boundarySource"];
  truncated: boolean;
}

function finite(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export function parseSignalStats(log: string): Map<number, FrameSignalStats> {
  const result = new Map<number, FrameSignalStats>();
  const blocks = String(log).split(/(?=frame:\d+\s+pts:)/);
  for (const block of blocks) {
    const sample = block.match(/clipforge\.sample=(\d+)/);
    if (!sample) continue;
    const read = (key: string) => finite(block.match(new RegExp(`lavfi\\.signalstats\\.${key}=(-?[\\d.]+)`))?.[1]);
    const y = read("YAVG");
    const u = read("UAVG");
    const v = read("VAVG");
    const saturation = read("SATAVG");
    if (y === null || u === null || v === null || saturation === null) continue;
    result.set(Number(sample[1]), { y, u, v, saturation });
  }
  return result;
}

export function scoreBoundary(at: number, before: FrameSignalStats, after: FrameSignalStats): BoundaryContinuity {
  const lumaDelta = Math.abs(after.y - before.y) / 2.55;
  const chromaDelta = Math.hypot(after.u - before.u, after.v - before.v) / 3.606;
  const saturationDelta = Math.abs(after.saturation - before.saturation) / 1.81;
  const score = Math.round(Math.min(100, lumaDelta * 1.2 + chromaDelta * 0.65 + saturationDelta * 0.25));
  const level: BoundaryLevel = score >= 52 ? "strong" : score >= 28 ? "review" : "ok";
  return {
    at: Math.round(at * 1000) / 1000,
    before,
    after,
    lumaDelta: Math.round(lumaDelta * 10) / 10,
    chromaDelta: Math.round(chromaDelta * 10) / 10,
    saturationDelta: Math.round(saturationDelta * 10) / 10,
    score,
    level,
  };
}

export function parseLoudnormMeasurement(log: string): LoudnessMeasurement | null {
  const source = String(log);
  for (let start = source.lastIndexOf("{"); start >= 0; start = source.lastIndexOf("{", start - 1)) {
    const end = source.indexOf("}", start);
    if (end < 0) continue;
    try {
      const raw = JSON.parse(source.slice(start, end + 1)) as Record<string, unknown>;
      const inputI = finite(raw.input_i);
      const inputTp = finite(raw.input_tp);
      const inputLra = finite(raw.input_lra);
      const inputThresh = finite(raw.input_thresh);
      const targetOffset = finite(raw.target_offset);
      if (inputI === null || inputTp === null || inputLra === null || inputThresh === null || targetOffset === null) continue;
      return { inputI, inputTp, inputLra, inputThresh, targetOffset };
    } catch {
      // Continue searching in case another log object followed the measurement block.
    }
  }
  return null;
}

function thinTimes(times: number[], limit: number): { times: number[]; truncated: boolean } {
  if (times.length <= limit) return { times, truncated: false };
  return {
    times: Array.from({ length: limit }, (_, index) => times[Math.round((index * (times.length - 1)) / (limit - 1))]),
    truncated: true,
  };
}

export async function readBoundaryTimes(videoPath: string, duration: number): Promise<BoundaryTimes> {
  const clean = (rows: unknown[]) => [...new Set(rows
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
    .filter((value) => value > 0.15 && value < duration - 0.15)
    .map((value) => Math.round(value * 1000) / 1000))].sort((a, b) => a - b);
  try {
    const sidecar = JSON.parse(await readFile(`${videoPath}.timeline.json`, "utf8")) as { boundaries?: unknown };
    if (Array.isArray(sidecar.boundaries)) {
      const picked = thinTimes(clean(sidecar.boundaries), MAX_BOUNDARIES);
      if (picked.times.length) return { ...picked, source: "timeline" };
    }
  } catch {
    // Older and imported compositions may not have a timeline sidecar.
  }
  const detected = clean(await detectSceneTimes(videoPath));
  const picked = thinTimes(detected, MAX_BOUNDARIES);
  return { ...picked, source: picked.times.length ? "scene" : "none" };
}

export function buildBoundarySignalFilter(times: number[], duration: number): string {
  const samples = times.flatMap((at) => [Math.max(0, at - 0.08), Math.min(duration - 0.04, at + 0.08)]);
  if (!samples.length) return "";
  const inputs = samples.map((_, index) => `[s${index}]`).join("");
  const chains = samples.map((at, index) => {
    const start = Math.max(0, at).toFixed(3);
    const end = Math.min(duration, at + 0.08).toFixed(3);
    return `[s${index}]trim=start=${start}:end=${end},setpts=PTS-STARTPTS,select=eq(n\\,0),signalstats,metadata=mode=add:key=clipforge.sample:value=${index},metadata=mode=print[o${index}]`;
  });
  return [`[0:v]split=${samples.length}${inputs}`, ...chains].join(";");
}

async function analyzeBoundaries(videoPath: string, times: number[], duration: number): Promise<BoundaryContinuity[]> {
  if (!times.length) return [];
  const filter = buildBoundarySignalFilter(times, duration);
  const maps = times.flatMap((_, index) => ["-map", `[o${index * 2}]`, "-map", `[o${index * 2 + 1}]`]);
  const { stdout, stderr } = await execFileAsync(ffmpegBin(), [
    "-hide_banner", "-nostats", "-i", videoPath,
    "-filter_complex", filter,
    ...maps,
    "-an", "-f", "null", "-",
  ], { timeout: COMPOSE_TIMEOUT_MS, maxBuffer: 32 * 1024 * 1024 });
  const stats = parseSignalStats(`${stdout ?? ""}\n${stderr ?? ""}`);
  return times.flatMap((at, index) => {
    const before = stats.get(index * 2);
    const after = stats.get(index * 2 + 1);
    return before && after ? [scoreBoundary(at, before, after)] : [];
  });
}

async function measureLoudness(videoPath: string): Promise<LoudnessMeasurement | null> {
  const { stdout, stderr } = await execFileAsync(ffmpegBin(), [
    "-hide_banner", "-nostats", "-i", videoPath,
    "-map", "0:a:0",
    "-af", "loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json",
    "-f", "null", "-",
  ], { timeout: COMPOSE_TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024 });
  return parseLoudnormMeasurement(`${stdout ?? ""}\n${stderr ?? ""}`);
}

export async function analyzeMastering(videoPath: string): Promise<MasteringAnalysis> {
  const media = await probeMedia(videoPath);
  if (media.duration <= 0 || media.width <= 0 || media.height <= 0) throw new Error("成片无法读取，不能执行连续性分析");
  const boundaryTimes = await readBoundaryTimes(videoPath, media.duration);
  const [boundaries, loudness] = await Promise.all([
    analyzeBoundaries(videoPath, boundaryTimes.times, media.duration),
    media.hasAudio ? measureLoudness(videoPath) : Promise.resolve(null),
  ]);
  const review = boundaries.filter((item) => item.level === "review").length;
  const strong = boundaries.filter((item) => item.level === "strong").length;
  const normalizeAudio = Boolean(loudness && (Math.abs(loudness.inputI + 14) > 0.8 || loudness.inputTp > -1.4));
  return {
    version: 1,
    duration: Math.round(media.duration * 1000) / 1000,
    hasAudio: media.hasAudio,
    boundarySource: boundaryTimes.source,
    boundaries,
    loudness,
    summary: {
      total: boundaries.length,
      review,
      strong,
      maxScore: boundaries.reduce((max, item) => Math.max(max, item.score), 0),
      truncated: boundaryTimes.truncated,
    },
    recommendations: { normalizeAudio, deflicker: false },
  };
}

function fixed(value: number): string {
  return Math.max(-99, Math.min(99, value)).toFixed(2);
}

export function buildMasteringArgs(input: {
  videoPath: string;
  outputPath: string;
  contentId: string;
  duration: number;
  hasAudio: boolean;
  loudness: LoudnessMeasurement | null;
  options: MasteringOptions;
}): string[] {
  const normalizeAudio = input.options.normalizeAudio && input.hasAudio && Boolean(input.loudness);
  if (!normalizeAudio && !input.options.deflicker) throw new Error("请至少选择一项本地精修操作");
  const args = ["-nostdin", "-v", "error", "-y", "-i", input.videoPath, "-map", "0:v:0", ...(input.hasAudio ? ["-map", "0:a:0"] : [])];
  if (input.options.deflicker) {
    args.push("-vf", "deflicker=size=5:mode=median,format=yuv420p", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p");
  } else {
    args.push("-c:v", "copy");
  }
  if (input.hasAudio) {
    if (normalizeAudio && input.loudness) {
      const m = input.loudness;
      args.push(
        "-af", `loudnorm=I=-14:TP=-1.5:LRA=11:measured_I=${fixed(m.inputI)}:measured_LRA=${fixed(m.inputLra)}:measured_TP=${fixed(m.inputTp)}:measured_thresh=${fixed(m.inputThresh)}:offset=${fixed(m.targetOffset)}:linear=true:print_format=summary`,
        "-c:a", "aac", "-b:a", "192k", "-ar", "48000"
      );
    } else {
      args.push("-c:a", "copy");
    }
  }
  args.push(
    "-map_metadata", "0",
    "-movflags", "+faststart",
    ...buildAigcMetadataArgv({ contentId: input.contentId }),
    "-t", input.duration.toFixed(3),
    input.outputPath
  );
  return args;
}

export async function renderMastering(input: {
  videoPath: string;
  outputPath: string;
  contentId: string;
  analysis: MasteringAnalysis;
  options: MasteringOptions;
}): Promise<string> {
  await mkdir(dirname(input.outputPath), { recursive: true });
  const args = buildMasteringArgs({
    ...input,
    duration: input.analysis.duration,
    hasAudio: input.analysis.hasAudio,
    loudness: input.analysis.loudness,
  });
  try {
    await withComposeSlot(() => execFileAsync(ffmpegBin(), args, {
      timeout: COMPOSE_TIMEOUT_MS,
      maxBuffer: 32 * 1024 * 1024,
    }));
    if (!(await validateMediaFile(input.outputPath, "video"))) throw new Error("本地精修结果校验失败，原成片保持不变");
    await Promise.all([
      copyFile(`${input.videoPath}.timeline.json`, `${input.outputPath}.timeline.json`).catch(() => undefined),
      writeFile(`${input.outputPath}.mastering.json`, JSON.stringify({ version: 1, analysis: input.analysis, options: input.options }, null, 2), "utf8"),
    ]);
    return input.outputPath;
  } catch (error) {
    await rm(input.outputPath, { force: true }).catch(() => undefined);
    throw error;
  }
}
