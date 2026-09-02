import { execFile } from "child_process";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { promisify } from "util";
import { afterEach, describe, expect, it } from "vitest";
import { ffmpegBin } from "@/lib/ffmpeg-path";
import { probeMedia } from "@/lib/media-probe";
import { buildVideoRepairInvocation, renderVideoRepair } from "@/lib/video-repair-render";

const execFileAsync = promisify(execFile);
const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("video repair rendering", () => {
  it("builds a three-part splice and maps only the source audio", () => {
    const invocation = buildVideoRepairInvocation({
      sourcePath: "/source.mp4", replacementPath: "/replacement.mp4", outputPath: "/output.mp4",
      sourceDuration: 6, sourceWidth: 720, sourceHeight: 1280, sourceFrameRate: 24, sourceHasAudio: true,
      window: { start: 2, end: 4 }, contentId: "project:repair",
    });
    expect(invocation.filterComplex).toContain("[vbefore][vrepair][vafter]concat=n=3:v=1:a=0[vout]");
    expect(invocation.args).toEqual(expect.arrayContaining(["-map", "0:a:0"]));
    expect(invocation.args).not.toContain("1:a:0");
  });

  it("creates a valid full-duration candidate and preserves source audio", async () => {
    const directory = await mkdtemp(join(tmpdir(), "vibesku-clips-video-repair-"));
    directories.push(directory);
    const source = join(directory, "source.mp4");
    const replacement = join(directory, "replacement.mp4");
    const output = join(directory, "repaired.mp4");
    await execFileAsync(ffmpegBin(), [
      "-nostdin", "-v", "error", "-y",
      "-f", "lavfi", "-i", "color=c=blue:size=320x180:rate=24:duration=4",
      "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100:duration=4",
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", source,
    ]);
    await execFileAsync(ffmpegBin(), [
      "-nostdin", "-v", "error", "-y",
      "-f", "lavfi", "-i", "color=c=red:size=160x90:rate=12:duration=2",
      "-c:v", "libx264", "-pix_fmt", "yuv420p", replacement,
    ]);
    await renderVideoRepair({ sourcePath: source, replacementPath: replacement, outputPath: output, window: { start: 1, end: 3 }, contentId: "test:repair" });
    const metadata = await probeMedia(output);
    expect(metadata.width).toBe(320);
    expect(metadata.height).toBe(180);
    expect(metadata.hasAudio).toBe(true);
    expect(metadata.duration).toBeGreaterThan(3.85);
    expect(metadata.duration).toBeLessThan(4.15);
  }, 30_000);
});
