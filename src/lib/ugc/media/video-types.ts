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
   * Whether the provider should speak the line itself. An adapter with no way
   * to ask either way ignores it, so `native` mode gets whatever that provider
   * does by default. Composition never maps a provider's own track once a
   * narration track exists, which keeps the cost of being ignored to that mode.
   */
  generateAudio?: boolean;
}
