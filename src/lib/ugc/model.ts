import { z } from "zod";
import type { LanguageModel } from "ai";
import { modelEnvFields } from "@/lib/config/runtime-env.mjs";
import { createAiModels } from "@/lib/ai/models.node";

const modelEnvSchema = z.object({
  LLM_API_KEY: z.string().trim().min(1).optional(),
  ...modelEnvFields,
});

let cached: { key: string; model: LanguageModel } | null = null;

/**
 * Authoring runs in both the Web process and the standalone worker, so the
 * model is built from the process environment instead of the Next.js-only
 * validated env module.
 */
export function getAuthoringModel(
  source: NodeJS.ProcessEnv = process.env,
): LanguageModel {
  const parsed = modelEnvSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(
      `Invalid authoring model environment: ${z.prettifyError(parsed.error)}`,
    );
  }
  if (!parsed.data.LLM_API_KEY) {
    throw new Error("LLM_API_KEY must be set before scripts can be written.");
  }

  const key = `${parsed.data.LLM_BASE_URL}:${parsed.data.AI_DEFAULT_MODEL}`;
  if (cached?.key !== key) {
    cached = {
      key,
      model: createAiModels({
        apiKey: parsed.data.LLM_API_KEY,
        baseUrl: parsed.data.LLM_BASE_URL,
        defaultModel: parsed.data.AI_DEFAULT_MODEL,
      }).getChatModel(),
    };
  }
  return cached.model;
}
