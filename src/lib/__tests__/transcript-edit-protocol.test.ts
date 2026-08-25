import { describe, expect, it } from "vitest";
import {
  TRANSCRIPT_EDIT_FORMAT,
  createTranscriptEditProposal,
  sanitizeTranscriptOperationId,
} from "@/lib/transcript-edit-protocol";
import { DEFAULT_TRANSCRIPT_EDIT_PLAN, type TranscriptDocument } from "@/lib/transcript-editor";

const document: TranscriptDocument = {
  version: 1,
  text: "嗯 你好 世界",
  language: "zh",
  duration: 4,
  model: "local-test",
  device: "wasm",
  words: [
    { id: "w1", text: "嗯", start: 0.2, end: 0.4 },
    { id: "w2", text: "你好", start: 0.7, end: 1.2 },
    { id: "w3", text: "世界", start: 2.4, end: 3.1 },
  ],
  segments: [],
  silenceRanges: [{ start: 1.3, end: 2.2 }],
  createdAt: "2026-08-25T00:00:00.000Z",
};

describe("transcript edit protocol", () => {
  it("produces a revisioned dry-run diff and deterministic summary", () => {
    const proposal = createTranscriptEditProposal({
      document,
      value: {
        operationId: "agent-op-0001",
        actor: "agent",
        baseRevision: 2,
        plan: { ...DEFAULT_TRANSCRIPT_EDIT_PLAN, removedWordIds: ["w1", "missing"], removeSilence: true },
      },
      basePlan: { ...DEFAULT_TRANSCRIPT_EDIT_PLAN, removedWordIds: ["w3"] },
      latestRevision: 2,
      fallbackOperationId: "fallback-op-0001",
    });

    expect(proposal).toMatchObject({
      format: TRANSCRIPT_EDIT_FORMAT,
      operationId: "agent-op-0001",
      actor: "agent",
      baseRevision: 2,
      latestRevision: 2,
      nextRevision: 3,
      conflict: false,
      changed: true,
      diff: { addedWordIds: ["w1"], restoredWordIds: ["w3"], removeSilenceChanged: true },
      summary: { removedWordCount: 1, removedSilenceRangeCount: 1, removedTextPreview: "嗯" },
    });
    expect(proposal.summary.outputDuration).toBeLessThan(document.duration);
    expect(proposal.keepRanges.length).toBeGreaterThan(0);
  });

  it("reports stale base revisions without mutating the requested plan", () => {
    const proposal = createTranscriptEditProposal({
      document,
      value: { baseRevision: 1, plan: DEFAULT_TRANSCRIPT_EDIT_PLAN },
      latestRevision: 3,
      fallbackOperationId: "fallback-op-0002",
    });
    expect(proposal.conflict).toBe(true);
    expect(proposal.baseRevision).toBe(1);
    expect(proposal.latestRevision).toBe(3);
  });

  it("rejects unsafe operation ids by replacing them with the server fallback", () => {
    expect(sanitizeTranscriptOperationId("bad id", "server-op-0001")).toBe("server-op-0001");
    expect(sanitizeTranscriptOperationId("safe-op:0001", "server-op-0001")).toBe("safe-op:0001");
  });
});
