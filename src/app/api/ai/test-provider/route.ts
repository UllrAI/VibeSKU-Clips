import { NextRequest, NextResponse } from "next/server";
import { PRISM_DEFAULT_BASE_URL } from "@/lib/providers/prism";

/**
 * Check whether a Prism key/secret pair works, without generating anything.
 *
 * The probe reads a task id that cannot exist: authentication is evaluated first, so a valid pair
 * answers 404 ("no such task") and an invalid one answers 401. Nothing is created and nothing is
 * billed. Run server-side so the browser's CORS policy cannot turn a working key into a red cross.
 *
 * Three outcomes, and the distinction matters: `invalid` is worth blocking on, `unknown` is not —
 * a network hiccup must never stop someone from trying a generation that would have worked.
 */

const PROBE_TASK_ID = "00000000-0000-4000-8000-000000000000";
const PROBE_TIMEOUT_MS = 10000;

export async function POST(req: NextRequest) {
  let body: { apiKey?: string; apiSecret?: string; baseUrl?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* empty body */
  }
  const { apiKey, apiSecret, baseUrl } = body;
  if (!apiKey || !apiSecret) {
    return NextResponse.json({ status: "invalid", message: "缺少 API Key 或 Secret" }, { status: 400 });
  }

  const base = (baseUrl?.trim() || PRISM_DEFAULT_BASE_URL).replace(/\/+$/, "");
  try {
    const response = await fetch(`${base}/tasks/${PROBE_TASK_ID}`, {
      headers: { "X-API-Key": apiKey, "X-API-Secret": apiSecret },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    if (response.status === 401 || response.status === 403) {
      return NextResponse.json({ status: "invalid", message: "Key 或 Secret 无效" });
    }
    // 404 is the expected success shape: the credentials passed and the task genuinely is not there.
    if (response.ok || response.status === 404) {
      return NextResponse.json({ status: "ok", message: "连接正常" });
    }
    return NextResponse.json({ status: "unknown", message: `无法判定（HTTP ${response.status}），可直接试生成` });
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    return NextResponse.json({ status: "unknown", message: timedOut ? "超时，无法判定" : "网络异常，无法判定" });
  }
}
