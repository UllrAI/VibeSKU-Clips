import { z } from "zod";
import type { TranscriptWord } from "@/database/ugc";
import { PermanentJobError, RetryableJobError } from "@/lib/jobs/definition";

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
  const language = {
    "zh-Hans": "Chinese",
    en: "English",
    es: "Spanish",
    pt: "Portuguese",
    ja: "Japanese",
    ko: "Korean",
  }[locale];
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

/** Reject an invented or missing spoken line before publishing its captions. */
export function speechMatchesScript(expected: string, actual: string): boolean {
  const normalized = (value: string) =>
    value
      .toLocaleLowerCase()
      .normalize("NFKC")
      .replace(/[^\p{L}\p{N}]/gu, "");
  const a = normalized(expected);
  const b = normalized(actual);
  if (!a) return !b;
  if (!b) return false;
  // Recognition may omit small particles or punctuation; a large disagreement is unsafe.
  const lengthGap = Math.abs(a.length - b.length) / a.length;
  if (lengthGap > 0.3) return false;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) {
      next[j] = Math.min(
        next[j - 1]! + 1,
        previous[j]! + 1,
        previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = next;
  }
  return previous[b.length]! / Math.max(a.length, b.length) <= 0.25;
}
