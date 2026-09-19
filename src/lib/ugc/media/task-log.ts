import type { MediaTask } from "./video-types";

export interface MediaTaskLog {
  provider: string;
  providerTaskId: string;
  /** The vendor the provider routed the job to, when it names a different one. */
  servedBy?: string;
  /** The provider's own link, which expires once archiving has replaced it. */
  outputUrl?: string;
  providerError?: string;
  providerUsage?: Record<string, unknown>;
}

/**
 * The provider fields one media call contributes to a job log line: who was
 * asked, the id to quote when asking them about that job, and whatever they
 * have returned so far. Without these a poll cycle prints nothing an operator
 * can take back to the provider, and a finished job hides the URL it was built
 * from behind the archived copy.
 */
export function mediaTaskLog(
  provider: string,
  providerTaskId: string,
  task?: MediaTask,
): MediaTaskLog {
  return {
    provider,
    providerTaskId,
    ...(task?.provider && task.provider !== provider
      ? { servedBy: task.provider }
      : {}),
    ...(task?.outputUrl ? { outputUrl: task.outputUrl } : {}),
    ...(task?.errorMessage ? { providerError: task.errorMessage } : {}),
    ...(task?.extra ? { providerUsage: task.extra } : {}),
  };
}
