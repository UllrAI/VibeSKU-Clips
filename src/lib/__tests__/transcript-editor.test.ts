import { describe, expect, it } from "vitest";
import {
  DEFAULT_TRANSCRIPT_EDIT_PLAN,
  detectFillerWordIds,
  detectSilenceRanges,
  findTranscriptWordAtTime,
  keepRangesForPlan,
  karaokeLinesFromWords,
  nextPlayableSourceTime,
  normalizeTimeRanges,
  outputTimeToSourceTime,
  outputDuration,
  remapKeptWords,
  sanitizeTranscriptDocument,
  sanitizeTranscriptEditPlan,
  segmentsFromWords,
  sourceTimeToOutputTime,
  transcriptWordsToCues,
  type TranscriptDocument,
} from "@/lib/transcript-editor";

const document: TranscriptDocument = {
  version: 1,
  text: "你好 世界",
  language: "zh",
  duration: 5,
  model: "local-test",
  device: "wasm",
  words: [
    { id: "w1", text: "你好", start: 0.4, end: 0.9 },
    { id: "w2", text: "世界。", start: 1.2, end: 1.8 },
    { id: "w3", text: "继续", start: 3.4, end: 4 },
  ],
  segments: [],
  silenceRanges: [{ start: 2, end: 3.2 }],
  createdAt: "2026-08-25T00:00:00.000Z",
};

describe("transcript edit ranges", () => {
  it("clamps, sorts and merges overlapping ranges", () => {
    expect(normalizeTimeRanges([
      { start: 2, end: 3 },
      { start: -1, end: 0.5 },
      { start: 0.49, end: 1 },
      { start: 9, end: 12 },
    ], 10)).toEqual([{ start: 0, end: 1 }, { start: 2, end: 3 }, { start: 9, end: 10 }]);
  });

  it("sanitizes client plans against real word ids", () => {
    expect(sanitizeTranscriptEditPlan({ removedWordIds: ["w2", "bad", "w2"], silencePaddingMs: 9999, wordPaddingMs: -3 }, new Set(["w1", "w2"]))).toMatchObject({
      removedWordIds: ["w2"],
      silencePaddingMs: 1000,
      wordPaddingMs: 0,
    });
  });

  it("turns removed words and silence into deterministic keep ranges", () => {
    const plan = { ...DEFAULT_TRANSCRIPT_EDIT_PLAN, removedWordIds: ["w2"], removeSilence: true, wordPaddingMs: 0, silencePaddingMs: 100 };
    const kept = keepRangesForPlan(document, plan);
    expect(kept).toEqual([
      { start: 0, end: 1.2 },
      { start: 1.8, end: 2.1 },
      { start: 3.1, end: 5 },
    ]);
    expect(outputDuration(kept)).toBeCloseTo(3.4, 6);
  });

  it("remaps surviving word timestamps onto the edited timeline", () => {
    const kept = [{ start: 0, end: 1 }, { start: 3, end: 5 }];
    expect(remapKeptWords(document, kept)).toEqual([
      { id: "w1", text: "你好", start: 0.4, end: 0.9 },
      { id: "w3", text: "继续", start: 1.4, end: 2 },
    ]);
  });

  it("maps preview time in both directions and skips removed source spans", () => {
    const kept = [{ start: 0.5, end: 1.5 }, { start: 3, end: 5 }];
    expect(sourceTimeToOutputTime(3.5, kept)).toBeCloseTo(1.5, 6);
    expect(sourceTimeToOutputTime(2, kept)).toBeNull();
    expect(outputTimeToSourceTime(1.5, kept)).toBeCloseTo(3.5, 6);
    expect(nextPlayableSourceTime(2, kept)).toBe(3);
    expect(nextPlayableSourceTime(6, kept)).toBeNull();
  });

  it("finds active words efficiently and builds edited subtitle cues", () => {
    expect(findTranscriptWordAtTime(document.words, 1.4)?.id).toBe("w2");
    expect(findTranscriptWordAtTime(document.words, 2.2)).toBeNull();
    const cues = transcriptWordsToCues(document, [{ start: 0, end: 1 }, { start: 3, end: 5 }]);
    expect(cues).toEqual([
      { index: 1, startMs: 400, endMs: 2000, text: "你好继续" },
    ]);
  });

  it("marks only conservative filler tokens for review", () => {
    const fillers = { ...document, words: [
      { id: "a", text: "嗯，", start: 0, end: 0.2 },
      { id: "b", text: "然后", start: 0.3, end: 0.7 },
      { id: "c", text: "UM", start: 0.8, end: 1 },
    ] };
    expect(detectFillerWordIds(fillers)).toEqual(["a", "c"]);
  });
});
describe("transcript normalization", () => {
  it("uses the probed source duration instead of trusting a client claim", () => {
    const clean = sanitizeTranscriptDocument({ ...document, duration: 999, words: [{ id: "x", text: "测试", start: 1, end: 50 }] }, 6);
    expect(clean?.duration).toBe(6);
    expect(clean?.words[0]).toMatchObject({ start: 1, end: 6 });
  });

  it("builds readable segments and real-timestamp karaoke lines", () => {
    const segments = segmentsFromWords(document.words);
    expect(segments.map((segment) => segment.text)).toEqual(["你好世界。", "继续"]);
    const lines = karaokeLinesFromWords(document.words);
    expect(lines).toHaveLength(2);
    expect(lines[0].words?.[1]).toMatchObject({ text: "世界。", startSec: 1.2, endSec: 1.8 });
  });

  it("detects sustained low-energy windows but ignores short gaps", () => {
    const rate = 1000;
    const samples = new Float32Array(rate * 2);
    samples.fill(0.4, 0, 400);
    samples.fill(0, 400, 1200);
    samples.fill(0.4, 1200);
    expect(detectSilenceRanges(samples, rate, -38, 550)).toEqual([{ start: 0.4, end: 1.2 }]);
  });
});
