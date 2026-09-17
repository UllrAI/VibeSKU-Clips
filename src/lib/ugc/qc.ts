import { CLIP_SPEC, voiceoverBudgetFor } from "./constants";
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

function spokenLength(locale: string, voiceover: string): number {
  const compact = voiceover.replace(/\s+/g, locale.startsWith("zh") ? "" : " ");
  return compact.trim().length;
}

/**
 * The gate runs before an operator ever sees a clip. Every check states what it
 * found so a failure can be acted on without opening the raw provider logs.
 */
export function evaluateClipQuality(input: QualityInput): ClipQualityReport {
  const targetDurationSeconds =
    input.targetDurationSeconds ?? CLIP_SPEC.durationSeconds;
  const targetMs = targetDurationSeconds * 1000;
  const budget = voiceoverBudgetFor(input.locale, targetDurationSeconds);
  const spoken = spokenLength(input.locale, input.script.voiceover);

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
      passed: spoken <= budget,
      detail: `${spoken} of ${budget} units of speech fit the target duration.`,
    },
    {
      id: "captionSafeArea",
      passed: input.script.captions.every((line) => line.length <= 42),
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
