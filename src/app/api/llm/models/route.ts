import { NextRequest, NextResponse } from "next/server";
import { errText } from "@/lib/api-error";
import { listModels } from "@/lib/llm-models";

/**
 * List the models an OpenAI-compatible endpoint exposes, so Settings can offer them instead of making
 * the user type a name from memory.
 *
 * Local Ollama is the case that forced this: `ollama pull qwen2.5:7b-instruct` installs a model whose
 * id carries a tag, while the preset ships the bare `qwen2.5`, and the only feedback was a 404
 * (issue #19 follow-up). Runs server-side because provider APIs block browser CORS.
 */
export async function POST(req: NextRequest) {
  try {
    const { baseUrl, apiKey } = await req.json();
    if (!baseUrl) {
      return NextResponse.json({ ok: false, error: errText(req, "缺少 baseUrl", "Missing baseUrl") }, { status: 400 });
    }
    const models = await listModels(String(baseUrl), String(apiKey || ""));
    if (models.length === 0) {
      return NextResponse.json({
        ok: false,
        models: [],
        error: errText(
          req,
          "读不到模型列表：请检查地址/Key 是否正确，本地 Ollama 需先 `ollama serve` 并 `ollama pull` 至少一个模型",
          "Could not read the model list: check the endpoint/key — a local Ollama needs `ollama serve` plus at least one `ollama pull`",
        ),
      });
    }
    return NextResponse.json({ ok: true, models });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      models: [],
      error: error instanceof Error ? error.message : errText(req, "读取失败", "Request failed"),
    });
  }
}
