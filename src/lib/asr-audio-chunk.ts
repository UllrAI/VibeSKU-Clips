import { execFile } from "child_process";
import { ffmpegBin } from "@/lib/ffmpeg-path";
import { ASR_CHUNK_SECONDS, ASR_SAMPLE_RATE } from "@/lib/transcript-checkpoint";

const MAX_PCM_BYTES = ASR_CHUNK_SECONDS * ASR_SAMPLE_RATE * Float32Array.BYTES_PER_ELEMENT;

export function asrAudioChunkArgs(inputPath: string, startSeconds: number, durationSeconds: number): string[] {
  return [
    "-hide_banner",
    "-loglevel", "error",
    "-nostdin",
    "-ss", startSeconds.toFixed(3),
    "-t", durationSeconds.toFixed(3),
    "-i", inputPath,
    "-map", "0:a:0",
    "-vn",
    "-ac", "1",
    "-ar", String(ASR_SAMPLE_RATE),
    "-c:a", "pcm_f32le",
    "-f", "f32le",
    "pipe:1",
  ];
}

/** Extract one bounded mono PCM segment. Memory use is capped independently of source length. */
export function extractAsrAudioChunk(input: {
  inputPath: string;
  startSeconds: number;
  durationSeconds: number;
  signal?: AbortSignal;
}): Promise<Buffer> {
  const durationSeconds = Math.min(ASR_CHUNK_SECONDS, Math.max(0.1, input.durationSeconds));
  return new Promise((resolve, reject) => {
    execFile(
      ffmpegBin(),
      asrAudioChunkArgs(input.inputPath, Math.max(0, input.startSeconds), durationSeconds),
      { encoding: "buffer", maxBuffer: MAX_PCM_BYTES + 1024 * 1024, signal: input.signal },
      (error, stdout, stderr) => {
        if (error) {
          const detail = Buffer.isBuffer(stderr) ? stderr.toString("utf8") : String(stderr ?? "");
          reject(new Error(detail.trim() || error.message));
          return;
        }
        const output = Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout);
        if (!output.length || output.length % Float32Array.BYTES_PER_ELEMENT !== 0) {
          reject(new Error("FFmpeg returned an invalid PCM audio chunk"));
          return;
        }
        resolve(output);
      },
    );
  });
}
