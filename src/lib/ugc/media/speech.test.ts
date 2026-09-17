import { describe, expect, it } from "@jest/globals";
import {
  getTranscription,
  submitTranscription,
  synthesizeSpeech,
} from "./speech";

describe("hosted speech API contracts", () => {
  it("requests multilingual Qwen3 TTS with a supported language and voice", async () => {
    const originalFetch = globalThis.fetch;
    const originalKey = process.env.DASHSCOPE_API_KEY;
    const originalBase = process.env.DASHSCOPE_TTS_BASE_URL;
    const originalVoice = process.env.DASHSCOPE_TTS_VOICE;
    const requests: { url: string; body: Record<string, unknown> }[] = [];
    process.env.DASHSCOPE_API_KEY = "test-key";
    process.env.DASHSCOPE_TTS_BASE_URL = "https://speech.example/api/v1";
    delete process.env.DASHSCOPE_TTS_VOICE;
    globalThis.fetch = async (input, init) => {
      requests.push({
        url: String(input),
        body: JSON.parse(String(init?.body)) as Record<string, unknown>,
      });
      return Response.json({
        output: { audio: { url: "https://media.example/speech.wav" } },
      });
    };
    try {
      for (const locale of ["zh-Hans", "en", "es", "pt", "ja", "ko"]) {
        expect(await synthesizeSpeech("Test", locale)).toBe(
          "https://media.example/speech.wav",
        );
      }
      expect(
        requests.map(
          ({ body }) => (body.input as { language_type: string }).language_type,
        ),
      ).toEqual([
        "Chinese",
        "English",
        "Spanish",
        "Portuguese",
        "Japanese",
        "Korean",
      ]);
      expect(
        requests.every(
          ({ url, body }) =>
            url ===
              "https://speech.example/api/v1/services/aigc/multimodal-generation/generation" &&
            body.model === "qwen3-tts-flash" &&
            (body.input as { voice: string }).voice === "Cherry",
        ),
      ).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
      if (originalKey === undefined) delete process.env.DASHSCOPE_API_KEY;
      else process.env.DASHSCOPE_API_KEY = originalKey;
      if (originalBase === undefined) delete process.env.DASHSCOPE_TTS_BASE_URL;
      else process.env.DASHSCOPE_TTS_BASE_URL = originalBase;
      if (originalVoice === undefined) delete process.env.DASHSCOPE_TTS_VOICE;
      else process.env.DASHSCOPE_TTS_VOICE = originalVoice;
    }
  });

  it("submits word-level ASR and reads measured timestamps", async () => {
    const originalFetch = globalThis.fetch;
    const originalKey = process.env.DASHSCOPE_API_KEY;
    const originalBase = process.env.DASHSCOPE_ASR_BASE_URL;
    const requests: { url: string; body?: Record<string, unknown> }[] = [];
    process.env.DASHSCOPE_API_KEY = "test-key";
    process.env.DASHSCOPE_ASR_BASE_URL = "https://speech.example/api/v1";
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      requests.push({
        url,
        body: init?.body
          ? (JSON.parse(String(init.body)) as Record<string, unknown>)
          : undefined,
      });
      if (url.endsWith("/transcription"))
        return Response.json({ output: { task_id: "task-1" } });
      if (url.endsWith("/task-1"))
        return Response.json({
          output: {
            task_status: "SUCCEEDED",
            result: { transcription_url: "https://media.example/result.json" },
          },
        });
      return Response.json({
        transcripts: [
          {
            text: "Hello",
            sentences: [
              { words: [{ text: "Hello", begin_time: 100, end_time: 600 }] },
            ],
          },
        ],
      });
    };
    try {
      expect(await submitTranscription("https://media.example/shot.mp4")).toBe(
        "task-1",
      );
      expect(await getTranscription("task-1")).toEqual({
        status: "ready",
        text: "Hello",
        words: [{ text: "Hello", startMs: 100, endMs: 600 }],
      });
      expect(
        (requests[0]!.body!.parameters as { enable_words: boolean })
          .enable_words,
      ).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
      if (originalKey === undefined) delete process.env.DASHSCOPE_API_KEY;
      else process.env.DASHSCOPE_API_KEY = originalKey;
      if (originalBase === undefined) delete process.env.DASHSCOPE_ASR_BASE_URL;
      else process.env.DASHSCOPE_ASR_BASE_URL = originalBase;
    }
  });
});
