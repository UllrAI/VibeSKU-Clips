import { createHash } from "crypto";
import type { GenerationQualityReport, ShotQualityContract } from "@/lib/generation-quality";
import { getVideoModelCapabilities, type VideoModelCapabilities } from "@/lib/model-capabilities";
import { sanitizeVideoControlSummary, type VideoControlSummary } from "@/lib/video-control-plan";

export type RepairScope = "temporal" | "region";

export interface RepairWindow {
  start: number;
  end: number;
}

export interface RepairRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TimedKeyframe {
  assetId: string;
  time: number;
  role: "identity" | "product" | "composition" | "continuity";
}

export type VideoRepairWarning =
  | "capabilities-unknown"
  | "issue-time-unavailable"
  | "provider-native-window-unavailable"
  | "region-fallback-full-frame"
  | "ordered-keyframes-fallback"
  | "source-upload-unavailable"
  | "video-edit-unavailable"
  | "price-unknown";

export interface VideoRepairSummary {
  version: 1;
  kind: "repair";
  operationId: string;
  sourceAssetId: string;
  reviewId: string;
  shotId: number;
  provider: string;
  model: string;
  window: RepairWindow;
  requestedScope: RepairScope;
  effectiveScope: "full-frame" | "region";
  region?: RepairRegion;
  keyframes: TimedKeyframe[];
  strategy: "source-video-boundary-frames" | "boundary-frames";
  generatedDuration: number;
  estimatedCostUsd?: number;
  referenceCount: number;
  audioMode: "preserve-source";
  warnings: VideoRepairWarning[];
  planHash: string;
}

export type GenerationControlSummary = VideoControlSummary | VideoRepairSummary;

export interface VideoRepairPreview {
  summary: VideoRepairSummary;
  prompt: string;
  requestedRegion?: RepairRegion;
  keyframes: TimedKeyframe[];
  capabilities: VideoModelCapabilities;
  executable: boolean;
  estimatedCost: { currency: "USD"; min?: number; max?: number };
  estimatedSeconds: { min: number; max: number };
}

const ALLOWED_WARNINGS: VideoRepairWarning[] = [
  "capabilities-unknown",
  "issue-time-unavailable",
  "provider-native-window-unavailable",
  "region-fallback-full-frame",
  "ordered-keyframes-fallback",
  "source-upload-unavailable",
  "video-edit-unavailable",
  "price-unknown",
];

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}

function roundMillis(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, nested]) => [key, stableValue(nested)]));
}

export function repairPlanHash(value: Omit<VideoRepairSummary, "planHash">): string {
  return createHash("sha256").update(JSON.stringify(stableValue(value))).digest("hex");
}

/** Derive a bounded retake window around machine evidence; callers can override it before preview. */
export function deriveRepairWindow(
  duration: number,
  report: Pick<GenerationQualityReport, "issues">,
  requested?: Partial<RepairWindow>,
): { window: RepairWindow; hasTimedEvidence: boolean } {
  const safeDuration = Math.max(0.5, Number.isFinite(duration) ? duration : 5);
  const times = report.issues
    .map((issue) => Number(issue.time))
    .filter((time) => Number.isFinite(time) && time >= 0 && time <= safeDuration);
  const hasTimedEvidence = times.length > 0;
  const suggestedStart = hasTimedEvidence ? Math.max(0, Math.min(...times) - 0.75) : 0;
  const suggestedEnd = hasTimedEvidence ? Math.min(safeDuration, Math.max(...times) + 0.75) : Math.min(safeDuration, 5);
  let start = clamp(requested?.start, 0, Math.max(0, safeDuration - 0.5), suggestedStart);
  let end = clamp(requested?.end, 0.5, safeDuration, suggestedEnd);
  if (end - start < 0.5) {
    end = Math.min(safeDuration, start + 0.5);
    if (end - start < 0.5) start = Math.max(0, end - 0.5);
  }
  return { window: { start: roundMillis(start), end: roundMillis(end) }, hasTimedEvidence };
}

export function sanitizeRepairRegion(value: unknown): RepairRegion | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  const x = clamp(raw.x, 0, 1, 0);
  const y = clamp(raw.y, 0, 1, 0);
  const width = clamp(raw.width, 0.05, 1 - x, 1 - x);
  const height = clamp(raw.height, 0.05, 1 - y, 1 - y);
  return { x: roundMillis(x), y: roundMillis(y), width: roundMillis(width), height: roundMillis(height) };
}

export function sanitizeTimedKeyframes(value: unknown, duration: number): TimedKeyframe[] {
  if (!Array.isArray(value)) return [];
  const allowedRoles: TimedKeyframe["role"][] = ["identity", "product", "composition", "continuity"];
  const seen = new Set<string>();
  return value.flatMap((item): TimedKeyframe[] => {
    if (!item || typeof item !== "object") return [];
    const raw = item as Record<string, unknown>;
    if (typeof raw.assetId !== "string" || !/^[a-zA-Z0-9-]+$/.test(raw.assetId)) return [];
    if (!allowedRoles.includes(raw.role as TimedKeyframe["role"])) return [];
    const time = roundMillis(clamp(raw.time, 0, Math.max(0, duration), 0));
    const key = `${raw.assetId}:${time}:${raw.role}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ assetId: raw.assetId, time, role: raw.role as TimedKeyframe["role"] }];
  }).sort((a, b) => a.time - b.time).slice(0, 4);
}

function generatedDuration(repairDuration: number, values?: number[]): number {
  const requested = Math.max(1, repairDuration);
  const valid = unique((values ?? []).filter((value) => Number.isFinite(value) && value > 0)).sort((a, b) => a - b);
  if (!valid.length) return Math.max(2, Math.ceil(requested));
  return valid.find((value) => value >= requested) ?? valid[valid.length - 1];
}

function repairPrompt(contract: ShotQualityContract, report: GenerationQualityReport, window: RepairWindow, keyframes: TimedKeyframe[]): string {
  const issues = report.issues
    .filter((issue) => issue.time == null || (issue.time >= window.start - 0.25 && issue.time <= window.end + 0.25))
    .slice(0, 6)
    .map((issue) => `${issue.summary}${issue.suggestedFix ? `；修正：${issue.suggestedFix}` : ""}`);
  const timed = keyframes.map((item, index) => `@Image${index + 3} 在 ${item.time.toFixed(2)} 秒约束${item.role}`).join("；");
  return [
    `只重做原镜头 ${window.start.toFixed(2)}–${window.end.toFixed(2)} 秒对应的动作段，保持镜头前后构图、人物、商品、服装、光线和空间连续。`,
    `@Video1 是原镜头，仅用于保持主体、表演节奏和场景；@Image1 是修复窗起点，@Image2 是修复窗终点。`,
    contract.description ? `分镜目标：${contract.description}` : "",
    contract.camera ? `运镜：${contract.camera}` : "",
    issues.length ? `必须修正：${issues.join("；")}` : `必须更准确地满足原分镜目标，并避免新增文字、标识或主体。`,
    timed ? `额外时间锚点：${timed}。` : "",
    "输出连续、稳定、无跳变的单一镜头，不添加转场、字幕、水印或背景音乐。",
  ].filter(Boolean).join("\n");
}

export function buildVideoRepairPreview(input: {
  operationId: string;
  sourceAssetId: string;
  reviewId: string;
  shotId: number;
  provider: string;
  model: string;
  supportsAudio?: boolean;
  sourceDuration: number;
  report: GenerationQualityReport;
  contract: ShotQualityContract;
  requestedWindow?: Partial<RepairWindow>;
  requestedScope?: RepairScope;
  requestedRegion?: unknown;
  keyframes?: unknown;
  sourceUploadAvailable: boolean;
  pricePerCall?: number;
}): VideoRepairPreview {
  // Prism model ids are flat ("seedance2.0"), so there is no per-mode sibling endpoint to remap
  // onto — one id covers text, image and reference workflows and the body decides which runs.
  const effectiveModel = input.model;
  const capabilities = getVideoModelCapabilities(effectiveModel);
  const { window, hasTimedEvidence } = deriveRepairWindow(input.sourceDuration, input.report, input.requestedWindow);
  const requestedScope: RepairScope = input.requestedScope === "region" ? "region" : "temporal";
  const requestedRegion = requestedScope === "region" ? sanitizeRepairRegion(input.requestedRegion) : undefined;
  const keyframes = sanitizeTimedKeyframes(input.keyframes, input.sourceDuration);
  const warnings: VideoRepairWarning[] = [];
  if (capabilities.confidence === "unknown") warnings.push("capabilities-unknown");
  if (!hasTimedEvidence && input.requestedWindow?.start == null && input.requestedWindow?.end == null) warnings.push("issue-time-unavailable");
  if (capabilities.temporalRetake !== true) warnings.push("provider-native-window-unavailable");
  if (requestedScope === "region" && capabilities.regionMask !== true) warnings.push("region-fallback-full-frame");
  if (keyframes.length > 0 && capabilities.multiKeyframes !== true) warnings.push("ordered-keyframes-fallback");
  if (!input.sourceUploadAvailable) warnings.push("source-upload-unavailable");
  if (capabilities.referenceVideo === false) warnings.push("video-edit-unavailable");
  const price = Number(input.pricePerCall);
  if (!Number.isFinite(price) || price < 0) warnings.push("price-unknown");
  const repairSeconds = window.end - window.start;
  const billedDuration = generatedDuration(repairSeconds, capabilities.durationValues);
  const operationId = input.operationId.slice(0, 80);
  const withoutHash: Omit<VideoRepairSummary, "planHash"> = {
    version: 1,
    kind: "repair",
    operationId,
    sourceAssetId: input.sourceAssetId,
    reviewId: input.reviewId,
    shotId: Math.max(0, Math.round(input.shotId)),
    provider: input.provider.slice(0, 80),
    model: effectiveModel.slice(0, 240),
    window,
    requestedScope,
    effectiveScope: requestedScope === "region" && capabilities.regionMask === true ? "region" : "full-frame",
    ...(requestedRegion && { region: requestedRegion }),
    keyframes,
    strategy: capabilities.referenceVideo === false ? "boundary-frames" : "source-video-boundary-frames",
    generatedDuration: billedDuration,
    ...(Number.isFinite(price) && price >= 0 && { estimatedCostUsd: Math.round(price * 1_000_000) / 1_000_000 }),
    referenceCount: 2 + keyframes.length + (capabilities.referenceVideo === false ? 0 : 1),
    audioMode: "preserve-source",
    warnings: unique(warnings),
  };
  const summary: VideoRepairSummary = { ...withoutHash, planHash: repairPlanHash(withoutHash) };
  return {
    summary,
    prompt: repairPrompt(input.contract, input.report, window, keyframes),
    ...(requestedRegion && { requestedRegion }),
    keyframes,
    capabilities,
    executable: input.sourceUploadAvailable && capabilities.referenceVideo !== false,
    estimatedCost: Number.isFinite(price) && price >= 0 ? { currency: "USD", min: price, max: price } : { currency: "USD" },
    estimatedSeconds: { min: Math.max(45, Math.round(billedDuration * 10)), max: Math.max(180, Math.round(billedDuration * 40)) },
  };
}

export function sanitizeVideoRepairSummary(value: unknown): VideoRepairSummary | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (raw.version !== 1 || raw.kind !== "repair") return null;
  const id = (key: string, max = 240) => typeof raw[key] === "string" && /^[a-zA-Z0-9._:/-]+$/.test(raw[key] as string)
    ? (raw[key] as string).slice(0, max)
    : "";
  const operationId = id("operationId", 80);
  const sourceAssetId = id("sourceAssetId", 80);
  const reviewId = id("reviewId", 80);
  const provider = id("provider", 80);
  const model = id("model");
  if (!operationId || !sourceAssetId || !reviewId || !provider || !model) return null;
  const windowRaw = raw.window && typeof raw.window === "object" ? raw.window as Record<string, unknown> : {};
  const start = clamp(windowRaw.start, 0, 86_400, -1);
  const end = clamp(windowRaw.end, 0, 86_400, -1);
  if (start < 0 || end <= start) return null;
  const requestedScope = raw.requestedScope === "region" ? "region" : raw.requestedScope === "temporal" ? "temporal" : null;
  const effectiveScope = raw.effectiveScope === "region" ? "region" : raw.effectiveScope === "full-frame" ? "full-frame" : null;
  const strategy = raw.strategy === "source-video-boundary-frames" ? raw.strategy : raw.strategy === "boundary-frames" ? raw.strategy : null;
  if (!requestedScope || !effectiveScope || !strategy || raw.audioMode !== "preserve-source") return null;
  const warnings = Array.isArray(raw.warnings)
    ? unique(raw.warnings.filter((item): item is VideoRepairWarning => typeof item === "string" && ALLOWED_WARNINGS.includes(item as VideoRepairWarning)))
    : [];
  const withoutHash: Omit<VideoRepairSummary, "planHash"> = {
    version: 1,
    kind: "repair",
    operationId,
    sourceAssetId,
    reviewId,
    shotId: Math.max(0, Math.round(Number(raw.shotId) || 0)),
    provider,
    model,
    window: { start: roundMillis(start), end: roundMillis(end) },
    requestedScope,
    effectiveScope,
    ...(sanitizeRepairRegion(raw.region) && { region: sanitizeRepairRegion(raw.region) }),
    keyframes: sanitizeTimedKeyframes(raw.keyframes, 86_400),
    strategy,
    generatedDuration: clamp(raw.generatedDuration, 0.5, 120, end - start),
    ...(Number.isFinite(Number(raw.estimatedCostUsd)) && Number(raw.estimatedCostUsd) >= 0 && {
      estimatedCostUsd: Math.round(Number(raw.estimatedCostUsd) * 1_000_000) / 1_000_000,
    }),
    referenceCount: Math.max(0, Math.min(32, Math.round(Number(raw.referenceCount) || 0))),
    audioMode: "preserve-source",
    warnings,
  };
  const expected = repairPlanHash(withoutHash);
  return raw.planHash === expected ? { ...withoutHash, planHash: expected } : null;
}

export function sanitizeGenerationControlSummary(value: unknown): GenerationControlSummary | null {
  return sanitizeVideoRepairSummary(value) ?? sanitizeVideoControlSummary(value);
}
