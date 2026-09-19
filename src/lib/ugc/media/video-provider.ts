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

/**
 * Splits a saved task id back into the provider that issued it and the id that
 * provider knows it by. Ids saved before provider routing carry no prefix and
 * belong to Prism.
 */
function routeVideoTask(providerTaskId: string): {
  provider: VideoGenerationProvider;
  taskId: string;
} {
  const separator = providerTaskId.indexOf(PREFIX_SEPARATOR);
  if (separator < 0) return { provider: "prism", taskId: providerTaskId };

  const provider = providerTaskId.slice(0, separator);
  if (provider !== "prism" && provider !== "lk888") {
    throw new PermanentJobError(
      "VIDEO_PROVIDER_TASK_INVALID",
      "The saved video provider task id is invalid.",
    );
  }
  return { provider, taskId: providerTaskId.slice(separator + 1) };
}

/** Which provider a job must be chased with, for logs and for polling. */
export function videoTaskProvider(
  providerTaskId: string,
): VideoGenerationProvider {
  return routeVideoTask(providerTaskId).provider;
}

export async function getVideoTask(providerTaskId: string): Promise<MediaTask> {
  const { provider, taskId } = routeVideoTask(providerTaskId);
  return provider === "lk888" ? getLk888Task(taskId) : getPrismTask(taskId);
}
