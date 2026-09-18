import type {
  VideoAspectRatio,
  VideoModel,
  VideoResolution,
} from "../constants";

export type MediaTaskStatus = "pending" | "completed" | "failed";

export interface MediaTask {
  status: MediaTaskStatus;
  outputUrl: string | null;
  errorMessage: string | null;
  provider: string | null;
  extra: Record<string, unknown> | null;
}

export interface VideoRequest {
  model: VideoModel;
  prompt: string;
  referenceUrls: string[];
  durationSeconds: number;
  aspectRatio: VideoAspectRatio;
  resolution: VideoResolution;
  requestId: string;
  /**
   * Whether the provider should produce its own audio, where that is a request
   * the API takes. What is said is always carried by the prompt, and an adapter
   * with no such field ignores this; composition never maps a provider's own
   * track once a narration track exists, so ignoring it changes nothing there.
   */
  generateAudio?: boolean;
}
