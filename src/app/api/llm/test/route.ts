import { NextRequest, NextResponse } from "next/server";
import { errText } from "@/lib/api-error";
import { explainLLMStatus, isLegacyPollinations } from "@/lib/llm-error";

/**
 * Server-side LLM connection test.
 * Must run server-side: direct browser requests to provider APIs are blocked by CORS, causing a false "connection failed" error even when the API key is valid.
 *
 * 传了 model 时做「模型级」校验：真实调一次 chat/completions（max_tokens=1，成本可忽略），
 * 能一次性暴露 baseUrl / Key / 模型名三类填写错误。只验 GET /models 的旧探针对「模型名不存在」
 * 完全无感——历史预设写过失效模型名，用户看到"连接成功"、生成脚本才炸（issue #12）。
 * 未传 model 时退回旧行为（GET /models 验 Key）。
 */
export async function POST(req: NextRequest) {
  try {
    const { baseUrl, apiKey, model } = await req.json();
    if (!baseUrl || !apiKey) {
      return NextResponse.json({ ok: false, error: errText(req, "缺少 baseUrl 或 apiKey", "Missing baseUrl or apiKey") }, { status: 400 });
    }

    const base = String(baseUrl).replace(/\/$/, "");

    // 已停用的 Pollinations 免 Key 地址：1 token 的探针偶尔还能过（匿名池对超小请求偶发放行），
    // 但真正生成脚本的大请求必 402——这正是 issue #19 用户"测试连接显示正常、一生成就报错"的来源。
    // 已知失效的端点直接判失败并指路，不给这种假绿灯。
    if (isLegacyPollinations(base)) {
      const { zh, en } = explainLLMStatus(402, { baseUrl: base, model });
      return NextResponse.json({ ok: false, status: 402, error: errText(req, zh, en) });
    }

    let resp: Response;
    if (model) {
      resp = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "hi" }], max_tokens: 1 }),
        signal: AbortSignal.timeout(15000),
      });
    } else {
      resp = await fetch(`${base}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(15000),
      });
    }

    if (resp.ok) {
      return NextResponse.json({ ok: true });
    }
    const text = await resp.text().catch(() => "");
    // 可行动的提示与生成路径共用同一套文案（lib/llm-error），原始响应片段附后便于截图排查。
    // 这样"测试连接"说的话和真正生成脚本时报的错完全一致——issue #19 用户正是在两处看到不同说法而无从下手。
    const { zh, en } = explainLLMStatus(resp.status, { baseUrl: base, model });
    const hint = errText(req, zh, en);
    return NextResponse.json({
      ok: false,
      status: resp.status,
      error: `${hint} · ${resp.status} ${resp.statusText}${text ? ` - ${text.slice(0, 200)}` : ""}`,
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : errText(req, "连接失败", "Connection failed"),
    });
  }
}
