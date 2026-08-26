import { describe, expect, it } from "vitest";
import {
  appendTranscriptChunk,
  decodeFloat32Pcm,
  sanitizeTranscriptCheckpoint,
  summarizeTranscriptCheckpoint,
  transcriptFromCheckpoint,
} from "@/lib/transcript-checkpoint";
import type { TranscriptDocument } from "@/lib/transcript-editor";

function chunk(start: number, end: number, text: string, device: "webgpu" | "wasm" = "wasm"): TranscriptDocument {
  return {
    version: 1,
    text,
    language: "zh",
    duration: 600,
    model: "local-test",
    device,
    words: [{ id: "w1", text, start, end }],
    segments: [],
    silenceRanges: [{ start: end, end: end + 0.8 }],
    createdAt: "2026-08-26T00:00:00.000Z",
  };
}

describe("transcript checkpoints", () => {
  it("merges chunks into one stable word timeline and final document", () => {
    const first = appendTranscriptChunk({ checkpoint: null, chunk: chunk(1, 2, "第一段"), sourceDuration: 600, processedSeconds: 300, model: "local-test", language: "zh" });
    const second = appendTranscriptChunk({ checkpoint: first, chunk: chunk(301, 302, "第二段", "webgpu"), sourceDuration: 600, processedSeconds: 600, model: "local-test", language: "zh" });
    expect(second.words.map((word) => [word.id, word.text])).toEqual([["w1", "第一段"], ["w2", "第二段"]]);
    expect(second.device).toBe("webgpu");
    expect(transcriptFromCheckpoint(second)).toMatchObject({ duration: 600, text: "第一段 第二段" });
    expect(transcriptFromCheckpoint(second).segments).toHaveLength(2);
  });

  it("sanitizes resume data against the selected model and language", () => {
    const checkpoint = appendTranscriptChunk({ checkpoint: null, chunk: chunk(1, 2, "内容"), sourceDuration: 600, processedSeconds: 300, model: "local-test", language: "zh" });
    expect(sanitizeTranscriptCheckpoint(checkpoint, 600, { model: "local-test", language: "zh" })?.processedSeconds).toBe(300);
    expect(sanitizeTranscriptCheckpoint(checkpoint, 600, { model: "other", language: "zh" })).toBeNull();
    expect(summarizeTranscriptCheckpoint(checkpoint)).toMatchObject({ processedSeconds: 300, resumable: true });
  });

  it("advances across silent chunks and accepts speech after a long leading silence", () => {
    const silent: TranscriptDocument = {
      ...chunk(1, 2, "unused"),
      text: "",
      words: [],
      silenceRanges: [{ start: 0, end: 300 }],
    };
    const first = appendTranscriptChunk({ checkpoint: null, chunk: silent, sourceDuration: 600, processedSeconds: 300, model: "local-test", language: "zh" });
    expect(first).toMatchObject({ processedSeconds: 300, words: [], silenceRanges: [{ start: 0, end: 300 }] });
    expect(sanitizeTranscriptCheckpoint(first, 600, { model: "local-test", language: "zh" })?.processedSeconds).toBe(300);

    const second = appendTranscriptChunk({ checkpoint: first, chunk: chunk(540, 541, "终于开口"), sourceDuration: 600, processedSeconds: 600, model: "local-test", language: "zh" });
    expect(transcriptFromCheckpoint(second).text).toBe("终于开口");
  });

  it("rejects non-advancing chunks and malformed PCM", () => {
    const first = appendTranscriptChunk({ checkpoint: null, chunk: chunk(1, 2, "内容"), sourceDuration: 600, processedSeconds: 300, model: "local-test", language: "zh" });
    expect(() => appendTranscriptChunk({ checkpoint: first, chunk: chunk(2, 3, "重复"), sourceDuration: 600, processedSeconds: 300, model: "local-test", language: "zh" })).toThrow(/advance/);
    expect(() => decodeFloat32Pcm(new ArrayBuffer(3))).toThrow(/PCM/);
    const pcm = decodeFloat32Pcm(new Float32Array([0.25, -0.5]).buffer);
    expect([...pcm]).toEqual([0.25, -0.5]);
  });
});
