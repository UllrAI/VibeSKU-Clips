import { z } from "zod";
import type { TranscriptWord } from "@/database/ugc";
import { PermanentJobError, RetryableJobError } from "@/lib/jobs/definition";
import { type ContentLocale, LANGUAGE_NAMES } from "../constants";

const submitSchema = z.object({
  output: z.object({ task_id: z.string().min(1) }),
});
const taskSchema = z.object({
  output: z.object({
    task_status: z.enum([
      "PENDING",
      "RUNNING",
      "SUCCEEDED",
      "FAILED",
      "UNKNOWN",
    ]),
    result: z.object({ transcription_url: z.url() }).optional(),
    code: z.string().optional(),
    message: z.string().optional(),
  }),
});
const wordSchema = z.object({
  text: z.string(),
  begin_time: z.number(),
  end_time: z.number(),
});
const resultSchema = z.object({
  transcripts: z.array(
    z.object({
      text: z.string(),
      sentences: z.array(z.object({ words: z.array(wordSchema).optional() })),
    }),
  ),
});
const ttsSchema = z.object({
  output: z.object({ audio: z.object({ url: z.url() }) }),
});

/** The provider's own marker for "succeeded, but there was no speech in it". */
const NO_VALID_FRAGMENT = "SUCCESS_WITH_NO_VALID_FRAGMENT";

function foundNoSpeech(task: z.infer<typeof taskSchema>["output"]): boolean {
  return [task.code, task.message].some((value) =>
    value?.includes(NO_VALID_FRAGMENT),
  );
}

function credentials() {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey)
    throw new PermanentJobError(
      "SPEECH_NOT_CONFIGURED",
      "DASHSCOPE_API_KEY is required for speech processing.",
    );
  const asrBase = (
    process.env.DASHSCOPE_ASR_BASE_URL ??
    "https://dashscope.aliyuncs.com/api/v1"
  ).replace(/\/$/, "");
  const ttsBase = (process.env.DASHSCOPE_TTS_BASE_URL ?? asrBase).replace(
    /\/$/,
    "",
  );
  return { apiKey, asrBase, ttsBase };
}

async function call(
  url: string,
  init: RequestInit,
  apiKey: string,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(60_000),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
    });
  } catch {
    throw new RetryableJobError(
      "SPEECH_UNREACHABLE",
      "The speech provider could not be reached.",
    );
  }
  if (!response.ok) {
    const message = `Speech provider returned HTTP ${response.status}.`;
    if (response.status === 429 || response.status >= 500)
      throw new RetryableJobError("SPEECH_UNAVAILABLE", message);
    throw new PermanentJobError("SPEECH_REQUEST_REJECTED", message);
  }
  return response.json();
}

/** Qwen file transcription returns word timestamps through a durable task id. */
export async function submitTranscription(mediaUrl: string): Promise<string> {
  const { apiKey, asrBase } = credentials();
  const raw = await call(
    `${asrBase}/services/audio/asr/transcription`,
    {
      method: "POST",
      headers: { "X-DashScope-Async": "enable" },
      body: JSON.stringify({
        model: "qwen3-asr-flash-filetrans",
        input: { file_url: mediaUrl },
        parameters: { channel_id: [0], enable_itn: false, enable_words: true },
      }),
    },
    apiKey,
  );
  return submitSchema.parse(raw).output.task_id;
}

export async function getTranscription(
  taskId: string,
): Promise<
  | { status: "pending" }
  | { status: "failed"; reason: string }
  | { status: "ready"; text: string; words: TranscriptWord[] }
> {
  const { apiKey, asrBase } = credentials();
  const raw = await call(
    `${asrBase}/tasks/${encodeURIComponent(taskId)}`,
    {},
    apiKey,
  );
  const task = taskSchema.parse(raw).output;
  if (task.task_status === "PENDING" || task.task_status === "RUNNING")
    return { status: "pending" };
  // The recogniser ran and found nothing worth transcribing. That is an answer
  // about the media, not a failure of the service: a shot can be legitimately
  // silent, and only the caller knows whether silence is wrong there.
  if (foundNoSpeech(task)) return { status: "ready", text: "", words: [] };
  if (task.task_status !== "SUCCEEDED")
    return {
      status: "failed",
      reason: task.message ?? "Speech recognition failed.",
    };
  if (!task.result)
    throw new PermanentJobError(
      "SPEECH_INVALID_RESPONSE",
      "Speech recognition omitted its result URL.",
    );
  const response = await fetch(task.result.transcription_url, {
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok)
    throw new RetryableJobError(
      "SPEECH_RESULT_UNAVAILABLE",
      "Speech recognition result could not be downloaded.",
    );
  const result = resultSchema.parse(await response.json());
  const transcript = result.transcripts[0];
  if (!transcript)
    throw new PermanentJobError(
      "SPEECH_INVALID_RESPONSE",
      "Speech recognition returned no transcript.",
    );
  const words = transcript.sentences
    .flatMap((sentence) => sentence.words ?? [])
    .map((word) => ({
      text: word.text,
      startMs: word.begin_time,
      endMs: word.end_time,
    }));
  return { status: "ready", text: transcript.text, words };
}

/** Qwen non-streaming TTS returns a short-lived URL; callers archive it immediately. */
export async function synthesizeSpeech(
  text: string,
  locale: string,
): Promise<string> {
  const { apiKey, ttsBase } = credentials();
  const language = LANGUAGE_NAMES[locale as ContentLocale];
  if (!language)
    throw new PermanentJobError(
      "TTS_UNSUPPORTED_LANGUAGE",
      `Unsupported narration language: ${locale}.`,
    );
  const raw = await call(
    `${ttsBase}/services/aigc/multimodal-generation/generation`,
    {
      method: "POST",
      body: JSON.stringify({
        model: "qwen3-tts-flash",
        input: {
          text,
          voice: process.env.DASHSCOPE_TTS_VOICE ?? "Cherry",
          language_type: language,
        },
      }),
    },
    apiKey,
  );
  return ttsSchema.parse(raw).output.audio.url;
}
