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
  | "reference-pack-deferred-for-end-frame"
  | "reference-audio-unsupported";

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
 * Compile all available shot conditions into the strongest request that the selected
 * provider/model family can safely accept. Unsupported inputs are omitted before the
 * paid request and recorded as explicit degradation warnings.
 */
export function buildVideoControlPlan(input: {
  provider: string;
  modelId: string;
  supportsAudio?: boolean;
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
  const capabilities = getVideoModelCapabilities(input.modelId, input.supportsAudio, input.provider);
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
  const hasVisualPack = optional.some((item) => item.mediaType !== "audio");
  const hasIdentityPack = optional.some((item) => item.mediaType === "image" && item.required);
  const canUseVisualPack = capabilities.referenceImages === true;
  const canUseAudioReference = capabilities.referenceAudio === true;
  // Identity/product fidelity wins over a hard end-frame on Atlas: reference mode can still
  // carry that end frame as a target anchor, while plain continuity-only requests retain the
  // provider's stronger native start/end-frame contract.
  const isAtlasReferenceMode = input.provider === "atlas-cloud" && hasVisualPack && canUseVisualPack && (!input.lastFrameUrl || hasIdentityPack);
  const canAttachAlongsideFrames = input.provider === "volcengine" && hasVisualPack && canUseVisualPack;

  if (hasVisualPack && !canUseVisualPack) warnings.push("reference-pack-unsupported");
  if (hasVisualPack && input.provider === "atlas-cloud" && canUseVisualPack && input.lastFrameUrl && !isAtlasReferenceMode) {
    warnings.push("reference-pack-deferred-for-end-frame");
  }
  if (input.audioReferenceUrl && !canUseAudioReference) warnings.push("reference-audio-unsupported");

  let referenceInputs: VideoReferenceInput[] = [];
  if (isAtlasReferenceMode) {
    if (isNonEmpty(input.firstFrameUrl)) {
      referenceInputs.push({ url: input.firstFrameUrl, role: "keyframe", mediaType: "image", required: true });
    }
    if (isNonEmpty(input.lastFrameUrl)) {
      referenceInputs.push({ url: input.lastFrameUrl, role: "end-frame", mediaType: "image", required: false });
    }
    referenceInputs.push(...optional.filter((item) => item.mediaType !== "audio" || canUseAudioReference));
  } else if (canAttachAlongsideFrames) {
    referenceInputs.push(...optional.filter((item) => item.mediaType !== "audio" || canUseAudioReference));
  } else if (input.audioReferenceUrl && canUseAudioReference) {
    referenceInputs.push({ url: input.audioReferenceUrl, role: "audio", mediaType: "audio", required: false });
  }

  // Prevent duplicated URLs from consuming provider reference quotas while preserving role order.
  const seen = new Set<string>();
  referenceInputs = referenceInputs.filter((item) => {
    const key = `${item.mediaType}:${item.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const nativeAudio = capabilities.nativeAudio === true;
  const voiceoverBound = nativeAudio && isNonEmpty(input.voiceover);
  const audioMode: VideoControlSummary["audioMode"] = nativeAudio ? "native" : isNonEmpty(input.voiceover) ? "post" : "none";
  const audioPrompt = nativeAudio ? nativeAudioInstruction(input) : undefined;
  const frameImageCount = canAttachAlongsideFrames
    ? Number(isNonEmpty(input.firstFrameUrl)) + Number(isNonEmpty(input.lastFrameUrl))
    : 0;
  const promptSuffix = [referenceInstruction(referenceInputs, input.locale, frameImageCount), audioPrompt].filter(Boolean).join(input.locale === "zh" ? "。" : " ");
  const strategy: VideoControlSummary["strategy"] = isAtlasReferenceMode || canAttachAlongsideFrames ? "reference-pack" : "keyframe";
  const referenceRoles = unique([
    ...(isNonEmpty(input.firstFrameUrl) ? ["keyframe" as const] : []),
    ...(isNonEmpty(input.lastFrameUrl) ? ["end-frame" as const] : []),
    ...referenceInputs.map((item) => item.role),
  ]);

  return {
    version: 1,
    strategy,
    mode: isAtlasReferenceMode ? "video-to-video" : "image-to-video",
    referenceRoles,
    referenceCount: referenceInputs.length + (isAtlasReferenceMode ? 0 : Number(Boolean(input.firstFrameUrl)) + Number(Boolean(input.lastFrameUrl))),
    audioMode,
    voiceoverBound,
    warnings: unique(warnings),
    ...(!isAtlasReferenceMode && isNonEmpty(input.firstFrameUrl) && { firstFrameUrl: input.firstFrameUrl }),
    ...(!isAtlasReferenceMode && isNonEmpty(input.lastFrameUrl) && { lastFrameUrl: input.lastFrameUrl }),
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
  const allowedWarnings: VideoControlWarning[] = ["reference-pack-unsupported", "reference-pack-deferred-for-end-frame", "reference-audio-unsupported"];
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
