// @vitest-environment node
/**
 * Script-model failure handling.
 *
 * Two lines to hold:
 *  1) A 400 caused by a parameter THIS app added (the completion cap, JSON mode, a thinking
 *     toggle) must be replayed without that parameter instead of surfacing as "bad request" —
 *     the user's request was fine, our optimization was not.
 *  2) Every failure must say what to do next. Issue #19 reported the app as simply "broken"
 *     because the only feedback was `LLM 请求失败（模型: …）: 402`, and the generation path and
 *     the "test connection" button must give the same wording for the same status.
 */
import { describe, it, expect } from "vitest";
import { APICallError } from "ai";
import {
  LLMRequestError,
  createLLMModel,
  explainLLMError,
  explainLLMStatus,
  isTokenCapRejection,
  llmErrorPair,
  optionalParamRetryFetch,
  supportsJsonMode,
  tokenCapRetryFetch,
  toLLMRequestError,
  withLLMErrors,
} from "@/lib/llm-error";
import { settings } from "@/lib/i18n/messages/settings";
import { LLM_PRESETS, RECOMMENDED_PRESET } from "@/lib/llm-presets";
import { migrateSettings } from "@/lib/stores/settings-store";
import type { SettingsState } from "@/lib/stores/settings-store";

/** An SDK APICallError carrying a status and a response body, as a real failure would. */
function apiError(status: number, body = "boom"): APICallError {
  return new APICallError({
    message: body,
    url: "https://api.example.com/v1/chat/completions",
    requestBodyValues: {},
    statusCode: status,
    responseBody: body,
  });
}

describe("createLLMModel（一条 OpenAI 兼容通路，OpenRouter 只是换个地址）", () => {
  it("模型 id 原样透传给 provider", () => {
    const model = createLLMModel({ baseUrl: "https://openrouter.ai/api/v1", apiKey: "k", model: "openai/gpt-5.4" });
    expect(typeof model).toBe("object");
    expect((model as { modelId: string }).modelId).toBe("openai/gpt-5.4");
  });

  it("免 Key 端点（本地 Ollama）也能构造出模型，不因空 Key 抛错", () => {
    expect(() => createLLMModel({ baseUrl: "http://127.0.0.1:11434/v1", apiKey: "", model: "qwen2.5" })).not.toThrow();
  });

  it("JSON 模式只对已知支持的端点开启", () => {
    expect(supportsJsonMode("https://openrouter.ai/api/v1")).toBe(true);
    expect(supportsJsonMode("https://api.deepseek.com/v1")).toBe(true);
    expect(supportsJsonMode("http://127.0.0.1:11434/v1")).toBe(false);
    expect(supportsJsonMode("")).toBe(false);
    expect(supportsJsonMode(undefined)).toBe(false);
  });
});

describe("tokenCapRetryFetch（输出上限是我们猜的，被拒就去掉重放）", () => {
  const body = JSON.stringify({ model: "m", messages: [], max_tokens: 8000 });

  it("400 且报错点名输出上限 → 去掉 max_tokens 重放", async () => {
    const sent: string[] = [];
    const wrapped = tokenCapRetryFetch(async (_url, init) => {
      sent.push(init?.body as string);
      if (sent.length === 1) return new Response('{"error":"max_tokens is greater than the maximum allowed"}', { status: 400 });
      return new Response('{"ok":true}', { status: 200 });
    });
    const res = await wrapped("http://x/v1/chat/completions", { method: "POST", body });
    expect(res.status).toBe(200);
    expect(JSON.parse(sent[1]).max_tokens).toBeUndefined();
  });

  it("推理模型只是嫌字段名不对 → 改名 max_completion_tokens，保留预算", async () => {
    const sent: string[] = [];
    const wrapped = tokenCapRetryFetch(async (_url, init) => {
      sent.push(init?.body as string);
      if (sent.length === 1) return new Response('{"error":"use max_completion_tokens instead"}', { status: 400 });
      return new Response("{}", { status: 200 });
    });
    await wrapped("http://x", { method: "POST", body });
    expect(JSON.parse(sent[1]).max_completion_tokens).toBe(8000);
    expect(JSON.parse(sent[1]).max_tokens).toBeUndefined();
  });

  it("400 但与输出上限无关 → 原样返回，且 body 仍可读", async () => {
    let calls = 0;
    const wrapped = tokenCapRetryFetch(async () => {
      calls++;
      return new Response('{"error":"model not found"}', { status: 400 });
    });
    const res = await wrapped("http://x", { method: "POST", body });
    expect(calls).toBe(1);
    expect(await res.text()).toContain("model not found");
  });

  it("成功响应直接透传（不消费流式 body）", async () => {
    const original = new Response("stream", { status: 200 });
    const wrapped = tokenCapRetryFetch(async () => original);
    expect(await wrapped("http://x", { method: "POST", body })).toBe(original);
  });

  it("isTokenCapRejection 只认输出预算类报错", () => {
    expect(isTokenCapRejection("could not finish the message")).toBe(true);
    expect(isTokenCapRejection("model not found")).toBe(false);
    expect(isTokenCapRejection(undefined)).toBe(false);
  });
});

describe("optionalParamRetryFetch（可选参数被点名拒绝时去掉重放一次）", () => {
  const body = JSON.stringify({ model: "m", messages: [], response_format: { type: "json_object" }, enable_thinking: false });

  it("400 且报错点名 response_format → 只去掉被点名的字段重放", async () => {
    const calls: string[] = [];
    const wrapped = optionalParamRetryFetch(async (_url, init) => {
      calls.push(init?.body as string);
      if (calls.length === 1) return new Response('{"error":"response_format is not supported"}', { status: 400 });
      return new Response('{"ok":true}', { status: 200 });
    });
    const res = await wrapped("http://x/v1/chat/completions", { method: "POST", body });
    expect(res.status).toBe(200);
    const replayed = JSON.parse(calls[1]);
    expect(replayed.response_format).toBeUndefined();
    expect(replayed.enable_thinking).toBe(false); // 未被点名的保留
  });

  it("400 但报错与可选参数无关 → 原样返回不重放", async () => {
    let calls = 0;
    const wrapped = optionalParamRetryFetch(async () => {
      calls++;
      return new Response('{"error":"model not found"}', { status: 400 });
    });
    const res = await wrapped("http://x", { method: "POST", body });
    expect(res.status).toBe(400);
    expect(calls).toBe(1);
    expect(await res.text()).toContain("model not found");
  });

  it("请求里没有可选参数 → 不读 body 不重放", async () => {
    let calls = 0;
    const wrapped = optionalParamRetryFetch(async () => {
      calls++;
      return new Response("bad", { status: 400 });
    });
    await wrapped("http://x", { method: "POST", body: JSON.stringify({ model: "m" }) });
    expect(calls).toBe(1);
  });

  it("成功响应直接透传", async () => {
    const wrapped = optionalParamRetryFetch(async () => new Response("stream", { status: 200 }));
    expect(await (await wrapped("http://x", { method: "POST", body })).text()).toBe("stream");
  });
});

describe("explainLLMStatus（每种失败都要说出下一步该做什么）", () => {
  it("401/403 说 Key，404 带上模型名，429 说限流，5xx 说稍后重试", () => {
    expect(explainLLMStatus(401, {}).zh).toContain("Key");
    expect(explainLLMStatus(403, {}).zh).toContain("Key");
    expect(explainLLMStatus(404, { model: "gpt-9" }).zh).toContain("gpt-9");
    expect(explainLLMStatus(429, {}).zh).toContain("限流");
    expect(explainLLMStatus(503, {}).zh).toContain("5xx");
  });

  it("402 指向充值或换渠道", () => {
    expect(explainLLMStatus(402, { baseUrl: "https://api.deepseek.com" }).zh).toContain("充值");
  });

  it("400：输出预算耗尽与模型名填错要给不同的建议", () => {
    const capped = explainLLMStatus(400, { detail: "could not finish the message" });
    expect(capped.zh).toContain("输出长度");
    const other = explainLLMStatus(400, { detail: "unknown field" });
    expect(other.zh).toContain("模型名");
  });

  it("中英两版都给，且不是同一句", () => {
    const pair = explainLLMStatus(401, {});
    expect(pair.en).not.toBe(pair.zh);
    expect(pair.en).toMatch(/[a-z]/);
  });
});

describe("explainLLMError（SDK 错误 → 文案，含无状态码的连接层失败）", () => {
  it("连不上端点时提示网络与本地 Ollama", () => {
    const out = explainLLMError(Object.assign(new TypeError("fetch failed"), { name: "TypeError" }), {
      baseUrl: "http://127.0.0.1:11434/v1",
      model: "qwen2.5",
    });
    expect(out.zh).toContain("ollama serve");
    expect(out.status).toBeUndefined();
  });

  it("附带模型/地址/原始报错，便于用户截图反馈", () => {
    const out = explainLLMError(apiError(402, "402 Payment Required"), {
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-v4-flash",
    });
    expect(out.status).toBe(402);
    expect(out.zh).toContain("deepseek-v4-flash");
    expect(out.zh).toContain("api.deepseek.com");
    expect(out.zh).toContain("402 Payment Required");
  });

  it("响应体里的输出上限报错会被读到（而不是只看被截断的 message）", () => {
    const out = explainLLMError(apiError(400, "could not finish the message"), { model: "m" });
    expect(out.zh).toContain("输出长度");
  });
});

describe("withLLMErrors（只做错误翻译，不做重试——重试是 SDK 的事）", () => {
  it("成功直接透传返回值", async () => {
    await expect(withLLMErrors(async () => "ok", {})).resolves.toBe("ok");
  });

  it("失败包成带双语的 LLMRequestError，API 路由据此回英文客户端", async () => {
    const err = await withLLMErrors(() => Promise.reject(apiError(401)), { model: "m" }).catch((e) => e);
    expect(err).toBeInstanceOf(LLMRequestError);
    expect(err.status).toBe(401);
    const pair = llmErrorPair(err);
    expect(pair.en).not.toBe(pair.zh);
  });

  it("用户主动取消不被改写成失败（前端据此区分取消与报错）", async () => {
    const abort = Object.assign(new Error("aborted"), { name: "AbortError" });
    await expect(withLLMErrors(() => Promise.reject(abort), {})).rejects.toBe(abort);
  });

  it("已经是 LLMRequestError 的不再二次包装", () => {
    const original = new LLMRequestError("中文", "english", 402);
    expect(toLLMRequestError(original, {})).toBe(original);
  });

  it("非 LLM 错误（解析失败等）双语同文，不丢信息", () => {
    expect(llmErrorPair(new Error("JSON 解析失败"))).toEqual({ zh: "JSON 解析失败", en: "JSON 解析失败" });
  });
});

describe("LLM_PRESETS（预设是新装用户的唯一入口，指向死端点就等于开箱不可用）", () => {
  it("推荐预设是 OpenRouter，且排在第一位", () => {
    expect(RECOMMENDED_PRESET).toBe(LLM_PRESETS[0]);
    expect(RECOMMENDED_PRESET.baseUrl).toContain("openrouter.ai");
  });

  it("只有真正免 Key 的本地 Ollama 才预填占位 Key", () => {
    expect(LLM_PRESETS.filter((p) => p.apiKey).map((p) => p.label)).toEqual(["Ollama 本地"]);
  });

  it("每个 tipKey 在中英文案里都存在（设置页是客户端渲染，缺键只会在用户点开时露出）", () => {
    for (const p of LLM_PRESETS) {
      if (!p.tipKey) continue;
      expect(settings.zh, `zh:${p.tipKey}`).toHaveProperty(p.tipKey);
      expect(settings.en, `en:${p.tipKey}`).toHaveProperty(p.tipKey);
    }
  });

  it("每个预设都填了 baseUrl 和模型名（缺一个都会在生成时才炸）", () => {
    for (const p of LLM_PRESETS) {
      expect(p.baseUrl, p.label).toMatch(/^https?:\/\//);
      expect(p.model.length, p.label).toBeGreaterThan(0);
    }
  });
});

describe("migrateSettings v6（老用户本地存的是七平台时代的配置，升级即自愈）", () => {
  const build = (over: Partial<SettingsState> & Record<string, unknown>) => migrateSettings(over);

  it("删掉已不存在的 providers / customModels，不把它们带进新状态", () => {
    const out = build({ providers: { "atlas-cloud": { apiKey: "k" } }, customModels: [{ id: "x" }] }) as SettingsState &
      Record<string, unknown>;
    expect(out.providers).toBeUndefined();
    expect(out.customModels).toBeUndefined();
  });

  it("旧目录的模型 id 重置为 Prism 默认，Prism 的 id 保留", () => {
    expect(build({ defaultVideoModel: "minimax/h3/image-to-video" }).defaultVideoModel).toBe("minimax-h3");
    expect(build({ defaultImageModel: "fal-ai/flux/dev" }).defaultImageModel).toBe("gpt-image-2");
    expect(build({ defaultVideoModel: "seedance2.5" }).defaultVideoModel).toBe("seedance2.5");
  });

  it("补齐 media 结构和图片质量默认值", () => {
    const out = build({});
    expect(out.media).toEqual({ apiKey: "", apiSecret: "" });
    expect(out.imageQuality).toBe("low");
  });

  it("借用已删除平台 Key 的配音配置整体停用，而不是留一个必然失败的开关", () => {
    const out = build({
      tts: { enabled: true, provider: "atlas", baseUrl: "b", apiKey: "k", model: "m", voice: "v", speed: 1 },
    } as unknown as Partial<SettingsState>);
    expect(out.tts.enabled).toBe(false);
    expect(out.tts.apiKey).toBe("");
    expect(out.tts.provider).toBe("openai");
  });

  it("正常的 OpenAI 兼容配音不动", () => {
    const tts = { enabled: true, provider: "openai", baseUrl: "b", apiKey: "k", model: "m", voice: "v", speed: 1 } as const;
    expect(build({ tts } as unknown as Partial<SettingsState>).tts).toEqual(tts);
  });

  it("失效的生产档位回落到 balanced", () => {
    expect(build({ activeProductionProfile: "ultra" as never }).activeProductionProfile).toBe("balanced");
    expect(build({ activeProductionProfile: "rapid" }).activeProductionProfile).toBe("rapid");
  });
});
