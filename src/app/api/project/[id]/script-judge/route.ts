import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { scripts } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { buildJudgePrompt, parseJudgeResponse, type JudgeShotInput } from "@/lib/script-judge";
import { styleNameMap } from "@/lib/script-engine/prompts";
import { reasoningParams } from "@/lib/script-engine/generator";
import { createLLMClient, withLLMErrors, llmErrorPair } from "@/lib/llm-error";
import { apiError, errText } from "@/lib/api-error";

/**
 * POST /api/project/[id]/script-judge — the judge panel: tear the lines apart
 * BEFORE any generation money is spent.
 *
 * One LLM call runs four narrow judges (pacing / spoken-voice / freshness /
 * structure — the voice judge rules by the same SPOKEN_VOICE_RULES injected at
 * generation time) over the script's per-shot voiceover lines, and returns
 * per-judge issues plus length-preserving rewrites. Applying rewrites is the
 * client's move via the existing scripts PATCH (shotTexts) channel — this route
 * never mutates the script.
 *
 * body: { scriptId, llmConfig: { baseUrl, apiKey, model } }
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { scriptId, llmConfig } = body as {
      scriptId?: string;
      llmConfig?: { baseUrl?: string; apiKey?: string; model?: string };
    };
    if (!scriptId) return apiError(req, "缺少 scriptId", "Missing scriptId", 400);
    if (!llmConfig?.model) {
      return apiError(req, "缺少 LLM 配置，请先在设置中配置", "Missing LLM config — set it up in settings first", 400);
    }

    const db = getDb();
    const [script] = await db
      .select()
      .from(scripts)
      .where(and(eq(scripts.id, scriptId), eq(scripts.projectId, id)));
    if (!script) return apiError(req, "脚本不存在", "Script not found", 404);

    const shots: JudgeShotInput[] = (Array.isArray(script.shots) ? script.shots : [])
      .filter((s) => typeof s.voiceover === "string" && s.voiceover.trim())
      .map((s) => ({ shotId: s.shotId, voiceover: s.voiceover.trim() }));
    if (shots.length === 0) {
      return apiError(req, "该脚本没有台词可评审", "This script has no voiceover lines to judge", 400);
    }

    const styleLabel = script.styleType ? styleNameMap[script.styleType] : undefined;
    const prompt = buildJudgePrompt(shots, { styleLabel });

    const client = createLLMClient({
      baseUrl: llmConfig.baseUrl ?? "",
      apiKey: llmConfig.apiKey ?? "",
      model: llmConfig.model,
    });
    const response = await withLLMErrors(
      () =>
        client.chat.completions.create({
          model: llmConfig.model!,
          messages: [{ role: "user", content: prompt }],
          // judges must be harsh and consistent, not creative — keep temperature low
          temperature: 0.3,
          max_tokens: 8000,
          ...reasoningParams(llmConfig.baseUrl ?? ""),
        }),
      { baseUrl: llmConfig.baseUrl ?? "", apiKey: llmConfig.apiKey ?? "", model: llmConfig.model }
    );
    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error(errText(req, "判官团未返回内容", "The judge panel returned nothing"));

    const report = parseJudgeResponse(content, shots);
    return NextResponse.json(report);
  } catch (error) {
    console.error("判官团评审失败:", error);
    const { zh, en } = llmErrorPair(error);
    return NextResponse.json(
      { error: errText(req, zh || "判官团评审失败", en || "Judge panel failed") },
      { status: 500 }
    );
  }
}
