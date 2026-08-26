import {
  normalizeTimeRanges,
  sanitizeTranscriptDocument,
  segmentsFromWords,
  type TimeRange,
  type TranscriptDocument,
  type TranscriptWord,
} from "@/lib/transcript-editor";

export const ASR_CHUNK_SECONDS = 5 * 60;
export const ASR_SAMPLE_RATE = 16_000;

export interface TranscriptCheckpoint {
  version: 1;
  model: string;
  language: string;
  device: "webgpu" | "wasm";
  duration: number;
  processedSeconds: number;
  chunkSeconds: number;
  words: TranscriptWord[];
  silenceRanges: TimeRange[];
  textParts: string[];
  createdAt: string;
}

export interface TranscriptCheckpointSummary {
  processedSeconds: number;
  duration: number;
  resumable: boolean;
  model: string;
  language: string;
}

const finite = (value: unknown, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function sanitizeTranscriptChunk(value: unknown, sourceDuration: number): TranscriptDocument | null {
  const document = sanitizeTranscriptDocument(value, sourceDuration);
  if (document) return document;
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<TranscriptDocument>;
  if (!Array.isArray(raw.words) || raw.words.length !== 0) return null;
  return {
    version: 1,
    text: typeof raw.text === "string" ? raw.text.trim() : "",
    language: typeof raw.language === "string" && raw.language ? raw.language.slice(0, 24) : "auto",
    duration: sourceDuration,
    model: typeof raw.model === "string" ? raw.model.slice(0, 160) : "",
    device: raw.device === "webgpu" ? "webgpu" : "wasm",
    words: [],
    segments: [],
    silenceRanges: normalizeTimeRanges(Array.isArray(raw.silenceRanges) ? raw.silenceRanges : [], sourceDuration),
    createdAt: typeof raw.createdAt === "string" && raw.createdAt ? raw.createdAt : new Date().toISOString(),
  };
}

export function summarizeTranscriptCheckpoint(value: TranscriptCheckpoint | null | undefined): TranscriptCheckpointSummary | null {
  if (!value) return null;
  return {
    processedSeconds: value.processedSeconds,
    duration: value.duration,
    resumable: value.processedSeconds > 0 && value.processedSeconds < value.duration,
    model: value.model,
    language: value.language,
  };
}

export function sanitizeTranscriptCheckpoint(
  value: unknown,
  sourceDuration: number,
  expected?: { model?: string | null; language?: string | null },
): TranscriptCheckpoint | null {
  if (!value || typeof value !== "object" || sourceDuration <= 0) return null;
  const raw = value as Partial<TranscriptCheckpoint>;
  const model = typeof raw.model === "string" ? raw.model.slice(0, 160) : "";
  const language = typeof raw.language === "string" && raw.language ? raw.language.slice(0, 24) : "auto";
  if (!model || (expected?.model && model !== expected.model) || (expected?.language && language !== expected.language)) return null;
  const processedSeconds = clamp(finite(raw.processedSeconds), 0, sourceDuration);
  const document = sanitizeTranscriptChunk({
    version: 1,
    text: Array.isArray(raw.textParts) ? raw.textParts.join(" ") : "",
    language,
    duration: sourceDuration,
    model,
    device: raw.device,
    words: raw.words,
    segments: [],
    silenceRanges: raw.silenceRanges,
    createdAt: raw.createdAt,
  }, sourceDuration);
  if (!document || processedSeconds <= 0) return null;
  return {
    version: 1,
    model,
    language,
    device: raw.device === "webgpu" ? "webgpu" : "wasm",
    duration: sourceDuration,
    processedSeconds,
    chunkSeconds: clamp(Math.round(finite(raw.chunkSeconds, ASR_CHUNK_SECONDS)), 30, ASR_CHUNK_SECONDS),
    words: document.words.filter((word) => word.start < processedSeconds + 0.25),
    silenceRanges: normalizeTimeRanges(document.silenceRanges.filter((range) => range.start < processedSeconds + 0.25), sourceDuration),
    textParts: Array.isArray(raw.textParts)
      ? raw.textParts.filter((part): part is string => typeof part === "string" && !!part.trim()).map((part) => part.trim()).slice(0, 2_000)
      : [],
    createdAt: typeof raw.createdAt === "string" && raw.createdAt ? raw.createdAt : new Date().toISOString(),
  };
}

export function appendTranscriptChunk(input: {
  checkpoint: TranscriptCheckpoint | null;
  chunk: TranscriptDocument;
  sourceDuration: number;
  processedSeconds: number;
  model: string;
  language: string;
}): TranscriptCheckpoint {
  const processedSeconds = clamp(input.processedSeconds, 0, input.sourceDuration);
  const previousEnd = input.checkpoint?.processedSeconds ?? 0;
  const chunkDocument = sanitizeTranscriptChunk(input.chunk, input.sourceDuration);
  if (!chunkDocument) throw new Error("Invalid transcript chunk");
  if (processedSeconds <= previousEnd + 0.01) throw new Error("Transcript checkpoint did not advance");

  const previousWords = input.checkpoint?.words ?? [];
  const freshWords = chunkDocument.words.filter((word) => word.end > previousEnd - 0.05 && word.start < processedSeconds + 0.25);
  if (chunkDocument.words.length && !freshWords.length) throw new Error("Transcript chunk does not overlap the checkpoint window");
  const words = [...previousWords, ...freshWords]
    .sort((a, b) => a.start - b.start || a.end - b.end)
    .filter((word, index, all) => index === 0 || word.start > all[index - 1].start + 0.001 || word.text !== all[index - 1].text)
    .map((word, index) => ({ ...word, id: `w${index + 1}` }));

  return {
    version: 1,
    model: input.model,
    language: input.language,
    device: chunkDocument.device,
    duration: input.sourceDuration,
    processedSeconds,
    chunkSeconds: ASR_CHUNK_SECONDS,
    words,
    silenceRanges: normalizeTimeRanges([
      ...(input.checkpoint?.silenceRanges ?? []),
      ...chunkDocument.silenceRanges,
    ], input.sourceDuration),
    textParts: [
      ...(input.checkpoint?.textParts ?? []),
      chunkDocument.text.trim(),
    ].filter(Boolean),
    createdAt: input.checkpoint?.createdAt ?? new Date().toISOString(),
  };
}

export function transcriptFromCheckpoint(checkpoint: TranscriptCheckpoint): TranscriptDocument {
  const words = checkpoint.words.map((word, index) => ({ ...word, id: `w${index + 1}` }));
  return {
    version: 1,
    text: checkpoint.textParts.join(" ").replace(/\s+/g, " ").trim() || words.map((word) => word.text).join(" "),
    language: checkpoint.language,
    duration: checkpoint.duration,
    model: checkpoint.model,
    device: checkpoint.device,
    words,
    segments: segmentsFromWords(words),
    silenceRanges: normalizeTimeRanges(checkpoint.silenceRanges, checkpoint.duration),
    createdAt: checkpoint.createdAt,
  };
}

export function decodeFloat32Pcm(input: ArrayBuffer): Float32Array {
  if (!input.byteLength || input.byteLength % Float32Array.BYTES_PER_ELEMENT !== 0) {
    throw new Error("Invalid PCM audio chunk");
  }
  return new Float32Array(input.slice(0));
}
