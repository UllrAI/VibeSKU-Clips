import { open, stat } from "node:fs/promises";

/**
 * Reading a WAV header without FFmpeg.
 *
 * Narration that overruns its shot has to be caught where it is produced. The
 * general worker generates it but carries no media tools — only the render
 * worker does — so waiting for FFmpeg to measure it means waiting until every
 * shot in the work has already been generated and paid for.
 */
const HEADER_BYTES = 4096;

export async function measureWavDurationMs(
  path: string,
): Promise<number | null> {
  const file = await open(path, "r");
  try {
    const { size } = await stat(path);
    const header = Buffer.alloc(Math.min(HEADER_BYTES, size));
    const { bytesRead } = await file.read(header, 0, header.length, 0);
    if (
      bytesRead < 12 ||
      header.toString("ascii", 0, 4) !== "RIFF" ||
      header.toString("ascii", 8, 12) !== "WAVE"
    ) {
      return null;
    }

    let offset = 12;
    let byteRate = 0;
    while (offset + 8 <= bytesRead) {
      const id = header.toString("ascii", offset, offset + 4);
      const chunkSize = header.readUInt32LE(offset + 4);
      // fmt: id, size, format, channels, sampleRate, then byteRate at +16.
      if (id === "fmt " && offset + 20 <= bytesRead) {
        byteRate = header.readUInt32LE(offset + 16);
      }
      if (id === "data") {
        if (!byteRate) return null;
        // A streamed WAV may declare an unusable data size, so trust the file.
        const declared =
          chunkSize > 0 && offset + 8 + chunkSize <= size
            ? chunkSize
            : size - offset - 8;
        return Math.round((declared / byteRate) * 1000);
      }
      offset += 8 + chunkSize + (chunkSize % 2);
    }
    return null;
  } finally {
    await file.close();
  }
}
