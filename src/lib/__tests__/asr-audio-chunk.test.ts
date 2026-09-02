import { execFile } from "child_process";
import { mkdtemp, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { promisify } from "util";
import { describe, expect, it } from "vitest";
import { asrAudioChunkArgs, extractAsrAudioChunk } from "@/lib/asr-audio-chunk";
import { ffmpegBin } from "@/lib/ffmpeg-path";
import { ASR_SAMPLE_RATE } from "@/lib/transcript-checkpoint";

const execFileAsync = promisify(execFile);

describe("bounded ASR audio extraction", () => {
  it("uses one mono 16 kHz float stream without a shell", () => {
    expect(asrAudioChunkArgs("/tmp/source.mp4", 3.25, 12)).toEqual(expect.arrayContaining([
      "-ss", "3.250", "-t", "12.000", "-i", "/tmp/source.mp4", "-ac", "1", "-ar", "16000", "-f", "f32le", "pipe:1",
    ]));
  });

  it("extracts only the requested segment from real media", async () => {
    const directory = await mkdtemp(join(tmpdir(), "vibesku-clips-asr-chunk-"));
    const source = join(directory, "tone.wav");
    await execFileAsync(ffmpegBin(), ["-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=2", source], { timeout: 60_000 });
    const pcm = await extractAsrAudioChunk({ inputPath: source, startSeconds: 0.5, durationSeconds: 0.75 });
    expect(pcm.byteLength / Float32Array.BYTES_PER_ELEMENT).toBeGreaterThanOrEqual(ASR_SAMPLE_RATE * 0.74);
    expect(pcm.byteLength / Float32Array.BYTES_PER_ELEMENT).toBeLessThanOrEqual(ASR_SAMPLE_RATE * 0.76);
  }, 60_000);

  it("rejects undecodable audio", async () => {
    const directory = await mkdtemp(join(tmpdir(), "vibesku-clips-asr-bad-"));
    const source = join(directory, "bad.mp4");
    await writeFile(source, "not media");
    await expect(extractAsrAudioChunk({ inputPath: source, startSeconds: 0, durationSeconds: 1 })).rejects.toThrow();
  });
});
