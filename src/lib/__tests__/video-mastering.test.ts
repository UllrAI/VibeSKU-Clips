import { execFile } from "child_process";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { promisify } from "util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ffmpegBin } from "@/lib/ffmpeg-path";
import { validateMediaFile } from "@/lib/media-validate";
import {
  analyzeMastering,
  buildBoundarySignalFilter,
  buildMasteringArgs,
  parseLoudnormMeasurement,
  parseSignalStats,
  renderMastering,
  scoreBoundary,
} from "@/lib/video-mastering";

const run = promisify(execFile);

describe("video mastering contract", () => {
  it("parses tagged signalstats blocks", () => {
    const parsed = parseSignalStats([
      "frame:0 pts:0 pts_time:0",
      "vibesku-clips.sample=0",
      "lavfi.signalstats.YAVG=42.5",
      "lavfi.signalstats.UAVG=121",
      "lavfi.signalstats.VAVG=135",
      "lavfi.signalstats.SATAVG=18.5",
      "frame:0 pts:0 pts_time:0",
      "vibesku-clips.sample=1",
      "lavfi.signalstats.YAVG=180",
      "lavfi.signalstats.UAVG=102",
      "lavfi.signalstats.VAVG=160",
      "lavfi.signalstats.SATAVG=55",
    ].join("\n"));
    expect(parsed.get(0)).toEqual({ y: 42.5, u: 121, v: 135, saturation: 18.5 });
    expect(parsed.get(1)?.y).toBe(180);
  });

  it("scores luma/chroma changes without treating the score as an absolute verdict", () => {
    const calm = scoreBoundary(2, { y: 100, u: 128, v: 128, saturation: 25 }, { y: 105, u: 130, v: 127, saturation: 27 });
    const jump = scoreBoundary(4, { y: 16, u: 128, v: 128, saturation: 0 }, { y: 235, u: 80, v: 180, saturation: 120 });
    expect(calm.level).toBe("ok");
    expect(jump.level).toBe("strong");
    expect(jump.score).toBeGreaterThan(calm.score);
  });

  it("parses first-pass loudnorm JSON", () => {
    const parsed = parseLoudnormMeasurement(`noise\n{\n  "input_i" : "-20.10",\n  "input_tp" : "-3.20",\n  "input_lra" : "2.10",\n  "input_thresh" : "-30.20",\n  "target_offset" : "0.10"\n}\nmore`);
    expect(parsed).toEqual({ inputI: -20.1, inputTp: -3.2, inputLra: 2.1, inputThresh: -30.2, targetOffset: 0.1 });
    expect(parseLoudnormMeasurement("no stats")).toBeNull();
  });

  it("builds one-pass boundary sampling and risk-scoped mastering args", () => {
    const filter = buildBoundarySignalFilter([1, 2], 3);
    expect(filter).toContain("split=4");
    expect(filter).toContain("vibesku-clips.sample:value=3");
    const args = buildMasteringArgs({
      videoPath: "/tmp/in.mp4",
      outputPath: "/tmp/out.mp4",
      contentId: "project-1",
      duration: 3,
      hasAudio: true,
      loudness: { inputI: -18, inputTp: -3, inputLra: 2, inputThresh: -28, targetOffset: 0.2 },
      options: { normalizeAudio: true, deflicker: false },
    });
    expect(args).toContain("copy");
    expect(args.join(" ")).toContain("measured_I=-18.00");
    expect(args.join(" ")).not.toContain("deflicker=");
    const visual = buildMasteringArgs({
      videoPath: "/tmp/in.mp4",
      outputPath: "/tmp/out.mp4",
      contentId: "project-1",
      duration: 3,
      hasAudio: false,
      loudness: null,
      options: { normalizeAudio: false, deflicker: true },
    });
    expect(visual.join(" ")).toContain("deflicker=size=5:mode=median");
    expect(() => buildMasteringArgs({
      videoPath: "/tmp/in.mp4", outputPath: "/tmp/out.mp4", contentId: "p", duration: 3,
      hasAudio: false, loudness: null, options: { normalizeAudio: false, deflicker: false },
    })).toThrow(/至少选择/);
  });
});

describe("video mastering FFmpeg integration", () => {
  let directory = "";
  let source = "";

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), "vibesku-clips-mastering-"));
    source = join(directory, "source.mp4");
    await run(ffmpegBin(), [
      "-y",
      "-f", "lavfi", "-i", "color=c=black:s=320x180:d=1:r=30",
      "-f", "lavfi", "-i", "color=c=white:s=320x180:d=1:r=30",
      "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=2",
      "-filter_complex", "[0:v][1:v]concat=n=2:v=1:a=0[v]",
      "-map", "[v]", "-map", "2:a:0",
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest",
      source,
    ]);
    await writeFile(`${source}.timeline.json`, JSON.stringify({ version: 1, boundaries: [1], total: 2 }), "utf8");
  }, 30_000);

  afterAll(async () => {
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  it("finds a strong cut and writes a non-destructive loudness master", async () => {
    const analysis = await analyzeMastering(source);
    expect(analysis.boundarySource).toBe("timeline");
    expect(analysis.boundaries).toHaveLength(1);
    expect(analysis.boundaries[0].level).toBe("strong");
    expect(analysis.loudness).not.toBeNull();

    const output = join(directory, "master.mp4");
    await renderMastering({
      videoPath: source,
      outputPath: output,
      contentId: "test-project",
      analysis,
      options: { normalizeAudio: true, deflicker: false },
    });
    expect(await validateMediaFile(output, "video")).toBe(true);
  }, 30_000);
});
