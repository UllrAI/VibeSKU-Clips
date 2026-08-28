import type { Shot } from "@/lib/db/schema";
import type { CreativeIntent, VisualBible } from "@/lib/production-system";
import { extractJSON } from "@/lib/script-engine/generator";

export const QUALITY_DIMENSION_IDS = [
  "visual-fidelity",
  "temporal-coherence",
  "shot-alignment",
  "subject-fidelity",
  "action-binding",
  "continuity",
  "text-integrity",
] as const;

export type QualityDimensionId = typeof QUALITY_DIMENSION_IDS[number];
export type QualityVerdict = "accept" | "review" | "reject";
export type QualityActionId = "accept" | "manual-review" | "post-fix" | "regenerate" | "switch-model";

export interface ShotQualityDimension {
  id: QualityDimensionId;
  weight: number;
  required: boolean;
  criteria: string[];
}

export interface ShotQualityContract {
  version: 1;
  shotId: number;
  shotType: Shot["type"];
  mediaType: "image" | "video";
  targetDuration: number;
  description: string;
  prompt: string;
  camera: string;
  voiceover: string;
  anchors: {
    character: string[];
    product: string[];
    wardrobe: string[];
    environment: string[];
    lighting: string[];
    forbiddenChanges: string[];
  };
  referenceRoles: Array<"generated-output" | "source-keyframe" | "product-reference" | "character-reference" | "previous-shot-tail">;
  dimensions: ShotQualityDimension[];
}

export interface QualityEvidence {
  time?: number;
  observation: string;
  severity: "positive" | "warning" | "critical";
}

export interface QualityDimensionScore {
  id: QualityDimensionId;
  score: number;
  confidence: number;
  summary: string;
  evidence: QualityEvidence[];
}

export interface QualityIssue {
  code: string;
  dimension: QualityDimensionId;
  severity: "warning" | "critical";
  summary: string;
  suggestedFix: string;
  time?: number;
}

export interface GenerationQualityReport {
  version: 1;
  summary: string;
  overall: number;
  confidence: number;
  verdict: QualityVerdict;
  dimensions: QualityDimensionScore[];
  issues: QualityIssue[];
  evaluatedAt: string;
}

export interface QualityDisposition {
  action: QualityActionId;
  paid: boolean;
  automatic: false;
  reason: string;
}

const clean = (value: unknown, max = 500): string => typeof value === "string" ? value.trim().slice(0, max) : "";
const unique = (values: Array<string | undefined>, max = 12): string[] => [...new Set(values.map((value) => clean(value, 160)).filter(Boolean))].slice(0, max);
const clamp = (value: unknown, min: number, max: number, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
};

function normalizedDimensions(rows: Array<Omit<ShotQualityDimension, "weight"> & { weight: number }>): ShotQualityDimension[] {
  const total = rows.reduce((sum, row) => sum + row.weight, 0) || 1;
  let assigned = 0;
  return rows.map((row, index) => {
    const weight = index === rows.length - 1 ? 100 - assigned : Math.round((row.weight / total) * 100);
    assigned += weight;
    return { ...row, weight };
  });
}

/** Compile one script shot and the project memory into a provider-neutral, inspectable quality contract. */
export function buildShotQualityContract(input: {
  shot: Shot;
  mediaType: "image" | "video";
  intent?: CreativeIntent | null;
  bible?: VisualBible | null;
  hasProductReference?: boolean;
  hasCharacterReference?: boolean;
  hasPreviousReference?: boolean;
  hasSourceKeyframe?: boolean;
}): ShotQualityContract {
  const { shot } = input;
  const intent = input.intent ?? { subject: "" };
  const bible = input.bible ?? {
    characterAnchors: [], productAnchors: [], wardrobeAnchors: [], environmentAnchors: [], lightingAnchors: [], forbiddenChanges: [],
  };
  const productCritical = ["product_reveal", "demo", "cta"].includes(shot.type) || bible.productAnchors.length > 0;
  const characterCritical = Boolean(shot.characterId || input.hasCharacterReference || bible.characterAnchors.length);
  const visibleText = clean(shot.textOverlay?.text);
  const actionCriteria = unique([intent.action, shot.description, shot.voiceover && `Visible action must support: ${shot.voiceover}`]);
  const continuityCriteria = unique([
    ...bible.environmentAnchors,
    ...bible.lightingAnchors,
    ...(intent.continuity ?? []),
    input.hasPreviousReference ? "Opening state should continue naturally from the accepted previous-shot tail" : undefined,
  ]);
  const rows: Array<Omit<ShotQualityDimension, "weight"> & { weight: number }> = [
    { id: "visual-fidelity", weight: 18, required: true, criteria: unique(["Clear, coherent commercial imagery without anatomy, geometry, texture, flicker or compression artifacts"]) },
    ...(input.mediaType === "video" ? [{ id: "temporal-coherence" as const, weight: 18, required: true, criteria: unique(["Stable subjects and background across time", `Smooth, intentional motion for camera direction: ${shot.camera}`]) }] : []),
    { id: "shot-alignment", weight: 24, required: true, criteria: unique([shot.description, shot.prompt, intent.subject, intent.environment]) },
    { id: "subject-fidelity", weight: productCritical || characterCritical ? 20 : 10, required: productCritical || characterCritical, criteria: unique([
      ...bible.characterAnchors,
      ...bible.productAnchors,
      ...bible.wardrobeAnchors,
      ...(intent.productConstraints ?? []),
      productCritical ? "The product described in the shot must keep a stable shape, color and presentation" : undefined,
      characterCritical ? "The main character described in the shot must keep a stable identity and appearance" : undefined,
      input.hasProductReference ? "Product shape, color, packaging and visible branding must match the product reference" : undefined,
      input.hasCharacterReference ? "Face, hair, build and outfit must match the character reference without identity drift" : undefined,
    ]) },
    { id: "action-binding", weight: actionCriteria.length ? 14 : 8, required: Boolean(intent.action || shot.type === "demo"), criteria: actionCriteria },
    { id: "continuity", weight: continuityCriteria.length ? 12 : 6, required: Boolean(input.hasPreviousReference), criteria: continuityCriteria },
    { id: "text-integrity", weight: visibleText || productCritical ? 10 : 4, required: Boolean(visibleText), criteria: unique([
      visibleText ? `On-screen text must read exactly: ${visibleText}` : undefined,
      productCritical ? "Do not invent, deform or replace visible product labels, logos or packaging text" : undefined,
    ]) },
  ];

  return {
    version: 1,
    shotId: shot.shotId,
    shotType: shot.type,
    mediaType: input.mediaType,
    targetDuration: clamp(shot.duration, 0.1, 120, 5),
    description: clean(shot.description, 800),
    prompt: clean(shot.prompt, 1600),
    camera: clean(shot.camera, 400),
    voiceover: clean(shot.voiceover, 800),
    anchors: {
      character: unique(bible.characterAnchors),
      product: unique([...(bible.productAnchors ?? []), ...(intent.productConstraints ?? [])]),
      wardrobe: unique(bible.wardrobeAnchors),
      environment: unique([...(bible.environmentAnchors ?? []), intent.environment]),
      lighting: unique([...(bible.lightingAnchors ?? []), intent.lighting]),
      forbiddenChanges: unique([...(bible.forbiddenChanges ?? []), ...(intent.negative ?? [])]),
    },
    referenceRoles: [
      "generated-output",
      ...(input.hasSourceKeyframe ? ["source-keyframe" as const] : []),
      ...(input.hasProductReference ? ["product-reference" as const] : []),
      ...(input.hasCharacterReference ? ["character-reference" as const] : []),
      ...(input.hasPreviousReference ? ["previous-shot-tail" as const] : []),
    ],
    dimensions: normalizedDimensions(rows),
  };
}

function knownDimension(value: unknown): value is QualityDimensionId {
  return typeof value === "string" && (QUALITY_DIMENSION_IDS as readonly string[]).includes(value);
}

function parseEvidence(value: unknown): QualityEvidence[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): QualityEvidence[] => {
    if (!item || typeof item !== "object") return [];
    const raw = item as Record<string, unknown>;
    const observation = clean(raw.observation, 500);
    if (!observation) return [];
    const severity = raw.severity === "critical" || raw.severity === "warning" ? raw.severity : "positive";
    const time = clamp(raw.time, 0, 86_400, -1);
    return [{ observation, severity, ...(time >= 0 && { time: Math.round(time * 100) / 100 }) }];
  }).slice(0, 8);
}

/** Parse an untrusted visual-model response and recompute the weighted score from the contract. */
export function parseGenerationQuality(raw: string, contract: ShotQualityContract, now = new Date()): GenerationQualityReport {
  const parsed = JSON.parse(extractJSON(raw)) as Record<string, unknown>;
  const supplied = new Map<QualityDimensionId, QualityDimensionScore>();
  if (Array.isArray(parsed.dimensions)) {
    for (const item of parsed.dimensions) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      if (!knownDimension(row.id) || !contract.dimensions.some((dimension) => dimension.id === row.id)) continue;
      supplied.set(row.id, {
        id: row.id,
        score: Math.round(clamp(row.score, 0, 100, 50)),
        confidence: Math.round(clamp(row.confidence, 0, 1, 0.35) * 100) / 100,
        summary: clean(row.summary, 500),
        evidence: parseEvidence(row.evidence),
      });
    }
  }
  const dimensions = contract.dimensions.map((dimension): QualityDimensionScore => supplied.get(dimension.id) ?? {
    id: dimension.id,
    score: 50,
    confidence: 0.2,
    summary: "Not reliably assessed",
    evidence: [],
  });
  const issues: QualityIssue[] = Array.isArray(parsed.issues) ? parsed.issues.flatMap((item): QualityIssue[] => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    if (!knownDimension(row.dimension) || !contract.dimensions.some((dimension) => dimension.id === row.dimension)) return [];
    const summary = clean(row.summary, 500);
    if (!summary) return [];
    const time = clamp(row.time, 0, 86_400, -1);
    return [{
      code: clean(row.code, 80) || `${row.dimension}-issue`,
      dimension: row.dimension,
      severity: row.severity === "critical" ? "critical" : "warning",
      summary,
      suggestedFix: clean(row.suggestedFix, 500),
      ...(time >= 0 && { time: Math.round(time * 100) / 100 }),
    }];
  }).slice(0, 16) : [];
  const overall = Math.round(dimensions.reduce((sum, dimension) => {
    const weight = contract.dimensions.find((item) => item.id === dimension.id)?.weight ?? 0;
    return sum + dimension.score * weight / 100;
  }, 0));
  const confidence = Math.round(dimensions.reduce((sum, dimension) => {
    const weight = contract.dimensions.find((item) => item.id === dimension.id)?.weight ?? 0;
    return sum + dimension.confidence * weight / 100;
  }, 0) * 100) / 100;
  const requiredLow = dimensions.some((dimension) => contract.dimensions.find((item) => item.id === dimension.id)?.required && dimension.score < 60);
  const critical = issues.some((issue) => issue.severity === "critical");
  const verdict: QualityVerdict = critical || requiredLow || overall < 65
    ? "reject"
    : overall >= 82 && confidence >= 0.55 && dimensions.every((dimension) => !contract.dimensions.find((item) => item.id === dimension.id)?.required || dimension.score >= 70)
      ? "accept"
      : "review";
  return {
    version: 1,
    summary: clean(parsed.summary, 800),
    overall,
    confidence,
    verdict,
    dimensions,
    issues,
    evaluatedAt: now.toISOString(),
  };
}

/** Turn the report into one reviewable next step. No action is ever automatic. */
export function qualityDisposition(report: GenerationQualityReport, input: { priorRejectsForModel?: number } = {}): QualityDisposition {
  if (report.verdict === "accept") return { action: "accept", paid: false, automatic: false, reason: "All required quality dimensions cleared the acceptance threshold" };
  if (report.verdict === "review") return { action: "manual-review", paid: false, automatic: false, reason: "The result is usable but at least one dimension or confidence level needs a human decision" };
  const criticalDimensions = new Set(report.issues.filter((issue) => issue.severity === "critical").map((issue) => issue.dimension));
  const weak = [...report.dimensions].sort((a, b) => a.score - b.score)[0]?.id;
  if ((input.priorRejectsForModel ?? 0) >= 2) return { action: "switch-model", paid: true, automatic: false, reason: "This model has repeatedly failed the shot contract; route the confirmed retry to a better-matched model" };
  if (criticalDimensions.size === 1 && criticalDimensions.has("text-integrity") && report.overall >= 65) {
    return { action: "post-fix", paid: false, automatic: false, reason: "The visible problem is isolated to text or branding and may be repaired without regenerating the whole shot" };
  }
  return { action: "regenerate", paid: true, automatic: false, reason: `The ${weak ?? "required"} dimension failed; revise constraints or references before a confirmed retry` };
}

export function rankQualityCandidates<T extends { id: string; report?: GenerationQualityReport | null; selected?: boolean }>(candidates: T[]): T[] {
  const verdictRank: Record<QualityVerdict, number> = { accept: 3, review: 2, reject: 1 };
  return [...candidates].sort((a, b) => {
    const aReport = a.report;
    const bReport = b.report;
    if (aReport && bReport) return verdictRank[bReport.verdict] - verdictRank[aReport.verdict] || bReport.overall - aReport.overall || bReport.confidence - aReport.confidence;
    if (aReport) return -1;
    if (bReport) return 1;
    if (a.selected !== b.selected) return a.selected ? -1 : 1;
    return a.id.localeCompare(b.id);
  });
}

/** Prompt for a scene-aware contact sheet. The server appends the output first, then references in declared order. */
export function buildQualityEvaluationPrompt(contract: ShotQualityContract, locale: "zh" | "en", sampleContext?: string): string {
  const language = locale === "en" ? "English" : "简体中文";
  return `You are a strict commercial-video quality reviewer. Image 1 is the generated ${contract.mediaType === "video" ? "video contact sheet" : "image"}. Any following images are references in this order: ${contract.referenceRoles.slice(1).join(", ") || "none"}.
Judge only visible evidence. Do not identify real people. Compare appearance without naming anyone. Treat the requested shot contract as authoritative and return ONLY one JSON object with all prose in ${language}.
${sampleContext ? `Sampling context: ${sampleContext}` : ""}
Shot contract JSON:
${JSON.stringify(contract)}
Required JSON schema:
{
  "summary": "one concise verdict",
  "dimensions": [{"id":"one exact contract dimension id","score":0,"confidence":0.0,"summary":"why","evidence":[{"time":0.0,"observation":"visible evidence","severity":"positive|warning|critical"}]}],
  "issues": [{"code":"stable-kebab-code","dimension":"one exact contract dimension id","severity":"warning|critical","summary":"what is visibly wrong","suggestedFix":"specific minimal fix","time":0.0}]
}
Return every dimension from the contract exactly once. Scores are 0–100 and confidence is 0–1. For an image omit time. A critical issue means the asset must not be silently accepted.`;
}
