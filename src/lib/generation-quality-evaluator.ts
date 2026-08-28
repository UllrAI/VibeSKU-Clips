import "server-only";

import type OpenAI from "openai";
import { createLLMClient, jsonModeParams, withLLMErrors } from "@/lib/llm-error";
import type { LLMConfig } from "@/lib/script-engine/generator";
import {
  buildQualityEvaluationPrompt,
  parseGenerationQuality,
  type GenerationQualityReport,
  type ShotQualityContract,
} from "@/lib/generation-quality";

/** Evaluate one generated output through the user's configured OpenAI-compatible vision model. */
export async function evaluateGenerationQuality(input: {
  contract: ShotQualityContract;
  outputImageDataUrl: string;
  referenceImageUrls?: string[];
  locale: "zh" | "en";
  config: LLMConfig;
  sampleContext?: string;
}): Promise<GenerationQualityReport> {
  const model = input.config.visionModel || input.config.model;
  const client = createLLMClient({ ...input.config, model });
  const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
    { type: "text", text: buildQualityEvaluationPrompt(input.contract, input.locale, input.sampleContext) },
    { type: "image_url", image_url: { url: input.outputImageDataUrl, detail: "high" } },
    ...(input.referenceImageUrls ?? []).slice(0, 4).map((url): OpenAI.Chat.Completions.ChatCompletionContentPart => ({
      type: "image_url",
      image_url: { url, detail: "high" },
    })),
  ];
  const response = await withLLMErrors(
    () => client.chat.completions.create({
      model,
      messages: [{ role: "user", content }],
      temperature: 0.1,
      max_tokens: 3500,
      ...jsonModeParams(input.config.baseUrl),
    }),
    { ...input.config, model },
  );
  return parseGenerationQuality(response.choices[0]?.message?.content || "", input.contract);
}
