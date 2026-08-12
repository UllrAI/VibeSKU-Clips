/**
 * Storyboard film — "grid to full film" (九宫格→一键整片).
 *
 * Field-proven flow (2026-08 real-product test): feed the storyboard grid's
 * cropped cells as reference images into Seedance 2.5 reference-to-video with a
 * timecoded multi-shot prompt (@ImageN cites shot N's keyframe, dialogue is
 * assigned per segment) — the model cuts natively between shots, keeps the
 * person/product consistent across cuts, and speaks the lines verbatim with
 * continuous audio. One generation replaces N i2v calls + concat, and the
 * soundtrack never has splice seams.
 *
 * Pure functions only (prompt building + duration math); the route does the I/O.
 */
import type { Shot, ScriptCharacter } from "@/lib/db/schema";

/** Seedance 2.5 duration bounds (schema: integer 4-30 seconds) */
export const FILM_MIN_SECONDS = 4;
export const FILM_MAX_SECONDS = 30;

/** Shot-type labels for segment lines, zh/en */
const SHOT_TYPE_LABELS: Record<string, { zh: string; en: string }> = {
  hook: { zh: "钩子镜", en: "hook shot" },
  pain_point: { zh: "痛点镜", en: "pain-point shot" },
  product_reveal: { zh: "商品镜", en: "product shot" },
  demo: { zh: "演示镜", en: "demo shot" },
  social_proof: { zh: "背书镜", en: "social-proof shot" },
  cta: { zh: "转化镜", en: "CTA shot" },
};

const CJK_RE = /[一-鿿]/;

/** Raw total of the script's shot durations in seconds (not clamped) */
export function filmTotalSeconds(shots: Shot[]): number {
  return shots.reduce((sum, s) => sum + (Number.isFinite(s.duration) ? s.duration : 0), 0);
}

/** The integer duration actually submitted to the model: rounded sum clamped to 4..30 */
export function filmRequestSeconds(shots: Shot[]): number {
  return Math.min(FILM_MAX_SECONDS, Math.max(FILM_MIN_SECONDS, Math.round(filmTotalSeconds(shots))));
}

/** Trim trailing zeros: 3 -> "3", 7.5 -> "7.5" */
function fmtSec(x: number): string {
  return String(Number(x.toFixed(1)));
}

/**
 * Build the single-call multi-shot film prompt. Language follows the script:
 * any CJK in descriptions/voiceovers → Chinese, otherwise English (the model
 * speaks the dialogue verbatim, so the prompt must match the dialogue language).
 */
export function buildStoryboardFilmPrompt(shots: Shot[], characters?: ScriptCharacter[] | null): string {
  const zh = shots.some((s) => CJK_RE.test(`${s.description ?? ""}${s.voiceover ?? ""}`));
  const total = filmRequestSeconds(shots);
  // single named character → attribute dialogue to them; otherwise a generic on-camera creator
  const soloName = (characters ?? []).length === 1 ? (characters![0].name ?? "").trim() : "";
  const speaker = soloName || (zh ? "出镜人物" : "the on-camera creator");

  // timecode boundaries follow the script's own durations, proportionally scaled
  // onto the requested total so segments always tile the full film exactly
  const rawTotal = filmTotalSeconds(shots) || shots.length;
  const scale = total / rawTotal;
  let cursor = 0;
  const segments = shots.map((s, i) => {
    const start = cursor;
    const rawLen = Number.isFinite(s.duration) && s.duration > 0 ? s.duration : rawTotal / shots.length;
    cursor = i === shots.length - 1 ? total : Math.min(total, cursor + rawLen * scale);
    const label = SHOT_TYPE_LABELS[String(s.type)]?.[zh ? "zh" : "en"] ?? (zh ? "分镜" : "shot");
    const line = (s.voiceover ?? "").trim();
    if (zh) {
      const dialogue = line ? `台词（逐字说出）：「${line}」` : "（无台词，只保留环境音与动作声）";
      return `[${fmtSec(start)}-${fmtSec(cursor)}秒] 镜头${i + 1}（${label}，画面以 @图片${i + 1} 为基准）：${s.description ?? ""}。${dialogue}`;
    }
    const dialogue = line ? `Dialogue (spoken verbatim): "${line}"` : "(no dialogue — ambient and action sounds only)";
    return `[${fmtSec(start)}-${fmtSec(cursor)}s] Shot ${i + 1} (${label}, framing follows @Image${i + 1}): ${s.description ?? ""}. ${dialogue}`;
  });

  if (zh) {
    return [
      `竖屏 9:16 UGC 手机实拍感带货短视频，总时长约 ${total} 秒，共 ${shots.length} 个镜头，严格按下面的时间段硬切，一次生成整片。`,
      `全局一致性：所有镜头是同一支视频——同一人物、同一发型与同一身衣服、同一场景与光线方向；商品外观在所有镜头中保持完全一致。`,
      `有台词的镜头：${speaker}对着镜头自然说话，原声逐字说出该镜台词，口型与语速对齐，语气像日常聊天而不是播音腔；无台词的镜头不要出现说话声。`,
      `画面中不出现任何字幕、文字、编号或水印。`,
      `分镜（@图片N 是第 N 镜的画面基准，人物、场景与构图以其为准）：`,
      ...segments,
    ].join("\n");
  }
  return [
    `Vertical 9:16 UGC phone-shot style short video, about ${total} seconds total, ${shots.length} shots with hard cuts exactly at the timecodes below, generated as one continuous film.`,
    `Global consistency: every shot belongs to the same video — same person, same hair and outfit, same location and light direction; the product looks identical in every shot.`,
    `Shots with dialogue: ${speaker} talks to the camera naturally and speaks the lines verbatim with matching lip sync, casual everyday tone rather than announcer voice; shots without dialogue must contain no speech.`,
    `No captions, on-screen text, numbers or watermarks anywhere in the frame.`,
    `Shot list (@ImageN anchors shot N's framing — person, scene and composition follow it):`,
    ...segments,
  ].join("\n");
}
