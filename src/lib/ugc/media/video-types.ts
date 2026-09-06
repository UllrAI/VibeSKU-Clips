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
}
