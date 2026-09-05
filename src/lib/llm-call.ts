/**
 * The one way this app talks to a script model.
 *
 * Every LLM call in the project — scripts, topic scripts, product vision, judges, quality
 * evaluation, translation, semantic matching, publish copy — goes through `completeText`,
 * `completeJson` or `streamText` here. Call sites previously each built their own OpenAI client
 * and reached into `choices[0].message.content`, which meant every reliability fix had to be
 * repeated seven times or silently applied to only some paths.
 *
 * `completeJson` carries the parse-driven repair retry that keeps weaker models usable: when a
 * reply survives transport but fails to parse, the model gets its own output back plus the parse
 * error and one chance to fix it. Transport retries stay inside the SDK; a second parse failure
 * is a verdict about the model ("this one cannot write scripts"), not a format slip, so it is
 * never retried again.
 */

import { generateText, streamText, type JSONValue, type ModelMessage } from "ai";

import { createLLMModel, toLLMRequestError, withLLMErrors, LLMRequestError } from "@/lib/llm-error";

export type { ModelMessage };

/** Endpoint + key + model. The same shape the settings store persists. */
export interface LLMCallConfig {
  baseUrl: string;
  /** Optional because keyless endpoints (a local Ollama) accept anything. */
  apiKey?: string;
  model: string;
}

export interface CompleteOptions {
  messages: ModelMessage[];
  /** Completion budget. Omit to let the provider apply its own default. */
  maxOutputTokens?: number;
  temperature?: number;
  /** Ask the endpoint to enforce JSON output where it understands the flag. */
  jsonMode?: boolean;
  abortSignal?: AbortSignal;
}

/**
 * Endpoint-scoped body params that stop a hybrid reasoning model from spending its whole output
 * budget on a thinking trace — or from leaking that trace into the JSON we are about to parse.
 *
 * Scoped by baseUrl on purpose: OpenAI 400s on parameters it does not know, so none of these may
 * be sent globally. If a listed endpoint still rejects the field for one specific model,
 * optionalParamRetryFetch (llm-error.ts) replays the request without it. Response-side
 * stripThinkBlocks remains the catch-all for endpoints not listed here.
 */
export function thinkingParams(baseUrl: string): Record<string, JSONValue> {
  const url = baseUrl || "";
  // Qwen3-family hybrids on DashScope / SiliconFlow.
  if (/dashscope|siliconflow/i.test(url)) return { enable_thinking: false };
  // GLM hybrids on Zhipu.
  if (/bigmodel\.cn/i.test(url)) return { thinking: { type: "disabled" } };
  return {};
}

/** Provider-name key the openai-compatible provider spreads into the request body. */
const PROVIDER_KEY = "script-model";

function callSettings(config: LLMCallConfig, options: CompleteOptions) {
  const extra = thinkingParams(config.baseUrl);
  return {
    model: createLLMModel(config, { jsonMode: options.jsonMode }),
    messages: options.messages,
    ...(options.maxOutputTokens != null && { maxOutputTokens: options.maxOutputTokens }),
    ...(options.temperature != null && { temperature: options.temperature }),
    ...(options.abortSignal && { abortSignal: options.abortSignal }),
    ...(Object.keys(extra).length > 0 && { providerOptions: { [PROVIDER_KEY]: extra } }),
  };
}

/** One completion, returning its text. Provider failures arrive as an actionable LLMRequestError. */
export async function completeText(config: LLMCallConfig, options: CompleteOptions): Promise<string> {
  const { text } = await withLLMErrors(() => generateText(callSettings(config, options)), config);
  return text;
}

/** Stream a completion as text deltas. Errors surface on iteration, already relabelled. */
export function streamCompletion(config: LLMCallConfig, options: CompleteOptions): AsyncIterable<string> {
  const result = streamText({ ...callSettings(config, options), onError: () => {} });
  return {
    async *[Symbol.asyncIterator]() {
      try {
        for await (const delta of result.textStream) yield delta;
      } catch (error) {
        throw toLLMRequestError(error, config);
      }
    },
  };
}

/**
 * One completion whose text must parse. On a parse failure the model is shown its own output and
 * the error, and asked once more; a second failure throws the parse error, not a transport one.
 */
export async function completeJson<T>(
  config: LLMCallConfig,
  options: CompleteOptions,
  parse: (content: string) => T,
): Promise<T> {
  let messages = options.messages;
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt++) {
    const content = await completeText(config, { ...options, messages });
    if (!content.trim()) throw new Error("LLM 未返回有效内容");
    try {
      return parse(content);
    } catch (error) {
      // A capability verdict from deeper down is final — re-asking cannot fix it.
      if (error instanceof LLMRequestError) throw error;
      lastError = error;
      if (attempt === 0) {
        const detail = (error instanceof Error ? error.message : String(error)).slice(0, 300);
        messages = [
          ...messages,
          { role: "assistant", content },
          {
            role: "user",
            content: `你上一次的输出无法解析（错误：${detail}）。请严格按之前的要求重新输出完整、合法的 JSON，只输出 JSON 本身，禁止任何解释文字或 markdown 代码块。`,
          },
        ];
      }
    }
  }
  throw lastError;
}

/** An image part for a vision message, from a URL or a data URI. */
export function imagePart(url: string): { type: "image"; image: URL | string } {
  return { type: "image", image: url };
}
