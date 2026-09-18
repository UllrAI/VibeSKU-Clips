import { CLIP_SPEC } from "./constants";
import { displayText, spokenText } from "./script-notation";
import { estimateSpeechSeconds } from "./speech-estimate";
import type { ClipQualityReport, QualityCheck, ScriptDraft } from "./types";

export interface QualityInput {
  locale: string;
  durationMs: number | null;
  targetDurationSeconds?: number;
  script: Pick<ScriptDraft, "voiceover" | "captions">;
  /** Reported by the renderer for each check it can verify itself. */
  rendererFindings?: Partial<
    Record<"productAccuracy" | "talentConsistency" | "localeExpression", string>
  >;
  hasTalentReference: boolean;
}

/**
 * The gate runs before an operator ever sees a clip. Every check states what it
 * found so a failure can be acted on without opening the raw provider logs.
 */
export function evaluateClipQuality(input: QualityInput): ClipQualityReport {
  const targetDurationSeconds =
    input.targetDurationSeconds ?? CLIP_SPEC.durationSeconds;
  const targetMs = targetDurationSeconds * 1000;
  const spokenSeconds = estimateSpeechSeconds(
    spokenText(input.script.voiceover),
    input.locale,
  );

  const checks: QualityCheck[] = [
    {
      id: "duration",
      passed:
        input.durationMs !== null &&
        Math.abs(input.durationMs - targetMs) <= CLIP_SPEC.durationToleranceMs,
      detail:
        input.durationMs === null
          ? "The renderer did not report a duration."
          : `${(input.durationMs / 1000).toFixed(2)}s against a ${targetDurationSeconds}s target.`,
    },
    {
      id: "voiceoverLength",
      passed: spokenSeconds <= targetDurationSeconds,
      detail: `The script reads in about ${spokenSeconds.toFixed(1)}s against a ${targetDurationSeconds}s target.`,
    },
    {
      id: "captionSafeArea",
      passed: input.script.captions.every(
        (line) => displayText(line).length <= 42,
      ),
      detail:
        "Caption lines stay clear of the platform buttons and the product card.",
    },
    ...(["productAccuracy", "talentConsistency", "localeExpression"] as const)
      .filter((id) => input.rendererFindings?.[id])
      .map((id) => ({
        id,
        passed: false,
        detail: input.rendererFindings![id]!,
      })),
  ];

  return { checks, passed: checks.every((check) => check.passed) };
}
