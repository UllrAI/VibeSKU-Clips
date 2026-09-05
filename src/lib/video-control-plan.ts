import { getVideoModelCapabilities } from "@/lib/model-capabilities";

export const VIDEO_REFERENCE_ROLES = [
  "keyframe",
  "end-frame",
  "character",
  "product",
  "continuity",
  "motion",
  "audio",
] as const;

export type VideoReferenceRole = typeof VIDEO_REFERENCE_ROLES[number];
export type VideoReferenceMediaType = "image" | "video" | "audio";
export type VideoControlWarning =
  | "reference-pack-unsupported"
  | "reference-video-unsupported"
  | "reference-audio-unsupported"
  | "end-frame-unsupported";

export interface VideoReferenceInput {
  url: string;
  role: VideoReferenceRole;
  mediaType: VideoReferenceMediaType;
  required: boolean;
}

export interface VideoControlSummary {
  version: 1;
  strategy: "keyframe" | "reference-pack";
  mode: "image-to-video" | "video-to-video";
  referenceRoles: VideoReferenceRole[];
  referenceCount: number;
  audioMode: "native" | "post" | "none";
  voiceoverBound: boolean;
  warnings: VideoControlWarning[];
}

export interface VideoControlPlan extends VideoControlSummary {
  firstFrameUrl?: string;
  lastFrameUrl?: string;
  referenceInputs: VideoReferenceInput[];
  promptSuffix: string;
  audioPrompt?: string;
}

const isNonEmpty = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const unique = <T,>(values: T[]): T[] => [...new Set(values)];

function referenceInstruction(items: VideoReferenceInput[], locale: "zh" | "en", imageOffset = 0): string {
  if (!items.length) return "";
  let image = imageOffset;
  let video = 0;
  let audio = 0;
  const labels = items.map((item) => {
    const n = item.mediaType === "image" ? ++image : item.mediaType === "video" ? ++video : ++audio;
    const token = item.mediaType === "image" ? `@Image${n}` : item.mediaType === "video" ? `@Video${n}` : `@Audio${n}`;
    const role = locale === "zh"
      ? ({ keyframe: "构图关键帧", "end-frame": "目标尾帧", character: "人物身份", product: "商品外观", continuity: "上一镜连续性", motion: "动作与表演", audio: "声音与音色" } as const)[item.role]
      : ({ keyframe: "shot composition", "end-frame": "target ending", character: "character identity", product: "product appearance", continuity: "previous-shot continuity", motion: "motion and performance", audio: "voice and sound" } as const)[item.role];
    return `${token}=${role}`;
  });
  return locale === "zh"
    ? `参考映射：${labels.join("；")}。每份参考只用于对应职责，不要把定妆照背景或参考视频构图复制进成片；人物、商品和空间状态需跨全镜稳定。`
    : `Reference map: ${labels.join("; ")}. Use each reference only for its declared role; do not copy a character-sheet background or reference-video framing into the result. Keep character, product, and spatial state stable throughout.`;
}

function nativeAudioInstruction(input: { voiceover?: string; description?: string; speakerVisible?: boolean; locale: "zh" | "en" }): string {
  const voiceover = input.voiceover?.trim();
  if (voiceover) {
    if (!input.speakerVisible) {
      return input.locale === "zh"
        ? `音频方向：旁白只自然说一遍「${voiceover}」；保留符合场景的环境声与物体交互声，不要额外说词，不要生成背景音乐。`
        : `Audio direction: the voice-over says exactly once, “${voiceover}”. Add natural location and object sounds, no extra spoken words, and no background music.`;
    }
    return input.locale === "zh"
      ? `音频方向：画面中的说话人只自然说一遍「${voiceover}」，口型、情绪和动作严格同步；保留符合场景的环境声与物体交互声，不要额外说词，不要生成背景音乐。`
      : `Audio direction: the visible speaker says exactly once, “${voiceover}”. Keep lips, emotion, and body action synchronized; add natural location and object sounds, no extra spoken words, and no background music.`;
  }
  const scene = input.description?.trim();
  return input.locale === "zh"
    ? `音频方向：生成与${scene ? `“${scene}”` : "画面动作"}同步的自然环境声和物体交互声；不要说话，不要生成背景音乐。`
    : `Audio direction: generate natural location and object sounds synchronized with ${scene ? `“${scene}”` : "the visible action"}; no speech and no background music.`;
}

/**
 * Compile all available shot conditions into the strongest request the chosen model can accept.
 *
 * Everything the model cannot take is dropped BEFORE the paid request and recorded as an explicit
 * degradation warning, so a shot never quietly loses its identity anchor and never dies on a 422.
 * Decisions come from the model's catalog entry alone — this used to branch on vendor names, and
 * those branches went stale the moment the app moved to a single gateway.
 */
export function buildVideoControlPlan(input: {
  modelId: string;
  firstFrameUrl?: string;
  lastFrameUrl?: string;
  characterReferenceUrl?: string;
  productReferenceUrl?: string;
  continuityReferenceUrl?: string;
  motionReferenceUrl?: string;
  audioReferenceUrl?: string;
  voiceover?: string;
  speakerVisible?: boolean;
  description?: string;
  locale: "zh" | "en";
}): VideoControlPlan {
  const capabilities = getVideoModelCapabilities(input.modelId);
  const optional: VideoReferenceInput[] = [
    ...(isNonEmpty(input.characterReferenceUrl) ? [{ url: input.characterReferenceUrl, role: "character" as const, mediaType: "image" as const, required: true }] : []),
    ...(isNonEmpty(input.productReferenceUrl) ? [{ url: input.productReferenceUrl, role: "product" as const, mediaType: "image" as const, required: true }] : []),
    ...(isNonEmpty(input.continuityReferenceUrl) && input.continuityReferenceUrl !== input.firstFrameUrl
      ? [{ url: input.continuityReferenceUrl, role: "continuity" as const, mediaType: "image" as const, required: false }]
      : []),
    ...(isNonEmpty(input.motionReferenceUrl) ? [{ url: input.motionReferenceUrl, role: "motion" as const, mediaType: "video" as const, required: false }] : []),
    ...(isNonEmpty(input.audioReferenceUrl) ? [{ url: input.audioReferenceUrl, role: "audio" as const, mediaType: "audio" as const, required: false }] : []),
  ];
  const warnings: VideoControlWarning[] = [];
  const has = (type: VideoReferenceMediaType) => optional.some((item) => item.mediaType === type);
  const accepts: Record<VideoReferenceMediaType, boolean> = {
    image: capabilities.referenceImages,
    video: capabilities.referenceVideo,
    audio: capabilities.referenceAudio,
  };

  // References travel alongside the keyframes rather than replacing them: Prism's request body
  // carries `reference_images` and `first_frame_url`/`last_frame_url` as separate fields, so an
  // identity sheet no longer costs the shot its composition anchor (it used to, back when one
  // vendor could only accept one or the other).
  for (const type of ["image", "video", "audio"] as const) {
    if (!has(type) || accepts[type]) continue;
    warnings.push(
      type === "image" ? "reference-pack-unsupported" : type === "video" ? "reference-video-unsupported" : "reference-audio-unsupported"
    );
  }
  if (isNonEmpty(input.lastFrameUrl) && !capabilities.lastFrame) warnings.push("end-frame-unsupported");

  let referenceInputs: VideoReferenceInput[] = optional.filter((item) => accepts[item.mediaType]);

  // Prevent duplicated URLs from consuming provider reference quotas while preserving role order.
  const seen = new Set<string>();
  referenceInputs = referenceInputs.filter((item) => {
    const key = `${item.mediaType}:${item.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const nativeAudio = capabilities.nativeAudio;
  const voiceoverBound = nativeAudio && isNonEmpty(input.voiceover);
  const audioMode: VideoControlSummary["audioMode"] = nativeAudio ? "native" : isNonEmpty(input.voiceover) ? "post" : "none";
  const audioPrompt = nativeAudio ? nativeAudioInstruction(input) : undefined;

  const firstFrameUrl = isNonEmpty(input.firstFrameUrl) ? input.firstFrameUrl : undefined;
  const lastFrameUrl = isNonEmpty(input.lastFrameUrl) && capabilities.lastFrame ? input.lastFrameUrl : undefined;
  // The keyframes occupy @Image1..N, so the reference map numbering starts after them.
  const frameImageCount = Number(Boolean(firstFrameUrl)) + Number(Boolean(lastFrameUrl));
  const promptSuffix = [referenceInstruction(referenceInputs, input.locale, frameImageCount), audioPrompt]
    .filter(Boolean)
    .join(input.locale === "zh" ? "。" : " ");

  const visualPack = referenceInputs.some((item) => item.mediaType !== "audio");
  const referenceRoles = unique([
    ...(firstFrameUrl ? ["keyframe" as const] : []),
    ...(lastFrameUrl ? ["end-frame" as const] : []),
    ...referenceInputs.map((item) => item.role),
  ]);

  return {
    version: 1,
    strategy: visualPack ? "reference-pack" : "keyframe",
    // A reference VIDEO is what actually changes the request's nature; still images do not.
    mode: referenceInputs.some((item) => item.mediaType === "video") ? "video-to-video" : "image-to-video",
    referenceRoles,
    referenceCount: referenceInputs.length + frameImageCount,
    audioMode,
    voiceoverBound,
    warnings: unique(warnings),
    ...(firstFrameUrl && { firstFrameUrl }),
    ...(lastFrameUrl && { lastFrameUrl }),
    referenceInputs,
    promptSuffix,
    ...(audioPrompt && { audioPrompt }),
  };
}

/** Keep only a compact, non-sensitive summary before persisting client input. */
export function sanitizeVideoControlSummary(value: unknown): VideoControlSummary | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const strategy = raw.strategy === "reference-pack" ? "reference-pack" : raw.strategy === "keyframe" ? "keyframe" : null;
  const mode = raw.mode === "video-to-video" ? "video-to-video" : raw.mode === "image-to-video" ? "image-to-video" : null;
  const audioMode = raw.audioMode === "native" || raw.audioMode === "post" || raw.audioMode === "none" ? raw.audioMode : null;
  if (raw.version !== 1 || !strategy || !mode || !audioMode) return null;
  const roles = Array.isArray(raw.referenceRoles)
    ? unique(raw.referenceRoles.filter((role): role is VideoReferenceRole => typeof role === "string" && (VIDEO_REFERENCE_ROLES as readonly string[]).includes(role))).slice(0, VIDEO_REFERENCE_ROLES.length)
    : [];
  const allowedWarnings: VideoControlWarning[] = [
    "reference-pack-unsupported",
    "reference-video-unsupported",
    "reference-audio-unsupported",
    "end-frame-unsupported",
  ];
  const warnings = Array.isArray(raw.warnings)
    ? unique(raw.warnings.filter((warning): warning is VideoControlWarning => typeof warning === "string" && allowedWarnings.includes(warning as VideoControlWarning))).slice(0, allowedWarnings.length)
    : [];
  return {
    version: 1,
    strategy,
    mode,
    referenceRoles: roles,
    referenceCount: Math.max(0, Math.min(32, Math.round(Number(raw.referenceCount) || 0))),
    audioMode,
    voiceoverBound: raw.voiceoverBound === true,
    warnings,
  };
}
