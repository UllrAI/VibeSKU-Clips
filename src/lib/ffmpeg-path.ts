/**
 * ffmpeg / ffprobe binary path resolution.
 *
 * Falls back to `ffmpeg` / `ffprobe` on the system PATH. Deployments may inject
 * explicit paths through FFMPEG_PATH / FFPROBE_PATH.
 *
 * Note: return values are interpolated into shell command strings; paths may contain spaces —
 * callers must wrap them in double quotes.
 */

/** Path to the ffmpeg executable (callers must quote it if it contains spaces) */
export function ffmpegBin(): string {
  return process.env.FFMPEG_PATH || "ffmpeg";
}

/** Path to the ffprobe executable (callers must quote it if it contains spaces) */
export function ffprobeBin(): string {
  return process.env.FFPROBE_PATH || "ffprobe";
}
