import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { measureWavDurationMs } from "./audio";
import { probeMediaToolchain } from "./toolchain";

/** A minimal PCM WAV whose header says exactly how long it is. */
function wav(
  durationMs: number,
  options: { declareSize?: boolean } = {},
): Buffer {
  const sampleRate = 48_000;
  const byteRate = sampleRate * 2;
  const dataSize = Math.round((durationMs / 1000) * byteRate);
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(options.declareSize === false ? 0 : dataSize, 40);
  return Buffer.concat([header, Buffer.alloc(dataSize)]);
}

describe("worker media preflight", () => {
  let directory: string;

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), "vibesku-preflight-"));
  });

  afterAll(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it("measures narration length without FFmpeg, which the general worker lacks", async () => {
    const path = join(directory, "narration.wav");
    await writeFile(path, wav(4500));
    expect(await measureWavDurationMs(path)).toBe(4500);
  });

  it("falls back to the file size when a streamed WAV declares none", async () => {
    const path = join(directory, "streamed.wav");
    await writeFile(path, wav(2000, { declareSize: false }));
    expect(await measureWavDurationMs(path)).toBe(2000);
  });

  it("reports an unmeasurable file instead of guessing at its length", async () => {
    const path = join(directory, "not-audio.bin");
    await writeFile(path, Buffer.from("this is not a WAV file at all"));
    expect(await measureWavDurationMs(path)).toBeNull();
  });

  it("refuses a render host with no media toolchain", async () => {
    const state = await probeMediaToolchain(
      join(directory, "absent-ffmpeg"),
      join(directory, "absent-ffprobe"),
    );
    expect(state.state).toBe("unavailable");
    expect(state.state === "unavailable" && state.detail).toContain(
      "absent-ffmpeg",
    );
  });
});
