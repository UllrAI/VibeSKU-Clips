import {
  DEFAULT_TRANSCRIPT_EDIT_PLAN,
  keepRangesForPlan,
  outputDuration,
  removedRangesForPlan,
  remapKeptWords,
  sanitizeTranscriptEditPlan,
  segmentsFromWords,
  type TimeRange,
  type TranscriptDocument,
  type TranscriptEditPlan,
} from "@/lib/transcript-editor";

export const TRANSCRIPT_EDIT_FORMAT = "clipforge-transcript-edit@1" as const;

export type TranscriptEditActor = "human" | "agent" | "cli" | "mcp" | "api";

export interface TranscriptEditDiff {
  addedWordIds: string[];
  restoredWordIds: string[];
  removeSilenceChanged: boolean;
  burnSubtitlesChanged: boolean;
}

export interface TranscriptEditSummary {
  originalDuration: number;
  outputDuration: number;
  removedDuration: number;
  removedWordCount: number;
  removedRangeCount: number;
  removedSilenceRangeCount: number;
  subtitleCueCount: number;
  removedTextPreview: string;
}

export interface TranscriptEditProposal {
  format: typeof TRANSCRIPT_EDIT_FORMAT;
  operationId: string;
  actor: TranscriptEditActor;
  baseRevision: number;
  latestRevision: number;
  nextRevision: number;
  conflict: boolean;
  changed: boolean;
  plan: TranscriptEditPlan;
  keepRanges: TimeRange[];
  diff: TranscriptEditDiff;
  summary: TranscriptEditSummary;
}

const SAFE_OPERATION_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{7,127}$/;
const ACTORS = new Set<TranscriptEditActor>(["human", "agent", "cli", "mcp", "api"]);

function roundSeconds(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function sanitizeTranscriptOperationId(value: unknown, fallback: string): string {
  return typeof value === "string" && SAFE_OPERATION_ID.test(value) ? value : fallback;
}

export function sanitizeTranscriptEditActor(value: unknown): TranscriptEditActor {
  return typeof value === "string" && ACTORS.has(value as TranscriptEditActor)
    ? value as TranscriptEditActor
    : "api";
}

export function createTranscriptEditProposal(input: {
  document: TranscriptDocument;
  value: unknown;
  basePlan?: TranscriptEditPlan | null;
  latestRevision: number;
  fallbackOperationId: string;
}): TranscriptEditProposal {
  const raw = input.value && typeof input.value === "object"
    ? input.value as Record<string, unknown>
    : {};
  const wordIds = new Set(input.document.words.map((word) => word.id));
  const basePlan = sanitizeTranscriptEditPlan(input.basePlan ?? DEFAULT_TRANSCRIPT_EDIT_PLAN, wordIds);
  const plan = sanitizeTranscriptEditPlan(raw.plan, wordIds);
  const baseRevisionValue = Number(raw.baseRevision);
  const baseRevision = Number.isInteger(baseRevisionValue) && baseRevisionValue >= 0
    ? Math.min(baseRevisionValue, 1_000_000_000)
    : input.latestRevision;
  const baseRemoved = new Set(basePlan.removedWordIds);
  const nextRemoved = new Set(plan.removedWordIds);
  const diff: TranscriptEditDiff = {
    addedWordIds: plan.removedWordIds.filter((id) => !baseRemoved.has(id)),
    restoredWordIds: basePlan.removedWordIds.filter((id) => !nextRemoved.has(id)),
    removeSilenceChanged: plan.removeSilence !== basePlan.removeSilence,
    burnSubtitlesChanged: plan.burnSubtitles !== basePlan.burnSubtitles,
  };
  const removedRanges = removedRangesForPlan(input.document, plan);
  const keepRanges = keepRangesForPlan(input.document, plan);
  const editedDuration = outputDuration(keepRanges);
  const removedWords = input.document.words.filter((word) => nextRemoved.has(word.id));
  const removedTextPreview = removedWords
    .slice(0, 18)
    .map((word) => word.text)
    .join(input.document.language.startsWith("zh") ? "" : " ")
    .slice(0, 240);
  const changed = diff.addedWordIds.length > 0
    || diff.restoredWordIds.length > 0
    || diff.removeSilenceChanged
    || diff.burnSubtitlesChanged;

  return {
    format: TRANSCRIPT_EDIT_FORMAT,
    operationId: sanitizeTranscriptOperationId(raw.operationId, input.fallbackOperationId),
    actor: sanitizeTranscriptEditActor(raw.actor),
    baseRevision,
    latestRevision: input.latestRevision,
    nextRevision: input.latestRevision + 1,
    conflict: baseRevision !== input.latestRevision,
    changed,
    plan,
    keepRanges,
    diff,
    summary: {
      originalDuration: roundSeconds(input.document.duration),
      outputDuration: roundSeconds(editedDuration),
      removedDuration: roundSeconds(Math.max(0, input.document.duration - editedDuration)),
      removedWordCount: plan.removedWordIds.length,
      removedRangeCount: removedRanges.length,
      removedSilenceRangeCount: plan.removeSilence ? input.document.silenceRanges.length : 0,
      subtitleCueCount: plan.burnSubtitles ? segmentsFromWords(remapKeptWords(input.document, keepRanges)).length : 0,
      removedTextPreview,
    },
  };
}
