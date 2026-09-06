import {
  videoModelsForProvider,
  videoResolutionsForProvider,
  type VideoGenerationProvider,
  type VideoModel,
  type VideoModelOption,
  type VideoResolution,
} from "../constants";
import { PermanentJobError } from "@/lib/jobs/definition";
import { loadMediaEnv } from "./config";
import { getLk666Task, submitLk666Video } from "./lk666";
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

export async function submitVideo(request: VideoRequest): Promise<string> {
  const provider = activeVideoProvider();
  if (!isActiveVideoConfiguration(request.model, request.resolution)) {
    throw new PermanentJobError(
      provider === "lk666"
        ? "LK666_REQUEST_REJECTED"
        : "PRISM_REQUEST_REJECTED",
      "The selected video model does not support this resolution.",
    );
  }
  const taskId =
    provider === "lk666"
      ? await submitLk666Video(request)
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
  if (provider === "lk666") return getLk666Task(taskId);
  if (provider === "prism") return getPrismTask(taskId);
  throw new PermanentJobError(
    "VIDEO_PROVIDER_TASK_INVALID",
    "The saved video provider task id is invalid.",
  );
}
