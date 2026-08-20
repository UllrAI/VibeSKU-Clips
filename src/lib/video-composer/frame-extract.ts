/**
 * Last-frame extraction — the seam primitive for tail-frame chaining.
 *
 * A generated clip's REAL final frame (not the pre-generated keyframe it was
 * aimed at) is the only pixel-exact continuation point: feeding it to the next
 * shot's i2v call makes the cut physically continuous, and it is the stepping
 * stone toward >30s films by sequential continuation.
 *
 * Best-effort by design: extraction failure returns undefined and never blocks
 * the pipeline — the caller falls back to the pre-generated keyframe.
 */
import { execFile } from "child_process";
import { promisify } from "util";
import { stat } from "fs/promises";
import { ffmpegBin } from "@/lib/ffmpeg-path";

const execFileAsync = promisify(execFile);

/** Suffix appended to the video path to name its extracted tail frame. */
export const LAST_FRAME_SUFFIX = ".last.jpg";

/**
 * Extract the clip's last frame as a JPEG next to the video (`<video>.last.jpg`
 * by default). `-sseof -0.1` seeks 100ms before EOF so the grab never lands on
 * a zero-length tail packet. Returns the frame path, or undefined on any
 * failure (missing binary, unreadable input, zero-byte output).
 */
export async function extractLastFrame(videoPath: string, outPath?: string): Promise<string | undefined> {
  const target = outPath ?? `${videoPath}${LAST_FRAME_SUFFIX}`;
  try {
    await execFileAsync(
      ffmpegBin(),
      ["-nostdin", "-v", "error", "-y", "-sseof", "-0.1", "-i", videoPath, "-frames:v", "1", "-q:v", "2", target],
      { timeout: 60_000 }
    );
    const st = await stat(target);
    return st.size > 0 ? target : undefined;
  } catch {
    return undefined;
  }
}
