export interface ProductBrief {
  audience?: string;
  sellingPoints?: string[];
  tone?: string;
  scenes?: string;
  bannedPhrases?: string[];
  /** Copy the operator supplied verbatim. When present it must not be rewritten. */
  providedScript?: string;
}

export interface ProductFacts {
  summary: string;
  appearance: string;
  specs: string[];
  sellingPoints: string[];
  scenarios: string[];
  /** Where each fact came from, so the manifest can be audited later. */
  sources: string[];
  /** Set when the source material is incomplete or self-contradictory. */
  missing?: string[];
}

export interface ScriptBeat {
  /** Seconds from the start of the clip. */
  start: number;
  end: number;
  shot: string;
  action: string;
  voiceover: string;
}

export interface ScriptDraft {
  title: string;
  hook: string;
  beats: ScriptBeat[];
  voiceover: string;
  captions: string[];
  publishCaption: string;
  disclosure: string;
}

type QualityCheckId =
  | "duration"
  | "voiceoverLength"
  | "captionSafeArea"
  | "productAccuracy"
  | "talentConsistency"
  | "localeExpression";

export interface QualityCheck {
  id: QualityCheckId;
  passed: boolean;
  detail: string;
}

export interface ClipQualityReport {
  checks: QualityCheck[];
  passed: boolean;
}

export interface ExportManifestRow {
  reference: string;
  productName: string;
  variant: string | null;
  market: string;
  locale: string;
  publishCaption: string | null;
  videoUrl: string | null;
  coverUrl: string | null;
  subtitleUrl: string | null;
  disclosure: string | null;
}

export interface ExportManifest {
  generatedAt: string;
  groups: {
    key: string;
    label: string;
    rows: ExportManifestRow[];
  }[];
}

export interface ScriptTemplateBrief {
  /** How the 15 seconds are spent, expressed for the writing model. */
  structure: string;
  voice: string;
  /** Candidate opening angles; the single-clip flow uses the first one. */
  angles: string[];
  shots: string[];
}

export interface ActionResult {
  ok: boolean;
  /** Message code the UI resolves against its own catalogue. */
  code?: string;
  id?: string;
}
