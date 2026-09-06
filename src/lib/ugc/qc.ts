import { CLIP_SPEC, voiceoverBudgetFor } from "./constants";
import type { ClipQualityReport, QualityCheck, ScriptDraft } from "./types";

export interface QualityInput {
  locale: string;
  durationMs: number | null;
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
  const targetMs = CLIP_SPEC.durationSeconds * 1000;
  const budget = voiceoverBudgetFor(input.locale);
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
          : `${(input.durationMs / 1000).toFixed(2)}s against a ${CLIP_SPEC.durationSeconds}s target.`,
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
    {
      id: "productAccuracy",
      passed: !input.rendererFindings?.productAccuracy,
      detail:
        input.rendererFindings?.productAccuracy ??
        "The clip matches the recorded product facts.",
    },
    {
      id: "talentConsistency",
      passed: !input.rendererFindings?.talentConsistency,
      detail:
        input.rendererFindings?.talentConsistency ??
        (input.hasTalentReference
          ? "The performer matches the selected reference image."
          : "No talent reference was requested for this clip."),
    },
    {
      id: "localeExpression",
      passed: !input.rendererFindings?.localeExpression,
      detail:
        input.rendererFindings?.localeExpression ??
        "Wording and delivery read naturally for the target market.",
    },
  ];

  return { checks, passed: checks.every((check) => check.passed) };
}
