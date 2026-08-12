/**
 * Judge panel — a four-judge adversarial pass over script voiceover lines,
 * run BEFORE any money is spent on generation.
 *
 * The UGC methodology this encodes: video models render a bad script exactly as
 * pretty as a good one, so the script must be torn apart first — by narrow,
 * bad-tempered specialists, not one generalist reviewer. Four judges, each
 * owning exactly one axis (retention pacing / spoken-not-written voice /
 * freshness / structure), one LLM call for all four, plus rewrites that keep
 * meaning, selling points and — critically — line LENGTH (voiceover duration is
 * pinned to shot duration by TTS).
 *
 * Pure functions: prompt building + response parsing/clamping. The route does I/O.
 */
import { SPOKEN_VOICE_RULES } from "@/lib/presenters";
import { extractJSON } from "@/lib/script-engine/generator";

export const JUDGE_IDS = ["pace", "voice", "idea", "structure"] as const;
export type JudgeId = (typeof JUDGE_IDS)[number];

/** Judge display metadata (zh/en) for the report UI. */
export const JUDGE_META: Record<JudgeId, { zh: string; en: string }> = {
  pace: { zh: "节奏官", en: "Pacing judge" },
  voice: { zh: "口语官", en: "Voice judge" },
  idea: { zh: "创意官", en: "Freshness judge" },
  structure: { zh: "结构官", en: "Structure judge" },
};

export interface JudgeIssue {
  shotId?: number;
  issue: string;
}
export interface JudgeVerdict {
  judge: JudgeId;
  issues: JudgeIssue[];
}
export interface JudgeRewrite {
  shotId: number;
  voiceover: string;
}
export interface JudgeReport {
  verdicts: JudgeVerdict[];
  rewrites: JudgeRewrite[];
  summary?: string;
}

/** Minimal shot view the judges need (id + the spoken line). */
export interface JudgeShotInput {
  shotId: number;
  voiceover: string;
}

/** True when the text contains CJK characters (rewrite-language pick). */
function hasCjk(s: string): boolean {
  return /[一-鿿぀-ヿ가-힯]/.test(s);
}

/**
 * Build the single-call judge-panel prompt. All four judges rule in one
 * response; rewrites must keep meaning/claims and stay within ±20% of the
 * original length so TTS timing still fits the shot slots.
 */
export function buildJudgePrompt(shots: JudgeShotInput[], opts: { styleLabel?: string } = {}): string {
  const lines = shots.map((s) => `- shotId ${s.shotId}：「${s.voiceover}」`);
  const english = shots.length > 0 && shots.every((s) => !hasCjk(s.voiceover));
  return [
    `你是一支短视频台词「判官团」，由四位只管一件事、脾气很差的审稿人组成。任务：把下面这条${opts.styleLabel ? `（${opts.styleLabel}风格）` : ""}视频的逐镜台词撕碎，再给出重写。`,
    ``,
    `四位判官（每位只从自己的角度挑刺，宁狠勿宽）：`,
    `1. 节奏官（pace）：只管留人。第一句钩不住人=死刑；每句必须让人想听下一句；信息密度低、又长又绕的句子全部点名。`,
    `2. 口语官（voice）：只管「说的不是写的」。判准如下（铁律）：`,
    SPOKEN_VOICE_RULES,
    `3. 创意官（idea）：只管新鲜感。套路化开头、用烂的梗、任何同类视频都会说的通用表达，全部点名。`,
    `4. 结构官（structure）：只管递进与收束。铺垫→递进→收束是否成立；结尾落金句/讲道理=违规；行动号召口号化=违规。`,
    ``,
    `逐镜台词：`,
    ...lines,
    ``,
    `只输出 JSON，格式：`,
    `{"verdicts":[{"judge":"pace","issues":[{"shotId":1,"issue":"挑刺内容"}]},{"judge":"voice","issues":[]},{"judge":"idea","issues":[]},{"judge":"structure","issues":[]}],"rewrites":[{"shotId":1,"voiceover":"重写后的台词"}],"summary":"一句话总评"}`,
    ``,
    `重写规则：`,
    `- 保留原意、卖点与所有事实性说法，只改「怎么说」；不新增任何功效/价格承诺（广告合规红线）`,
    `- 重写后的台词必须像「说出来的」，且长度与原句相当（字数差控制在 ±20%，配音时长钉死在分镜槽里）`,
    `- 没毛病的镜头不要出现在 rewrites 里；四位判官都没意见就各自给空 issues`,
    english ? `- All issues and rewrites in English (the script is English).` : ``,
  ]
    .filter((l) => l !== undefined)
    .join("\n");
}

/** Clamp one issue list: keep only entries with usable text; shotId must exist when given. */
function clampIssues(raw: unknown, validShots: Set<number>): JudgeIssue[] {
  if (!Array.isArray(raw)) return [];
  const out: JudgeIssue[] = [];
  for (const it of raw) {
    const issue = typeof (it as { issue?: unknown })?.issue === "string" ? (it as { issue: string }).issue.trim() : "";
    if (!issue) continue;
    const sid = (it as { shotId?: unknown }).shotId;
    const shotId = typeof sid === "number" && validShots.has(sid) ? sid : undefined;
    out.push(shotId === undefined ? { issue } : { shotId, issue });
  }
  return out;
}

/**
 * Parse + clamp the LLM's judge response. Unknown judges are dropped, missing
 * judges get empty issue lists (the UI renders all four), rewrites are kept only
 * for real shots with non-empty lines within a sane length ratio of the
 * original (0.4x–2.5x — beyond that the TTS timing breaks and the "rewrite"
 * likely lost or invented content).
 */
export function parseJudgeResponse(content: string, shots: JudgeShotInput[]): JudgeReport {
  const validShots = new Set(shots.map((s) => s.shotId));
  const lenByShot = new Map(shots.map((s) => [s.shotId, s.voiceover.trim().length]));
  let raw: unknown;
  try {
    raw = JSON.parse(extractJSON(content));
  } catch {
    throw new Error("判官团返回的不是合法 JSON");
  }

  const rawVerdicts = Array.isArray((raw as { verdicts?: unknown })?.verdicts)
    ? ((raw as { verdicts: unknown[] }).verdicts as unknown[])
    : [];
  const byJudge = new Map<JudgeId, JudgeIssue[]>();
  for (const v of rawVerdicts) {
    const judge = (v as { judge?: unknown })?.judge;
    if (typeof judge !== "string" || !(JUDGE_IDS as readonly string[]).includes(judge)) continue;
    byJudge.set(judge as JudgeId, clampIssues((v as { issues?: unknown }).issues, validShots));
  }
  const verdicts: JudgeVerdict[] = JUDGE_IDS.map((id) => ({ judge: id, issues: byJudge.get(id) ?? [] }));

  const rawRewrites = Array.isArray((raw as { rewrites?: unknown })?.rewrites)
    ? ((raw as { rewrites: unknown[] }).rewrites as unknown[])
    : [];
  const rewrites: JudgeRewrite[] = [];
  const seen = new Set<number>();
  for (const r of rawRewrites) {
    const shotId = (r as { shotId?: unknown })?.shotId;
    const voiceover =
      typeof (r as { voiceover?: unknown })?.voiceover === "string" ? (r as { voiceover: string }).voiceover.trim() : "";
    if (typeof shotId !== "number" || !validShots.has(shotId) || !voiceover || seen.has(shotId)) continue;
    const origLen = lenByShot.get(shotId) ?? 0;
    if (origLen > 0) {
      const ratio = voiceover.length / origLen;
      if (ratio < 0.4 || ratio > 2.5) continue;
    }
    seen.add(shotId);
    rewrites.push({ shotId, voiceover });
  }

  const summary = typeof (raw as { summary?: unknown })?.summary === "string" ? (raw as { summary: string }).summary.trim() : undefined;
  return { verdicts, rewrites, summary: summary || undefined };
}
