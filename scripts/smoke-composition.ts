import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  buildWordSubtitleTrack,
  composeMedia,
} from "../src/lib/ugc/composition";

const run = promisify(execFile);
async function main() {
  const directory = await mkdtemp(join(tmpdir(), "vibesku-compose-smoke-"));
  const requireSubtitles =
    process.env.COMPOSITION_SMOKE_REQUIRE_SUBTITLES === "1";
  const server = createServer(async (request, response) => {
    const name =
      request.url === "/one.mp4"
        ? "one.mp4"
        : request.url === "/two.mp4"
          ? "two.mp4"
          : null;
    if (!name) {
      response.writeHead(404).end();
      return;
    }
    const path = join(directory, name);
    const file = await stat(path);
    response.setHeader("Content-Length", file.size);
    response.setHeader("Content-Type", "video/mp4");
    createReadStream(path).pipe(response);
  });

  try {
    for (const [name, color, frequency] of [
      ["one", "red", "440"],
      ["two", "blue", "660"],
    ]) {
      await run("ffmpeg", [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-f",
        "lavfi",
        "-i",
        `color=c=${color}:s=320x180:r=30`,
        "-f",
        "lavfi",
        "-i",
        `sine=frequency=${frequency}:sample_rate=48000`,
        "-t",
        "3",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        join(directory, `${name}.mp4`),
      ]);
    }
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("HTTP server did not bind.");
    const base = `http://127.0.0.1:${address.port}`;
    const result = await composeMedia(
      {
        aspectRatio: "9:16",
        resolution: "480p",
        segments: [
          {
            videoUrl: `${base}/one.mp4`,
            audioUrl: null,
            durationMs: 3000,
            hasSpeech: requireSubtitles,
            preserveVideoAudio: true,
            words: requireSubtitles
              ? [{ text: "Hello", startMs: 300, endMs: 1100 }]
              : [],
          },
          {
            videoUrl: `${base}/two.mp4`,
            audioUrl: null,
            durationMs: 3000,
            hasSpeech: requireSubtitles,
            preserveVideoAudio: requireSubtitles,
            words: requireSubtitles
              ? [{ text: "there", startMs: 200, endMs: 1000 }]
              : [],
          },
        ],
      },
      directory,
    );
    if (Math.abs(result.durationMs - 6000) > 700)
      throw new Error(`Unexpected composition duration: ${result.durationMs}`);
    if (requireSubtitles && !(await stat(result.subtitlePath)).size)
      throw new Error("Subtitle file is empty.");
    const captions = buildWordSubtitleTrack([
      {
        durationMs: 3000,
        words: [{ text: "Hello", startMs: 300, endMs: 1100 }],
      },
      {
        durationMs: 3000,
        words: [{ text: "there", startMs: 200, endMs: 1000 }],
      },
    ]);
    if (!captions.includes("00:00:03,200 --> 00:00:04,000"))
      throw new Error("Subtitle offsets are incorrect.");
    console.log(`Composition smoke test passed (${result.durationMs} ms).`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  }
}

void main();
