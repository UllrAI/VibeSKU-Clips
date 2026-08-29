import { execFile } from "child_process";
import { mkdir, rm, writeFile } from "fs/promises";
import { dirname } from "path";
import { promisify } from "util";
import { buildAigcMetadataArgv } from "@/lib/compliance-metadata";
import { ffmpegBin } from "@/lib/ffmpeg-path";
import { probeMedia } from "@/lib/media-probe";
import { validateMediaFile } from "@/lib/media-validate";
import type { RepairWindow } from "@/lib/video-repair-plan";
import { COMPOSE_TIMEOUT_MS, withComposeSlot } from "@/lib/video-composer/composer";

const execFileAsync = promisify(execFile);

export interface VideoRepairInvocation {
  filterComplex: string;
  args: string[];
  outputPath: string;
}

function normalizedVideoFilter(input: string, width: number, height: number, frameRate: number): string {
  return `${input},fps=${frameRate.toFixed(3)},scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p`;
}

/** Build a deterministic full-shot splice while retaining the source audio timeline. */
export function buildVideoRepairInvocation(input: {
  sourcePath: string;
  replacementPath: string;
  outputPath: string;
  sourceDuration: number;
  sourceWidth: number;
  sourceHeight: number;
  sourceFrameRate: number;
  sourceHasAudio: boolean;
  window: RepairWindow;
  contentId: string;
}): VideoRepairInvocation {
  const sourceDuration = Math.max(0.5, input.sourceDuration);
  const start = Math.max(0, Math.min(sourceDuration - 0.01, input.window.start));
  const end = Math.max(start + 0.01, Math.min(sourceDuration, input.window.end));
  const repairDuration = end - start;
  const width = Math.max(2, Math.floor(input.sourceWidth / 2) * 2);
  const height = Math.max(2, Math.floor(input.sourceHeight / 2) * 2);
  const frameRate = Math.max(1, Math.min(120, input.sourceFrameRate || 30));
  const filters: string[] = [];
  const segments: string[] = [];

  if (start > 0.02) {
    filters.push(`${normalizedVideoFilter(`[0:v]trim=start=0:end=${start.toFixed(3)},setpts=PTS-STARTPTS`, width, height, frameRate)}[vbefore]`);
    segments.push("[vbefore]");
  }
  filters.push(`${normalizedVideoFilter(`[1:v]tpad=stop_mode=clone:stop_duration=${repairDuration.toFixed(3)},trim=start=0:end=${repairDuration.toFixed(3)},setpts=PTS-STARTPTS`, width, height, frameRate)}[vrepair]`);
  segments.push("[vrepair]");
  if (end < sourceDuration - 0.02) {
    filters.push(`${normalizedVideoFilter(`[0:v]trim=start=${end.toFixed(3)}:end=${sourceDuration.toFixed(3)},setpts=PTS-STARTPTS`, width, height, frameRate)}[vafter]`);
    segments.push("[vafter]");
  }
  if (segments.length > 1) filters.push(`${segments.join("")}concat=n=${segments.length}:v=1:a=0[vout]`);
  else filters.push(`${segments[0]}null[vout]`);

  const filterComplex = filters.join(";\n");
  const filterFile = `${input.outputPath}.filter.txt`;
  const args = [
    "-nostdin", "-v", "error", "-y",
    "-i", input.sourcePath,
    "-i", input.replacementPath,
    "-filter_complex_script", filterFile,
    "-map", "[vout]",
    ...(input.sourceHasAudio ? ["-map", "0:a:0"] : []),
    "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
    ...(input.sourceHasAudio ? ["-c:a", "aac", "-b:a", "192k"] : []),
    "-movflags", "+faststart",
    ...buildAigcMetadataArgv({ contentId: input.contentId }),
    "-t", sourceDuration.toFixed(3),
    input.outputPath,
  ];
  return { filterComplex, args, outputPath: input.outputPath };
}

export async function renderVideoRepair(input: {
  sourcePath: string;
  replacementPath: string;
  outputPath: string;
  window: RepairWindow;
  contentId: string;
}): Promise<string> {
  const source = await probeMedia(input.sourcePath);
  if (source.duration <= 0 || source.width <= 0 || source.height <= 0) throw new Error("原镜头无法读取，不能执行精准修复");
  const replacement = await probeMedia(input.replacementPath);
  if (replacement.duration <= 0 || replacement.width <= 0 || replacement.height <= 0) throw new Error("替换片段无效，未修改原镜头");
  const start = Math.max(0, Math.min(source.duration - 0.01, input.window.start));
  const end = Math.max(start + 0.01, Math.min(source.duration, input.window.end));
  if (replacement.duration + 0.1 < end - start) throw new Error("替换片段短于修复区间，未修改原镜头");
  await mkdir(dirname(input.outputPath), { recursive: true });
  const invocation = buildVideoRepairInvocation({
    ...input,
    sourceDuration: source.duration,
    sourceWidth: source.width,
    sourceHeight: source.height,
    sourceFrameRate: source.frameRate,
    sourceHasAudio: source.hasAudio,
    window: { start, end },
  });
  const filterFile = `${input.outputPath}.filter.txt`;
  await writeFile(filterFile, invocation.filterComplex, "utf8");
  try {
    await withComposeSlot(() => execFileAsync(ffmpegBin(), invocation.args, {
      timeout: COMPOSE_TIMEOUT_MS,
      maxBuffer: 50 * 1024 * 1024,
    }));
    if (!(await validateMediaFile(input.outputPath, "video"))) throw new Error("修复成片校验失败，原镜头保持不变");
    return input.outputPath;
  } catch (error) {
    await rm(input.outputPath, { force: true }).catch(() => undefined);
    throw error;
  } finally {
    await rm(filterFile, { force: true }).catch(() => undefined);
  }
}
