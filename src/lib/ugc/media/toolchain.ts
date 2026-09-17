import { execFile } from "node:child_process";

/**
 * A render worker that starts without the FFmpeg features composition needs
 * still accepts work. It then normalises and concatenates every shot before
 * failing on the one filter it is missing — after all generation has been paid
 * for. Probing capability at start-up turns that into a deployment error.
 *
 * Capabilities are checked, not a version number: a distribution may pin
 * binaries differently and still supply everything the recipe uses.
 */
const REQUIRED_ENCODERS = ["libx264", "aac"] as const;
const REQUIRED_FILTERS = [
  "anullsrc",
  "apad",
  "aresample",
  "asetpts",
  "atrim",
  "format",
  "fps",
  "loudnorm",
  "pad",
  "scale",
  "setpts",
  "subtitles",
  "tpad",
  "trim",
] as const;

export type MediaToolchainState =
  | {
      state: "ready";
      ffmpegVersion: string;
      ffprobeVersion: string;
      /** Null when linked references cannot be fetched on this image. */
      downloaderVersion: string | null;
    }
  | { state: "unavailable" | "incomplete"; detail: string };

function run(
  executable: string,
  args: readonly string[],
): Promise<{ ok: boolean; output: string }> {
  return new Promise((resolve) => {
    execFile(
      executable,
      [...args],
      { timeout: 15_000, shell: false, maxBuffer: 4 * 1024 * 1024 },
      (error, stdout, stderr) => {
        resolve(
          error === null
            ? { ok: true, output: stdout }
            : {
                ok: false,
                output:
                  (stderr.trim() || error.message).split("\n").at(-1) ?? "",
              },
        );
      },
    );
  });
}

function firstLine(value: string): string {
  return value.split(/\r?\n/, 1)[0]?.trim() ?? "";
}

function missing(output: string, required: readonly string[]): string[] {
  return required.filter(
    (name) => !new RegExp(`(?:^|\\s)${name}(?:\\s|$)`, "m").test(output),
  );
}

export async function probeMediaToolchain(
  ffmpegPath = "ffmpeg",
  ffprobePath = "ffprobe",
  downloaderPath = "yt-dlp",
): Promise<MediaToolchainState> {
  const [ffmpeg, ffprobe, downloader] = await Promise.all([
    run(ffmpegPath, ["-version"]),
    run(ffprobePath, ["-version"]),
    // Only linked references need it. Its absence is reported at boot rather
    // than failing a job, but it does not hold composition back.
    run(downloaderPath, ["--version"]),
  ]);
  if (!ffmpeg.ok || !ffprobe.ok) {
    return {
      state: "unavailable",
      detail: !ffmpeg.ok
        ? `${ffmpegPath} is unavailable: ${ffmpeg.output}`
        : `${ffprobePath} is unavailable: ${ffprobe.output}`,
    };
  }

  const [encoders, filters] = await Promise.all([
    run(ffmpegPath, ["-hide_banner", "-encoders"]),
    run(ffmpegPath, ["-hide_banner", "-filters"]),
  ]);
  if (!encoders.ok || !filters.ok) {
    return {
      state: "incomplete",
      detail: "ffmpeg could not list its encoders and filters.",
    };
  }
  const missingEncoders = missing(encoders.output, REQUIRED_ENCODERS);
  const missingFilters = missing(filters.output, REQUIRED_FILTERS);
  if (missingEncoders.length || missingFilters.length) {
    return {
      state: "incomplete",
      detail: [
        missingEncoders.length
          ? `missing encoders: ${missingEncoders.join(", ")}`
          : "",
        missingFilters.length
          ? `missing filters: ${missingFilters.join(", ")}`
          : "",
      ]
        .filter(Boolean)
        .join("; "),
    };
  }
  return {
    state: "ready",
    ffmpegVersion: firstLine(ffmpeg.output),
    ffprobeVersion: firstLine(ffprobe.output),
    downloaderVersion: downloader.ok ? firstLine(downloader.output) : null,
  };
}
