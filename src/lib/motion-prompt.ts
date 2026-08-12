/**
 * Motion-prompt engine for image-to-video (i2v) generation — the quality lever of the i2v main path.
 *
 * Why this exists: the script engine already writes a per-shot `camera` movement description
 * (推拉摇移 language), but the i2v call used to send the shot's STATIC image prompt instead —
 * scene wording with zero motion language, which yields bland or unpredictable movement.
 * i2v models (Seedance 2.0 family) take composition/subject from the first frame; the text
 * prompt's job is to direct MOTION: camera path + subject micro-action + stability constraints.
 *
 * Rules encoded here (commerce-specific):
 *  - Camera: prefer the script's own `camera` field; fall back to a per-shot-type default move.
 *  - Subject micro-action per shot type: bring the frame alive WITHOUT re-imagining the scene.
 *  - Product shots get hard fidelity constraints (i2v models notoriously warp printed text/logos).
 *  - Always close with stability/artifact constraints — cheap wins against flicker & morphing.
 *  - Bilingual: follows the script language (CJK → Chinese prompt, otherwise English), because
 *    overseas projects generate English scripts and mixing languages degrades model adherence.
 *
 * Pure functions, unit-testable, no I/O.
 */
import type { Shot } from "@/lib/db/schema";
import { REAL_FACE_CONSTRAINT } from "@/lib/presenters";

/** Camera-movement amplitude tier (Kling-style enumerated intensity instead of free text). */
export type MotionIntensity = "subtle" | "normal" | "strong";

export interface MotionPromptInput {
  /** Shot type drives the default camera move + subject micro-action */
  shotType?: Shot["type"] | string;
  /** The script engine's camera movement description (e.g. "特写 + 缓慢推近"); preferred over defaults */
  camera?: string;
  /** Short scene description used as a semantic anchor (truncated; the first frame already fixes the scene) */
  description?: string;
  /** Apply product-fidelity constraints (product visible in frame — logo/text must not warp) */
  productShot?: boolean;
  /**
   * Keyframe-chained generation (the Dreamina-style first/last-frame pattern): the clip's last
   * frame is pinned to the NEXT shot's keyframe, so the shot ends by flowing into the next scene —
   * the transition is generated inside the clip and the composer's hard concat becomes seamless.
   */
  chainToNext?: boolean;
  /** Camera amplitude tier; "normal" (default) keeps the baseline wording unchanged */
  intensity?: MotionIntensity;
  /**
   * A cast character is on camera in this shot: append the anti-"AI face" realism
   * constraint so the model renders an ordinary person, not a polished influencer face.
   */
  personShot?: boolean;
  /**
   * The on-camera character is SPEAKING this shot (has a voiceover line): replace the
   * generic micro-action with talking direction (mouth movement, blinks, one micro-pause)
   * plus two behavior beats. Beats rotate per shot via `beatSeed` — repeating the same
   * gestures across a batch is the biggest AI tell.
   */
  talking?: boolean;
  /** Deterministic seed (e.g. shot index) picking which two behavior beats this shot gets */
  beatSeed?: number;
  /**
   * Global visual-look lighting anchor (see look-presets.ts): a SHORT bilingual line that
   * pins the lighting/palette through the i2v pass — i2v models drift lighting when
   * unspecified, which breaks look consistency across chained shots.
   */
  look?: { zh: string; en: string };
}

/** True when the text contains CJK characters (used to pick the prompt language). */
function hasCjk(s: string): boolean {
  return /[一-鿿぀-ヿ가-힯]/.test(s);
}

/** Per-shot-type default camera move — used only when the script didn't provide one. */
const CAMERA_DEFAULTS: Record<string, { zh: string; en: string }> = {
  hook: { zh: "镜头快速推近主体，开场抓眼", en: "camera pushes in fast on the subject, punchy opening" },
  pain_point: { zh: "镜头缓慢推近，带轻微手持感", en: "slow push-in with a subtle handheld feel" },
  product_reveal: { zh: "镜头围绕商品缓慢环绕移动，高光沿商品表面流动", en: "camera orbits the product slowly, highlights sweeping across its surface" },
  demo: { zh: "镜头平稳跟随演示动作，适时贴近特写细节", en: "camera smoothly follows the demonstration, moving in for close-up details" },
  social_proof: { zh: "镜头缓慢横移扫过画面", en: "slow lateral tracking shot across the scene" },
  cta: { zh: "镜头缓慢推近，聚焦主体", en: "slow push-in, focusing on the subject" },
};

const CAMERA_FALLBACK = { zh: "镜头缓慢推近主体", en: "slow push-in on the subject" };

/** Per-shot-type subject micro-action — animates the still frame without re-imagining the scene. */
const ACTION_DEFAULTS: Record<string, { zh: string; en: string }> = {
  hook: { zh: "画面主体动态醒目、能量感强", en: "the subject moves eye-catchingly with high energy" },
  pain_point: { zh: "人物与环境自然轻微动作，情绪真实", en: "people and surroundings move subtly and naturally, authentic mood" },
  product_reveal: { zh: "商品保持静置不动，仅光影流动与镜头移动，突出材质质感", en: "the product itself stays still; only light and camera move, emphasizing material texture" },
  demo: { zh: "手部演示动作自然连贯", en: "hands demonstrate naturally and continuously" },
  social_proof: { zh: "画面元素自然微动，生活气息真实", en: "scene elements drift subtly, believable everyday atmosphere" },
  cta: { zh: "主体稳定醒目，画面收束聚焦", en: "the subject stays prominent and stable as the frame settles" },
};

const ACTION_FALLBACK = { zh: "画面自然生动，主体动作连贯", en: "the scene comes alive naturally with coherent subject motion" };

/**
 * Talking-shot subject direction — replaces the per-type micro-action when the character
 * speaks. Written as visible speech behavior (mouth movement, blinks, one beat of hesitation),
 * NOT lip-sync to specific words: the voice track is TTS overlaid by the composer, so the clip
 * only needs to read as "a person mid-conversation".
 */
const TALKING_ACTION = {
  zh: "人物对着镜头自然说话：口型自然开合，自然眨眼与头部微动，说到一半有一次极短的停顿、一次视线短暂离开镜头再回来",
  en: "the person talks naturally to camera: natural mouth movement, blinks and small head motions, one brief mid-sentence pause, eyes drift away once and return",
};

/**
 * Behavior-beat pool for talking shots. Each shot gets two, rotated by beatSeed —
 * identical gestures repeated across a batch read as AI immediately.
 */
const BEHAVIOR_BEATS: { zh: string; en: string }[] = [
  { zh: "说话间瞥了一眼旁边", en: "glances off to the side mid-sentence" },
  { zh: "身体往后靠了一下又坐直", en: "leans back briefly, then settles forward again" },
  { zh: "轻轻耸了下肩", en: "gives a small shrug" },
  { zh: "换了一只手拿东西", en: "switches the object to the other hand" },
  { zh: "被画外的动静吸引看了一眼", en: "gets briefly distracted by something off-screen" },
  { zh: "说完自己先半笑了一下", en: "breaks into a half-smile at their own words" },
];

/** Pick two distinct behavior beats deterministically from the seed (adjacent picks avoid repeats). */
export function pickBehaviorBeats(seed: number, lang: "zh" | "en"): string[] {
  const n = BEHAVIOR_BEATS.length;
  const i = ((Math.floor(seed) % n) + n) % n;
  const j = (i + 1 + (((Math.floor(seed / n) % (n - 1)) + (n - 1)) % (n - 1))) % n;
  return [BEHAVIOR_BEATS[i][lang], BEHAVIOR_BEATS[j][lang]];
}

/** Product-fidelity constraint (printed text & logos are the first thing i2v models destroy). */
const PRODUCT_CONSTRAINT = {
  zh: "商品的外观、包装、颜色、logo 与文字必须保持完全不变，文字清晰不扭曲变形",
  en: "the product's appearance, packaging, colors, logo and printed text must remain exactly unchanged, text stays sharp and undistorted",
};

/** Universal stability/artifact tail — cheap, consistent win against flicker and morphing. */
const QUALITY_TAIL = {
  zh: "画面稳定流畅，光影自然过渡，无闪烁、无变形、不出现新物体",
  en: "stable smooth footage, natural lighting transitions, no flicker, no morphing, no new objects appearing",
};

/** Chained-clip guidance: direct the in-clip transition toward the pinned last frame. */
const CHAIN_GUIDANCE = {
  zh: "镜头在结尾自然运镜过渡到指定的尾帧画面，过渡连贯流畅、一气呵成，不跳切",
  en: "the camera moves naturally into the specified last frame at the end, one continuous fluent transition, no jump cut",
};

/**
 * Continuous-single-take declaration (Seedance official guidance: without it the model may cut
 * mid-clip, which breaks per-shot semantics — each of our clips must be exactly one take).
 * Mutually exclusive with CHAIN_GUIDANCE: a chained clip ends by transitioning INTO the next
 * scene, so "no scene changes" would contradict the chain instruction.
 */
const SINGLE_SHOT = {
  zh: "整段为连续单镜头拍摄，中途不切镜、不转场",
  en: "one continuous single take throughout, no cuts, no scene changes",
};

/**
 * Sound direction for audio-capable models (Seedance 2.0 generates audio; unspecified audio tends
 * toward random speech). Speech always comes from our TTS voice-over — clip audio must stay
 * ambient-only, since the composer surfaces native audio on shots WITHOUT a voice-over track.
 */
const SOUND_DIRECTION = {
  zh: "音效：自然环境音与动作音效贴合画面，无人声说话",
  en: "sound: natural ambient and action sound effects matching the scene, no speech",
};

/** Camera amplitude wording per intensity tier ("normal" keeps the baseline prompt unchanged). */
const INTENSITY_LINES: Record<Exclude<MotionIntensity, "normal">, { zh: string; en: string }> = {
  subtle: { zh: "运镜幅度轻微克制，移动缓慢平稳", en: "camera movement stays subtle and restrained, slow and steady" },
  strong: { zh: "运镜幅度大胆明显，节奏利落有冲击力", en: "bold pronounced camera movement, brisk impactful pacing" },
};

/** Camera-hold keywords (a locked-off camera instruction). */
const STATIC_CAMERA_RE = /固定|静止|锁定|不动|fixed|static|locked/i;
/** Continuous camera-movement keywords. */
const MOVING_CAMERA_RE =
  /环绕|环拍|推近|推进|拉远|拉近|横移|平移|摇镜|摇臂|甩镜|跟随|跟拍|升降|俯冲|orbit|push[- ]?in|pull[- ]?back|dolly|pan|tilt|track|crane|zoom|whip/i;
/** Sequencing markers that legitimise combining hold + move (e.g. "推近后固定" = push in, then hold). */
const SEQUENCE_RE = /先|后|然后|随后|接着|再|最后|结尾|开场|开头|then|after|before|finally|ending|start/i;

/**
 * Conflict lint for scripted camera text (Seedance docs: contradictory instructions like
 * "固定镜头" + "环绕" in one prompt produce jerky, indecisive motion). A hold + move combo is a
 * conflict ONLY without a sequencing marker — "push in then hold" is valid direction.
 */
export function hasCameraConflict(camera: string): boolean {
  return STATIC_CAMERA_RE.test(camera) && MOVING_CAMERA_RE.test(camera) && !SEQUENCE_RE.test(camera);
}

/** Max chars of the scene description kept as a semantic anchor (the first frame already fixes composition). */
const DESC_ANCHOR_MAX = 60;

/**
 * Build the i2v motion prompt for a shot. The camera line leads (motion is the message),
 * followed by subject action, an optional short scene anchor, fidelity constraints for product
 * shots, and the stability tail. Language follows the script (camera/description text).
 */
export function buildMotionPrompt(input: MotionPromptInput): string {
  const probe = `${input.camera ?? ""}${input.description ?? ""}`;
  // Empty inputs default to Chinese (domestic-first product)
  const lang: "zh" | "en" = probe && !hasCjk(probe) ? "en" : "zh";
  const type = String(input.shotType ?? "");

  // Conflict lint: a self-contradictory scripted camera (hold + move, no sequencing) would yield
  // jerky indecisive motion — fall back to the shot type's single known-good instruction instead
  const scripted = input.camera?.trim();
  const camera =
    scripted && !hasCameraConflict(scripted) ? scripted : (CAMERA_DEFAULTS[type] ?? CAMERA_FALLBACK)[lang];
  // a speaking character overrides the per-type micro-action: the shot must read as
  // "mid-conversation", with two rotating behavior beats against batch-level repetition
  const action = input.talking
    ? `${TALKING_ACTION[lang]}${lang === "zh" ? "；" : "; "}${pickBehaviorBeats(input.beatSeed ?? 0, lang).join(lang === "zh" ? "、" : ", ")}`
    : (ACTION_DEFAULTS[type] ?? ACTION_FALLBACK)[lang];
  const anchor = (input.description ?? "").trim().slice(0, DESC_ANCHOR_MAX);
  const intensity = input.intensity && input.intensity !== "normal" ? INTENSITY_LINES[input.intensity][lang] : undefined;

  const parts: string[] = [];
  if (lang === "zh") {
    parts.push(`运镜：${camera}`);
    if (intensity) parts.push(intensity);
    parts.push(`画面动态：${action}`);
    if (anchor) parts.push(`场景：${anchor}`);
    if (input.look) parts.push(`光线：${input.look.zh}`);
    // chained clip: CHAIN_GUIDANCE already demands one continuous move; SINGLE_SHOT's
    // "no scene changes" would contradict the transition into the next keyframe
    parts.push(input.chainToNext ? CHAIN_GUIDANCE.zh : SINGLE_SHOT.zh);
    if (input.personShot) parts.push(REAL_FACE_CONSTRAINT.zh);
    if (input.productShot) parts.push(PRODUCT_CONSTRAINT.zh);
    parts.push(SOUND_DIRECTION.zh);
    parts.push(QUALITY_TAIL.zh);
    return parts.join("。") + "。";
  }
  parts.push(`Camera: ${camera}`);
  if (intensity) parts.push(intensity);
  parts.push(`Motion: ${action}`);
  if (anchor) parts.push(`Scene: ${anchor}`);
  if (input.look) parts.push(`Lighting: ${input.look.en}`);
  parts.push(input.chainToNext ? CHAIN_GUIDANCE.en : SINGLE_SHOT.en);
  if (input.personShot) parts.push(REAL_FACE_CONSTRAINT.en);
  if (input.productShot) parts.push(PRODUCT_CONSTRAINT.en);
  parts.push(SOUND_DIRECTION.en);
  parts.push(QUALITY_TAIL.en);
  return parts.join(". ") + ".";
}
