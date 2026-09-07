export interface ProductBrief {
  audience?: string;
  sellingPoints?: string[];
  tone?: string;
  scenes?: string;
  bannedPhrases?: string[];
  /** Operator-supplied script or production direction for the writer to honour. */
  providedScript?: string;
}

export interface ProductFacts {
  summary: string;
  appearance: string;
  specs: string[];
  sellingPoints: string[];
  scenarios: string[];
  /** Where each fact came from, so the product analysis stays traceable. */
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
  /** Phone/camera movement and focus behaviour for this beat. */
  camera?: string;
  voiceover: string;
}

export interface ScriptDraft {
  title: string;
  hook: string;
  /** Complete director-level prompt shared by storyboard and video generation. */
  productionPrompt: string;
  beats: ScriptBeat[];
  voiceover: string;
  captions: string[];
  publishCaption: string;
  disclosure: string;
}

/** Fields a person may revise before accepting a render. */
export interface EditableScript {
  title: string;
  hook: string;
  productionPrompt: string;
  beats: ScriptBeat[];
  captions: string;
  publishCaption?: string;
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
