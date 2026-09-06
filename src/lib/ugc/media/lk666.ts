import { z } from "zod";
import { PermanentJobError, RetryableJobError } from "@/lib/jobs/definition";
import { MEDIA_REQUEST_TIMEOUT_MS, type VideoResolution } from "../constants";
import { loadMediaEnv } from "./config";
import type { MediaTask, VideoRequest } from "./video-types";

const MODEL = "hailuo-h3-quannengcankao";
const MAX_PROMPT_CHARACTERS = 4096;

function fitPrompt(prompt: string): string {
  return Array.from(prompt).slice(0, MAX_PROMPT_CHARACTERS).join("");
}

const taskIdSchema = z
  .union([z.string().min(1), z.number()])
  .transform((value) => String(value));

const submissionSchema = z.object({
  code: z.coerce.number(),
  data: z.object({ task_id: taskIdSchema }).optional(),
  msg: z.string().optional(),
});

const taskSchema = z.object({
  state: z.enum(["pending", "running", "success", "failed"]),
  is_final: z.boolean(),
  result_url: z.string().nullish(),
  error: z.string().nullish(),
  cost: z.number().optional(),
});

async function call(path: string, init: RequestInit): Promise<unknown> {
  const env = loadMediaEnv();
  if (!env.LK666_API_KEY) {
    throw new PermanentJobError(
      "LK666_NOT_CONFIGURED",
      "The lk666 video provider is not configured.",
    );
  }

  const baseUrl = env.LK666_API_BASE_URL.replace(/\/$/, "");
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    signal: AbortSignal.timeout(MEDIA_REQUEST_TIMEOUT_MS),
    headers: {
      authorization: `Bearer ${env.LK666_API_KEY}`,
      "content-type": "application/json",
      ...init.headers,
    },
  }).catch(() => {
    throw new RetryableJobError(
      "LK666_UNREACHABLE",
      "The lk666 video provider could not be reached.",
    );
  });

  if (!response.ok) {
    const message = `The lk666 video provider returned HTTP ${response.status}.`;
    if (response.status === 401 || response.status === 403) {
      throw new PermanentJobError("LK666_AUTH_FAILED", message);
    }
    if (response.status === 429 || response.status >= 500) {
      throw new RetryableJobError("LK666_UNAVAILABLE", message);
    }
    throw new PermanentJobError("LK666_REQUEST_REJECTED", message);
  }

  return response.json().catch(() => {
    throw new PermanentJobError(
      "LK666_INVALID_RESPONSE",
      "The lk666 video provider returned invalid JSON.",
    );
  });
}

export function lk666Resolution(resolution: VideoResolution): string {
  if (resolution === "720p") return "768P";
  if (resolution === "1080p") return "1080P";
  if (resolution === "2k") return "2K";
  throw new PermanentJobError(
    "LK666_REQUEST_REJECTED",
    "lk666 does not support 480p video.",
  );
}

export async function submitLk666Video(request: VideoRequest): Promise<string> {
  const raw = await call("/v1/media/generate", {
    method: "POST",
    body: JSON.stringify({
      model: MODEL,
      prompt: fitPrompt(request.prompt),
      params: {
        duration: String(request.durationSeconds),
        aspect_ratio: request.aspectRatio,
        resolution: lk666Resolution(request.resolution),
        image_url: request.referenceUrls.slice(0, 9),
      },
    }),
  });
  const parsed = submissionSchema.safeParse(raw);
  if (!parsed.success) {
    throw new PermanentJobError(
      "LK666_INVALID_RESPONSE",
      "The lk666 video provider returned an unexpected submission response.",
    );
  }
  if (parsed.data.code !== 200) {
    throw new PermanentJobError(
      "LK666_REQUEST_REJECTED",
      parsed.data.msg ?? "The lk666 video provider rejected the request.",
    );
  }
  if (!parsed.data.data) {
    throw new PermanentJobError(
      "LK666_INVALID_RESPONSE",
      "The lk666 video provider omitted the task id.",
    );
  }
  return parsed.data.data.task_id;
}

export async function getLk666Task(taskId: string): Promise<MediaTask> {
  const raw = await call(
    `/v1/media/status?task_id=${encodeURIComponent(taskId)}`,
    { method: "GET" },
  );
  const parsed = taskSchema.safeParse(raw);
  if (!parsed.success) {
    throw new PermanentJobError(
      "LK666_INVALID_RESPONSE",
      "The lk666 video provider returned an unexpected task response.",
    );
  }

  const task = parsed.data;
  const completed = task.is_final && task.state === "success";
  return {
    status: completed ? "completed" : task.is_final ? "failed" : "pending",
    outputUrl: completed ? (task.result_url ?? null) : null,
    errorMessage: task.state === "failed" ? (task.error ?? null) : null,
    provider: "lk666",
    extra: task.cost === undefined ? null : { cost: task.cost },
  };
}
