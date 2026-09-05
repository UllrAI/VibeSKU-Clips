/**
 * What a video model can actually do, and what a request to it will really be worth.
 *
 * This used to infer capabilities from the shape of a model id (`…/image-to-video` means i2v,
 * `seedance-2.0` means multimodal references) because models arrived from seven platforms with
 * no shared vocabulary, and a custom model could be any string a user typed. With Prism as the
 * only gateway the catalog is closed and authoritative, so inference is gone: a model is either
 * in the catalog with known limits, or it is not a model this app can call.
 *
 * `preflightVideoGeneration` previews the exact snapping the provider will perform, so the UI
 * can say "15s becomes 10s on this model" before the user pays rather than after.
 */

import { videoSize, type GenAspectRatio, type GenResolution } from "@/lib/gen-params";
import {
  findVideoModel,
  resolutionTier,
  snapDuration,
  snapRatio,
  snapResolution,
} from "@/lib/providers/prism-catalog";

/** `known` = in the Prism catalog; `unknown` = a stale id from an older install. */
export type CapabilityConfidence = "known" | "unknown";

export interface VideoModelCapabilities {
  confidence: CapabilityConfidence;
  textToVideo: boolean;
  imageToVideo: boolean;
  referenceImages: boolean;
  referenceVideo: boolean;
  referenceAudio: boolean;
  lastFrame: boolean;
  nativeAudio: boolean;
  /** Accepts an existing video as an editing/conditioning source. */
  videoEdit: boolean;
  /** Accepts an explicit time window for provider-native partial regeneration. */
  temporalRetake: boolean;
  /** Accepts a spatial mask/region for provider-native inpainting. */
  regionMask: boolean;
  /** Accepts keyframes with native timeline positions rather than an unordered set. */
  multiKeyframes: boolean;
  /** Can use a reference video to guide body motion or performance. */
  performanceReference: boolean;
  durationValues: number[];
  resolutionValues: string[];
  aspectRatioValues: string[];
  maxReferenceImages: number;
}

/** Everything false: a model id that is not in the catalog can be promised nothing. */
const UNKNOWN_CAPABILITIES: VideoModelCapabilities = {
  confidence: "unknown",
  textToVideo: false,
  imageToVideo: false,
  referenceImages: false,
  referenceVideo: false,
  referenceAudio: false,
  lastFrame: false,
  nativeAudio: false,
  videoEdit: false,
  temporalRetake: false,
  regionMask: false,
  multiKeyframes: false,
  performanceReference: false,
  durationValues: [],
  resolutionValues: [],
  aspectRatioValues: [],
  maxReferenceImages: 0,
};

/** Read one model's limits out of the Prism catalog. */
export function getVideoModelCapabilities(modelId: string): VideoModelCapabilities {
  const model = findVideoModel(modelId);
  if (!model) return UNKNOWN_CAPABILITIES;

  return {
    confidence: "known",
    // Every Prism video model generates from a prompt alone, and every one accepts a still —
    // what differs is whether that still is a real first frame or only a reference.
    textToVideo: true,
    imageToVideo: true,
    referenceImages: model.maxReferenceImages > 0,
    referenceVideo: model.maxReferenceVideos > 0,
    referenceAudio: model.maxReferenceAudios > 0,
    lastFrame: model.lastFrame,
    nativeAudio: model.nativeAudio || Boolean(model.audioToggle),
    videoEdit: model.maxReferenceVideos > 0,
    // Prism's request schema exposes no time range, no mask and no positioned keyframes.
    // Retakes and splices are negotiated locally instead, so the UI never overstates the model.
    temporalRetake: false,
    regionMask: false,
    multiKeyframes: false,
    performanceReference: model.maxReferenceVideos > 0,
    durationValues: model.durations,
    resolutionValues: model.resolutions,
    aspectRatioValues: model.ratios,
    maxReferenceImages: model.maxReferenceImages,
  };
}

export interface PreflightAdjustment {
  field: "duration" | "resolution" | "aspectRatio" | "chainMode";
  requested: string | number;
  effective: string | number;
  code: "nearest-duration" | "mapped-resolution" | "adaptive-ratio" | "unsupported-last-frame";
}

export interface VideoGenerationPreflight {
  capabilities: VideoModelCapabilities;
  adjustments: PreflightAdjustment[];
  warnings: Array<
    | "capabilities-unknown"
    | "native-audio-unavailable"
    | "reference-images-trimmed"
    | "reference-conditioning-unavailable"
    | "reference-audio-unavailable"
  >;
}

/**
 * Preview the exact compatibility mapping the provider is about to perform.
 * Mirrors buildPrismVideoBody — if that changes, this must change with it.
 */
export function preflightVideoGeneration(input: {
  modelId: string;
  duration?: number;
  resolution: GenResolution;
  aspectRatio: GenAspectRatio;
  chainMode: "pin" | "tail" | "off";
  audioEnabled?: boolean;
  referenceImageCount?: number;
  referenceAudioCount?: number;
}): VideoGenerationPreflight {
  const capabilities = getVideoModelCapabilities(input.modelId);
  const model = findVideoModel(input.modelId);
  const adjustments: PreflightAdjustment[] = [];
  const warnings: VideoGenerationPreflight["warnings"] = [];

  if (!model) return { capabilities, adjustments, warnings: ["capabilities-unknown"] };

  const { width, height } = videoSize(input.resolution, input.aspectRatio);

  if (input.duration != null) {
    const effective = snapDuration(model.durations, input.duration, input.duration);
    if (effective !== input.duration) {
      adjustments.push({ field: "duration", requested: input.duration, effective, code: "nearest-duration" });
    }
  }

  const effectiveResolution = snapResolution(model.resolutions, resolutionTier(width, height));
  if (effectiveResolution !== input.resolution) {
    adjustments.push({
      field: "resolution",
      requested: input.resolution,
      effective: effectiveResolution,
      code: "mapped-resolution",
    });
  }

  const effectiveRatio = snapRatio(model.ratios, width, height);
  if (effectiveRatio !== input.aspectRatio) {
    adjustments.push({
      field: "aspectRatio",
      requested: input.aspectRatio,
      effective: effectiveRatio,
      code: "adaptive-ratio",
    });
  }

  if (input.chainMode !== "off" && !capabilities.lastFrame) {
    adjustments.push({
      field: "chainMode",
      requested: input.chainMode,
      effective: "off",
      code: "unsupported-last-frame",
    });
  }

  if (input.audioEnabled && !capabilities.nativeAudio) warnings.push("native-audio-unavailable");
  if ((input.referenceImageCount ?? 0) > 0 && !capabilities.referenceImages) {
    warnings.push("reference-conditioning-unavailable");
  }
  if ((input.referenceAudioCount ?? 0) > 0 && !capabilities.referenceAudio) {
    warnings.push("reference-audio-unavailable");
  }
  if ((input.referenceImageCount ?? 0) > capabilities.maxReferenceImages && capabilities.referenceImages) {
    warnings.push("reference-images-trimmed");
  }

  return { capabilities, adjustments, warnings };
}
