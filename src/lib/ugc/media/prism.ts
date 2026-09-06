import { z } from "zod";
import { MEDIA_PROVIDER } from "../constants";
import { loadMediaEnv } from "./config";

export class MediaProviderError extends Error {
  readonly retryable: boolean;

  constructor(message: string, retryable: boolean) {
    super(message);
    this.name = "MediaProviderError";
    this.retryable = retryable;
  }
}

const submissionSchema = z.object({ task_id: z.string().min(1) });

const taskSchema = z.object({
  status: z.string(),
  output_url: z.string().nullish(),
  error_message: z.string().nullish(),
  successful_provider: z.string().nullish(),
  extra_data: z.record(z.string(), z.unknown()).nullish(),
});

type MediaTaskStatus = "pending" | "completed" | "failed";

export interface MediaTask {
  status: MediaTaskStatus;
  outputUrl: string | null;
  errorMessage: string | null;
  provider: string | null;
  extra: Record<string, unknown> | null;
}

async function call<T>(
  path: string,
  init: { method: "GET" | "POST"; body?: unknown },
  schema: z.ZodType<T>,
): Promise<T> {
  const env = loadMediaEnv();
  if (!env.PRISM_API_KEY || !env.PRISM_API_SECRET) {
    throw new MediaProviderError(
      "The media generation provider is not configured.",
      false,
    );
  }

  const response = await fetch(`${MEDIA_PROVIDER.baseUrl}${path}`, {
    method: init.method,
    signal: AbortSignal.timeout(MEDIA_PROVIDER.requestTimeoutMs),
    headers: {
      "content-type": "application/json",
      "X-API-Key": env.PRISM_API_KEY,
      "X-API-Secret": env.PRISM_API_SECRET,
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  }).catch(() => {
    throw new MediaProviderError(
      "The media generation provider could not be reached.",
      true,
    );
  });

  if (!response.ok) {
    // 4xx means the request itself is wrong; retrying it changes nothing.
    throw new MediaProviderError(
      `The media generation provider returned HTTP ${response.status}.`,
      response.status >= 500 || response.status === 429,
    );
  }

  const parsed = schema.safeParse(await response.json());
  if (!parsed.success) {
    throw new MediaProviderError(
      "The media generation provider returned an unexpected response.",
      false,
    );
  }
  return parsed.data;
}

export interface ImageRequest {
  prompt: string;
  referenceUrls: string[];
  aspectRatio: string;
  requestId: string;
}

export async function submitImage(request: ImageRequest): Promise<string> {
  const { task_id } = await call(
    "/image-gen",
    {
      method: "POST",
      body: {
        prompt: request.prompt,
        model: MEDIA_PROVIDER.imageModel,
        aspect_ratio: request.aspectRatio,
        request_id: request.requestId,
        ...(request.referenceUrls.length
          ? { reference_urls: request.referenceUrls }
          : {}),
      },
    },
    submissionSchema,
  );
  return task_id;
}

export interface VideoRequest {
  prompt: string;
  /** First frame the clip opens on, which anchors talent and product look. */
  referenceUrl?: string;
  durationSeconds: number;
  aspectRatio: string;
  requestId: string;
}

export async function submitVideo(request: VideoRequest): Promise<string> {
  const { task_id } = await call(
    "/video-gen",
    {
      method: "POST",
      body: {
        prompt: request.prompt,
        model: MEDIA_PROVIDER.videoModel,
        duration: request.durationSeconds,
        aspect_ratio: request.aspectRatio,
        request_id: request.requestId,
        ...(request.referenceUrl
          ? { reference_url: request.referenceUrl }
          : {}),
      },
    },
    submissionSchema,
  );
  return task_id;
}

export async function getTask(taskId: string): Promise<MediaTask> {
  const task = await call(
    `/tasks/${encodeURIComponent(taskId)}`,
    { method: "GET" },
    taskSchema,
  );

  const status: MediaTaskStatus =
    task.status === "completed"
      ? "completed"
      : task.status === "failed" || task.status === "cancelled"
        ? "failed"
        : "pending";

  return {
    status,
    outputUrl: task.output_url ?? null,
    errorMessage: task.error_message ?? null,
    provider: task.successful_provider ?? null,
    extra: task.extra_data ?? null,
  };
}
