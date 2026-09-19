import {
  PRISM_MEDIA,
  videoModelsForProvider,
  videoResolutionsForProvider,
  type VideoGenerationProvider,
  type VideoModel,
  type VideoModelOption,
  type VideoResolution,
} from "../constants";
import { PermanentJobError } from "@/lib/jobs/definition";
import { loadMediaEnv } from "./config";
import {
  getLk888Task,
  LK888_MAX_PROMPT_CHARACTERS,
  submitLk888Video,
} from "./lk888";
import {
  getTask as getPrismTask,
  submitVideo as submitPrismVideo,
} from "./prism";
import type { MediaTask, VideoRequest } from "./video-types";

const PREFIX_SEPARATOR = ":";

export function activeVideoProvider(
  source: NodeJS.ProcessEnv = process.env,
): VideoGenerationProvider {
  return loadMediaEnv(source).VIDEO_GENERATION_PROVIDER;
}

export function activeVideoModelOptions(
  source: NodeJS.ProcessEnv = process.env,
): readonly VideoModelOption[] {
  return videoModelsForProvider(activeVideoProvider(source));
}

export function isActiveVideoConfiguration(
  model: VideoModel,
  resolution: VideoResolution,
  source: NodeJS.ProcessEnv = process.env,
): boolean {
  return videoResolutionsForProvider(activeVideoProvider(source), model).some(
    (candidate) => candidate === resolution,
  );
}

/**
 * How long a prompt the active provider will take. A prompt built past this is
 * rejected outright, so the builder sizes itself rather than letting an adapter
 * cut the beat list off the end.
 */
export function videoPromptLimit(
  source: NodeJS.ProcessEnv = process.env,
): number {
  return activeVideoProvider(source) === "lk888"
    ? LK888_MAX_PROMPT_CHARACTERS
    : PRISM_MEDIA.maxVideoPromptCharacters;
}

export async function submitVideo(request: VideoRequest): Promise<string> {
  const provider = activeVideoProvider();
  if (!isActiveVideoConfiguration(request.model, request.resolution)) {
    throw new PermanentJobError(
      provider === "lk888"
        ? "LK888_REQUEST_REJECTED"
        : "PRISM_REQUEST_REJECTED",
      "The selected video model does not support this resolution.",
    );
  }
  const taskId =
    provider === "lk888"
      ? await submitLk888Video(request)
      : await submitPrismVideo(request);
  return `${provider}${PREFIX_SEPARATOR}${taskId}`;
}

export async function getVideoTask(providerTaskId: string): Promise<MediaTask> {
  const separator = providerTaskId.indexOf(PREFIX_SEPARATOR);
  if (separator < 0) {
    // Tasks submitted before provider routing was introduced belong to Prism.
    return getPrismTask(providerTaskId);
  }

  const provider = providerTaskId.slice(0, separator);
  const taskId = providerTaskId.slice(separator + 1);
  if (provider === "lk888") return getLk888Task(taskId);
  if (provider === "prism") return getPrismTask(taskId);
  throw new PermanentJobError(
    "VIDEO_PROVIDER_TASK_INVALID",
    "The saved video provider task id is invalid.",
  );
}
