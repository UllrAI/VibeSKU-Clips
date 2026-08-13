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
 * Dialogue-density check for native-voice generation (Seedance official guidance: overstuffed
 * lines break lip sync toward the end of a segment — the community guide cites ~12 words / 10s
 * for English). Our field E2E showed the model tolerates denser lines, so the thresholds below
 * only flag egregious overflow rather than enforcing the guide's strict budget: the script
 * engine already targets ~3 zh chars/sec, so 5 chars/sec (zh) and 2.6 words/sec (en) mean the
 * line physically cannot be spoken naturally inside its shot.
 */
export const DIALOGUE_MAX_ZH_CHARS_PER_SEC = 5;
export const DIALOGUE_MAX_EN_WORDS_PER_SEC = 2.6;

export interface DialogueDensityWarning {
  /** zero-based shot index */
  index: number;
  seconds: number;
  /** zh: CJK+word chars counted; en: whitespace-separated words */
  count: number;
  limit: number;
}

/** Flags shots whose voiceover is too dense to lip-sync inside its duration. Pure function. */
export function dialogueDensityWarnings(shots: Shot[]): DialogueDensityWarning[] {
  const out: DialogueDensityWarning[] = [];
  shots.forEach((s, index) => {
    const line = (s.voiceover ?? "").trim();
    const seconds = Number.isFinite(s.duration) && s.duration > 0 ? s.duration : 0;
    if (!line || seconds <= 0) return;
    if (CJK_RE.test(line)) {
      // count letter/digit/CJK chars only — punctuation takes no speaking time
      const count = Array.from(line).filter((c) => /[\p{L}\p{N}]/u.test(c)).length;
      const limit = Math.ceil(seconds * DIALOGUE_MAX_ZH_CHARS_PER_SEC);
      if (count > limit) out.push({ index, seconds, count, limit });
    } else {
      const count = line.split(/\s+/).filter(Boolean).length;
      const limit = Math.ceil(seconds * DIALOGUE_MAX_EN_WORDS_PER_SEC);
      if (count > limit) out.push({ index, seconds, count, limit });
    }
  });
  return out;
}

/**
 * Build the single-call multi-shot film prompt. Language follows the script:
 * any CJK in descriptions/voiceovers → Chinese, otherwise English (the model
 * speaks the dialogue verbatim, so the prompt must match the dialogue language).
 *
 * With refs.characterSheet the reference_images array leads with the presenter's
 * multi-view sheet, so @Image1 becomes the identity anchor and the shot keyframes
 * shift to @Image2..N+1 — the prompt's citations follow the same offset.
 */
export function buildStoryboardFilmPrompt(
  shots: Shot[],
  characters?: ScriptCharacter[] | null,
  refs?: { characterSheet?: boolean },
  opts?: {
    /**
     * Raw phone-shot texture block (default on — the film chain is UGC by design).
     * Pass false when a styled global look drives the visuals instead, so the
     * "ungraded phone footage" wording doesn't fight the styled look.
     */
    realism?: boolean;
  }
): string {
  const zh = shots.some((s) => CJK_RE.test(`${s.description ?? ""}${s.voiceover ?? ""}`));
  const total = filmRequestSeconds(shots);
  // single named character → attribute dialogue to them; otherwise a generic on-camera creator
  const soloName = (characters ?? []).length === 1 ? (characters![0].name ?? "").trim() : "";
  const speaker = soloName || (zh ? "出镜人物" : "the on-camera creator");
  // shot keyframes start at @Image1, or @Image2 when the character sheet leads the array
  const offset = refs?.characterSheet ? 1 : 0;

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
    const imgN = i + 1 + offset;
    // camera moves come from the script (LLM writes them with the e-commerce preset vocabulary,
    // or the user picks a preset per shot) — dropping them here would flatten every shot to a
    // static frame, so the film pass carries them through
    const cam = (s.camera ?? "").trim();
    // dialogue rides Seedance 2.5's official sound-bracket syntax: `{}` marks "lines to be
    // spoken aloud", separating them from scene description at the token level (the official
    // guide reserves () for music, <> for sound effects, {} for dialogue, 【】 for captions)
    if (zh) {
      const dialogue = line ? `台词（逐字说出）：{${line}}` : "（无台词，只保留环境音与动作声）";
      const camPart = cam ? `运镜：${cam}。` : "";
      return `[${fmtSec(start)}-${fmtSec(cursor)}秒] 镜头${i + 1}（${label}，画面以 @图片${imgN} 为基准）：${s.description ?? ""}。${camPart}${dialogue}`;
    }
    const dialogue = line ? `Dialogue (spoken verbatim): {${line}}` : "(no dialogue — ambient and action sounds only)";
    const camPart = cam ? `Camera: ${cam}. ` : "";
    return `[${fmtSec(start)}-${fmtSec(cursor)}s] Shot ${i + 1} (${label}, framing follows @Image${imgN}): ${s.description ?? ""}. ${camPart}${dialogue}`;
  });

  // material-binding statement (official rule: state the upload-order → role mapping up front —
  // it is the #1 stability factor once the reference count grows past a handful) doubling as the
  // official keyframe-order declaration for strict shot alignment
  const lastImg = shots.length + offset;
  const bindingZh = refs?.characterSheet
    ? `素材对应：@图片1 是出镜人物定妆照（仅作身份参考）；@图片2 至 @图片${lastImg} 依次为镜头1至镜头${shots.length}的关键帧，以此顺序作为各镜头的画面基准。`
    : `素材对应：@图片1 至 @图片${lastImg} 依次为镜头1至镜头${shots.length}的关键帧，以此顺序作为各镜头的画面基准。`;
  const bindingEn = refs?.characterSheet
    ? `Reference mapping: @Image1 is the presenter's reference sheet (identity only); @Image2 through @Image${lastImg} are the keyframes for shots 1-${shots.length} in order — use them as each shot's framing anchor in that order.`
    : `Reference mapping: @Image1 through @Image${lastImg} are the keyframes for shots 1-${shots.length} in order — use them as each shot's framing anchor in that order.`;

  // raw phone-shot texture block, all positive wording (the official guide: Seedance's negative
  // channel only covers captions/audio — visual negatives are placebos, so "ungraded" is stated
  // as what the image IS, not what to avoid). Skin stays at "natural, pores kept" — no flaw
  // stacking (the two-round A/B lesson: listed blemishes produce off-putting faces).
  const realism = opts?.realism !== false;
  const realismZh = `画质与质感：真实手机直出质感，色彩自然未调色、带混合色温；人物肤质自然真实、保留毛孔细节不磨皮；构图带轻微手持感。`;
  const realismEn = `Texture: raw ungraded phone-footage look with mixed color temperature; natural realistic skin with visible pores, no beauty smoothing; framing carries a slight handheld feel.`;

  if (zh) {
    return [
      `竖屏 9:16 UGC 手机实拍感带货短视频，总时长约 ${total} 秒，共 ${shots.length} 个镜头，严格按下面的时间段硬切，一次生成整片。`,
      bindingZh,
      `全局一致性：所有镜头是同一支视频——同一人物、同一发型与同一身衣服、同一场景与光线方向；商品外观在所有镜头中保持完全一致。`,
      refs?.characterSheet
        ? `@图片1 是出镜人物的四视图定妆照——全片人物的脸型、发型、体型与服装必须与其完全一致（定妆照只作人物参考，不作为任何分镜画面）。`
        : "",
      `有台词的镜头：${speaker}对着镜头自然说话，原声逐字说出该镜台词，口型与语速对齐，语气像日常聊天而不是播音腔；无台词的镜头不要出现说话声。`,
      realism ? realismZh : "",
      // caption ban (positive frame line) + the official negative channel, which covers exactly
      // captions and audio: on-screen text is AI video's #1 tell, and bgm belongs to the
      // composer's own mixing stage, not the generation
      `画面中不出现任何字幕、文字、编号或水印。不要字幕。`,
      `无bgm，只生成台词人声、环境音与动作音。`,
      `分镜（@图片N 是对应镜头的画面基准，人物、场景与构图以其为准）：`,
      ...segments,
    ]
      .filter(Boolean)
      .join("\n");
  }
  return [
    `Vertical 9:16 UGC phone-shot style short video, about ${total} seconds total, ${shots.length} shots with hard cuts exactly at the timecodes below, generated as one continuous film.`,
    bindingEn,
    `Global consistency: every shot belongs to the same video — same person, same hair and outfit, same location and light direction; the product looks identical in every shot.`,
    refs?.characterSheet
      ? `@Image1 is the presenter's four-view reference sheet — the person's face, hair, build and outfit must match it exactly throughout (identity reference only, never a shot frame).`
      : "",
    // non-Chinese dialogue needs an explicit language declaration (official 2.5 guidance)
    shots.some((s) => (s.voiceover ?? "").trim()) ? `Dialogue language: English.` : "",
    `Shots with dialogue: ${speaker} talks to the camera naturally and speaks the lines verbatim with matching lip sync, casual everyday tone rather than announcer voice; shots without dialogue must contain no speech.`,
    realism ? realismEn : "",
    `No captions, on-screen text, numbers or watermarks anywhere in the frame. No subtitles.`,
    `No bgm — only the spoken dialogue, ambient and action sounds.`,
    `Shot list (@ImageN anchors the corresponding shot's framing — person, scene and composition follow it):`,
    ...segments,
  ]
    .filter(Boolean)
    .join("\n");
}
