import "server-only";

import { completeText, imagePart } from "@/lib/llm-call";
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
  const text = await completeText(
    { ...input.config, model },
    {
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: buildQualityEvaluationPrompt(input.contract, input.locale, input.sampleContext) },
            imagePart(input.outputImageDataUrl),
            ...(input.referenceImageUrls ?? []).slice(0, 4).map(imagePart),
          ],
        },
      ],
      temperature: 0.1,
      maxOutputTokens: 3500,
      jsonMode: true,
    },
  );
  return parseGenerationQuality(text, input.contract);
}
