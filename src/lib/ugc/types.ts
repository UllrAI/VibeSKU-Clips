/**
 * What a reference video does, in terms that survive replacing its presenter,
 * its product and every word it says.
 *
 * The one thing a clone must not copy is the reference's clock. A different
 * speaker and rewritten copy land on different seconds, so a blueprint records
 * what each event *responds to* rather than when it happened: the cut answers
 * a question, the close-up illustrates a claim, the overlay makes a comparison
 * readable. Source seconds are kept only so an operator can jump back and
 * check the reading.
 */
export const BLUEPRINT_FORMATS = [
  "talking_head",
  "street_interview",
  "ranking",
  "podcast",
  "demo",
  "skit",
] as const;
type BlueprintFormat = (typeof BLUEPRINT_FORMATS)[number];

export const BLUEPRINT_BEAT_ROLES = [
  "hook",
  "problem",
  "demo",
  "proof",
  "turn",
  "cta",
] as const;
type BlueprintBeatRole = (typeof BLUEPRINT_BEAT_ROLES)[number];

export const BLUEPRINT_EVENT_KINDS = [
  "b_roll",
  "product_closeup",
  "text_overlay",
  "cut",
  "reaction",
  "sfx",
] as const;
type BlueprintEventKind = (typeof BLUEPRINT_EVENT_KINDS)[number];

interface BlueprintEvent {
  kind: BlueprintEventKind;
  /** The spoken idea this event answers, in the reference's own terms. */
  respondsTo: string;
  /** What it does for the viewer, which is what the clone has to reproduce. */
  purpose: string;
}

interface BlueprintBeat {
  role: BlueprintBeatRole;
  purpose: string;
  /** Position in the reference, for jumping back — never for timing the clone. */
  sourceStart: number;
  sourceEnd: number;
  /** The gist of what was said. Deliberately not a transcript to copy. */
  spokenGist: string;
  events: BlueprintEvent[];
}

/** One archived still, with the moment in the reference it was taken from. */
export interface ReferenceFrameRecord {
  url: string;
  atMs: number;
}

export interface CloneBlueprint {
  format: BlueprintFormat;
  /** How the first seconds earn the next ones. */
  hook: string;
  whyItWorks: string;
  beats: BlueprintBeat[];
  /** Relationships that must survive a new person, product and script. */
  preserve: string[];
  /** Choices that belong to the original and have to be rethought. */
  redesign: string[];
}

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
  /** Order of the story, expressed for the writing model. */
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
