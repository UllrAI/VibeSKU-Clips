import { createHash } from "node:crypto";
import { z } from "zod";
import { PermanentJobError, RetryableJobError } from "@/lib/jobs/definition";
import {
  MEDIA_REQUEST_TIMEOUT_MS,
  PRISM_MEDIA,
  type VideoAspectRatio,
} from "../constants";
import { loadMediaEnv } from "./config";
import type { MediaTask, MediaTaskStatus, VideoRequest } from "./video-types";

const submissionSchema = z.object({
  data: z.object({ task_id: z.string().min(1) }),
});

const taskSchema = z.object({
  status: z.string(),
  output_url: z.string().nullish(),
  error_message: z.string().nullish(),
  successful_provider: z.string().nullish(),
  extra_data: z.record(z.string(), z.unknown()).nullish(),
});

/** Prism requires request_id to be a UUID, including for derived frame jobs. */
export function createPrismRequestId(...parts: string[]): string {
  const bytes = createHash("sha256")
    .update(parts.join("\0"))
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function call<T>(
  path: string,
  init: { method: "GET" | "POST"; body?: unknown },
  schema: z.ZodType<T>,
): Promise<T> {
  const env = loadMediaEnv();
  if (!env.PRISM_API_KEY || !env.PRISM_API_SECRET) {
    throw new PermanentJobError(
      "PRISM_NOT_CONFIGURED",
      "The media generation provider is not configured.",
    );
  }

  const baseUrl = env.PRISM_API_BASE_URL.replace(/\/$/, "");
  const response = await fetch(`${baseUrl}${path}`, {
    method: init.method,
    signal: AbortSignal.timeout(MEDIA_REQUEST_TIMEOUT_MS),
    headers: {
      "content-type": "application/json",
      "X-API-Key": env.PRISM_API_KEY,
      "X-API-Secret": env.PRISM_API_SECRET,
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  }).catch(() => {
    throw new RetryableJobError(
      "PRISM_UNREACHABLE",
      "The media generation provider could not be reached.",
    );
  });

  if (!response.ok) {
    const message = `The media generation provider returned HTTP ${response.status}.`;
    if (response.status === 401 || response.status === 403) {
      throw new PermanentJobError("PRISM_AUTH_FAILED", message);
    }
    if (response.status === 429 || response.status >= 500) {
      throw new RetryableJobError("PRISM_UNAVAILABLE", message);
    }
    // Other 4xx responses mean the payload is invalid; retrying cannot change it.
    throw new PermanentJobError("PRISM_REQUEST_REJECTED", message);
  }

  const parsed = schema.safeParse(await response.json());
  if (!parsed.success) {
    throw new PermanentJobError(
      "PRISM_INVALID_RESPONSE",
      "The media generation provider returned an unexpected response.",
    );
  }
  return parsed.data;
}

export interface ImageRequest {
  prompt: string;
  referenceUrls: string[];
  aspectRatio: VideoAspectRatio;
  requestId: string;
}

export async function submitImage(request: ImageRequest): Promise<string> {
  const submission = await call(
    "/image-gen",
    {
      method: "POST",
      body: {
        prompt: request.prompt,
        model: PRISM_MEDIA.imageModel,
        image_size: PRISM_MEDIA.imageSize,
        quality: PRISM_MEDIA.imageQuality,
        aspect_ratio: request.aspectRatio,
        request_id: request.requestId,
        ...(request.referenceUrls.length
          ? { reference_urls: request.referenceUrls }
          : {}),
      },
    },
    submissionSchema,
  );
  return submission.data.task_id;
}

export async function submitVideo(request: VideoRequest): Promise<string> {
  const submission = await call(
    "/video-gen",
    {
      method: "POST",
      body: {
        prompt: request.prompt,
        model: PRISM_MEDIA.videoModel,
        duration: request.durationSeconds,
        aspect_ratio: request.aspectRatio,
        resolution: request.resolution,
        generate_audio: true,
        request_id: request.requestId,
        ...(request.referenceUrls.length
          ? {
              reference_images: request.referenceUrls.slice(
                0,
                PRISM_MEDIA.maxVideoReferences,
              ),
            }
          : {}),
      },
    },
    submissionSchema,
  );
  return submission.data.task_id;
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
