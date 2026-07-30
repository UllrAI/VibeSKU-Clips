/**
 * Ad templates — named end-to-end "finished video" recipes, borrowed from
 * Higgsfield Ads (~30 product-image→ad templates like "Rotating product shot" /
 * "Lifestyle showcase") and Liblib's template-card syntax (selling-point title,
 * one-line pitch, pick-and-go).
 *
 * ClipForge's three template systems were fragmented (style packs = compose only,
 * script templates = shot structure only, category templates = few-shot only).
 * An AdTemplate is the missing bundle across the WHOLE pipeline:
 *   script style + video mode  → pre-fills the new-project form
 *   camera plan (preset ids)   → injected into the script LLM as per-shot-type direction
 *   visual look (preset id)    → applied as the global look for keyframes + i2v
 *   compose recipe             → pre-fills the video-page config (StylePackCompose shape)
 *
 * Selection is persisted per project in localStorage (`clipforge-ad-template:<projectId>`),
 * matching the existing convention that template state lives client-side
 * (ScriptTemplate store is localStorage too) — no DB migration needed.
 *
 * Pure data + pure functions. Names/taglines are bilingual data, not i18n keys
 * (same convention as BUILTIN_STYLE_PACKS / camera-presets / look-presets).
 */
import type { Shot } from "@/lib/db/schema";
import type { StylePackCompose } from "@/lib/style-packs";
import { getCameraPreset } from "@/lib/camera-presets";
import { getLookPreset } from "@/lib/look-presets";

export interface AdTemplate {
  id: string;
  /** Card emoji — the OSS stand-in for Higgsfield's looping video preview */
  emoji: string;
  name: { zh: string; en: string };
  /** One-line selling-point pitch (Liblib card syntax: benefits in the title) */
  tagline: { zh: string; en: string };
  /** Script style — UI form value (new-project styleOptions vocabulary, pre-normalizeStyle) */
  styleType: string;
  /** Video mode (VIDEO_MODE_DIRECTIVES key) */
  videoMode: "product_closeup" | "graphic_montage" | "scene_demo" | "live_presenter";
  /** Global visual look (look-presets id) applied on selection */
  look: string;
  /** Camera preset id per shot type — becomes script-LLM direction, user can still override per shot */
  cameraPlan: Partial<Record<Shot["type"], string>>;
  /** Compose-stage recipe (video-page config pre-fill, StylePackCompose shape) */
  compose: StylePackCompose;
  /** Extra one-line creative direction appended to the script prompt */
  scriptHint: { zh: string };
}

export const AD_TEMPLATES: AdTemplate[] = [
  {
    id: "turntable_hero",
    emoji: "💎",
    name: { zh: "转台大片", en: "Turntable Hero" },
    tagline: { zh: "影棚转台+微距质感，高客单价商品首选", en: "Studio turntable + macro texture, built for premium products" },
    styleType: "pain-point",
    videoMode: "product_closeup",
    look: "studio_product",
    cameraPlan: { hook: "crash_push", product_reveal: "lazy_susan", demo: "macro_glide", cta: "hero_rise" },
    compose: { captionPreset: "bold", bgm: "upbeat", bgmDuck: true, quality: "hd", productCard: true },
    scriptHint: { zh: "整体走高级影棚质感路线，突出材质细节与工艺感，文案克制有分量" },
  },
  {
    id: "lifestyle_seed",
    emoji: "🌿",
    name: { zh: "生活场景种草", en: "Lifestyle Seeding" },
    tagline: { zh: "真实生活氛围软种草，不硬广更耐看", en: "Authentic everyday vibes — soft-sell that doesn't feel like an ad" },
    styleType: "scenario",
    videoMode: "scene_demo",
    look: "warm_life",
    cameraPlan: { hook: "pov_walk", pain_point: "handheld_real", demo: "follow_track", cta: "slow_push" },
    compose: { captionPreset: "standard", bgm: "chill", bgmDuck: true, productCard: true },
    scriptHint: { zh: "像朋友分享日常一样自然，把商品融进真实生活场景，避免促销腔" },
  },
  {
    id: "unboxing_beat",
    emoji: "📦",
    name: { zh: "开箱节奏", en: "Unboxing Beat" },
    tagline: { zh: "甩镜开场+俯拍上手，节奏利落的开箱感", en: "Whip-pan open + top-down hands-on, snappy unboxing pacing" },
    styleType: "unboxing",
    videoMode: "product_closeup",
    look: "daylight_clean",
    cameraPlan: { hook: "whip_pan", product_reveal: "orbit_slow", demo: "overhead_top", cta: "push_then_hold" },
    compose: { captionPreset: "bold", bgm: "energetic", bgmDuck: true, productCard: true },
    scriptHint: { zh: "开箱动作干脆利落，逐层展示有惊喜感；建议关键镜头换成实拍上手画面更合规" },
  },
  {
    id: "presenter_talk",
    emoji: "🎤",
    name: { zh: "达人口播", en: "Presenter Talk" },
    tagline: { zh: "素人主播直给口播+逐字卡拉OK字幕", en: "Ordinary-person presenter straight talk + karaoke captions" },
    styleType: "talking_head",
    videoMode: "live_presenter",
    look: "premium_gray",
    cameraPlan: { hook: "crash_push", pain_point: "handheld_real", cta: "slow_push" },
    compose: { captionPreset: "karaoke", bgm: "chill", bgmDuck: true },
    scriptHint: { zh: "口播直给有网感，重点句短促有力，适合逐字字幕强调" },
  },
  {
    id: "drama_flip",
    emoji: "🎭",
    name: { zh: "剧情反转", en: "Drama Flip" },
    tagline: { zh: "希区柯克变焦打反转，剧情带货记忆点拉满", en: "Dolly-zoom plot twists — story-driven selling that sticks" },
    styleType: "reversal",
    videoMode: "live_presenter",
    look: "warm_life",
    cameraPlan: { hook: "dolly_zoom", pain_point: "handheld_real", demo: "follow_track", cta: "push_then_hold" },
    compose: { captionPreset: "standard", bgm: "emotional", bgmDuck: true },
    scriptHint: { zh: "前半段铺垫冲突，反转点干净利落，商品是解决方案不是主角台词" },
  },
  {
    id: "food_crave",
    emoji: "🍜",
    name: { zh: "美食食欲", en: "Food Crave" },
    tagline: { zh: "食欲暖光+微距滑移，食品类目专用", en: "Appetizing warm light + macro glide, made for food" },
    styleType: "scenario",
    videoMode: "product_closeup",
    look: "food_appetizing",
    cameraPlan: { hook: "crash_push", product_reveal: "macro_glide", demo: "overhead_top", cta: "slow_push" },
    compose: { captionPreset: "bold", bgm: "upbeat", bgmDuck: true, productCard: true },
    scriptHint: { zh: "突出色泽、质地与热气蒸汽等食欲信号，文案调动味觉想象" },
  },
  {
    id: "tech_pulse",
    emoji: "⚡",
    name: { zh: "科技酷感", en: "Tech Pulse" },
    tagline: { zh: "冷调轮廓光+弧形环拍，数码3C质感流", en: "Cool rim light + arc moves — the gadget aesthetic" },
    styleType: "product_pov",
    videoMode: "product_closeup",
    look: "tech_cool",
    cameraPlan: { hook: "whip_pan", product_reveal: "arc_quarter", demo: "focus_shift", cta: "hero_rise" },
    compose: { captionPreset: "minimal", bgm: "energetic", bgmDuck: true, quality: "hd" },
    scriptHint: { zh: "克制的科技感文案，参数说人话，画面冷调背景干净" },
  },
  {
    id: "street_vox",
    emoji: "🗣️",
    name: { zh: "街访背书", en: "Street Vox" },
    tagline: { zh: "街头采访多人背书，第三方视角更可信", en: "Street-interview endorsements — third-party voices sell trust" },
    styleType: "interview",
    videoMode: "live_presenter",
    look: "daylight_clean",
    cameraPlan: { hook: "pov_walk", social_proof: "lateral_track", demo: "follow_track", cta: "slow_push" },
    compose: { captionPreset: "standard", bgm: "chill", bgmDuck: true },
    scriptHint: { zh: "受访者口吻真实多样，观点具体不夸大，像随机街采不像摆拍" },
  },
];

/** Lookup by template id (undefined for unknown ids). */
export function getAdTemplate(id: string | undefined | null): AdTemplate | undefined {
  if (!id) return undefined;
  return AD_TEMPLATES.find((t) => t.id === id);
}

/** Shot-type labels for the camera-plan directive (script-facing, Chinese prompt). */
const PLAN_TYPE_LABELS: Record<string, string> = {
  hook: "钩子镜(hook)",
  pain_point: "痛点镜(pain_point)",
  product_reveal: "商品镜(product_reveal)",
  demo: "演示镜(demo)",
  social_proof: "背书镜(social_proof)",
  cta: "转化镜(cta)",
};

/**
 * The template's creative direction block for the script LLM, appended as a custom
 * requirement: look direction + per-shot-type camera sentences resolved from the
 * preset library. The LLM writes these into `Shot.camera`, so the plan flows through
 * the motion-prompt engine with zero extra plumbing — and stays per-shot editable.
 */
export function adTemplateScriptDirective(template: AdTemplate): string {
  const lines: string[] = [];
  const look = getLookPreset(template.look);
  lines.push(`【成片模板：${template.name.zh}】${template.scriptHint.zh}。`);
  if (look) lines.push(`画面光线与色调统一为「${look.name.zh}」：${look.image.zh}。`);
  const planLines = Object.entries(template.cameraPlan)
    .map(([type, presetId]) => {
      const preset = presetId ? getCameraPreset(presetId) : undefined;
      if (!preset) return null;
      return `${PLAN_TYPE_LABELS[type] ?? type} 的 camera 写「${preset.prompt.zh}」`;
    })
    .filter(Boolean);
  if (planLines.length > 0) {
    lines.push(`运镜编排（对应类型的分镜按此填写 camera 字段）：${planLines.join("；")}。`);
  }
  return lines.join("");
}

/** localStorage key carrying a project's chosen ad template (client-side, same convention as template store). */
export function adTemplateStorageKey(projectId: string): string {
  return `clipforge-ad-template:${projectId}`;
}

/** localStorage key marking that the video page already applied the template's compose recipe once. */
export function adTemplateAppliedKey(projectId: string): string {
  return `clipforge-ad-template-applied:${projectId}`;
}
