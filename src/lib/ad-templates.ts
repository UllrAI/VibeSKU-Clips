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

/**
 * Template groups — the browse taxonomy for a large library. Mirrors how
 * Higgsfield Ads and Liblib's template plaza organise dozens of cards:
 * by what the finished video LOOKS like, not by internal script style.
 */
export const AD_TEMPLATE_GROUPS = [
  { id: "product_show", name: { zh: "商品展示", en: "Product showcase" } },
  { id: "presenter", name: { zh: "真人讲解", en: "Presenter" } },
  { id: "story", name: { zh: "剧情叙事", en: "Story" } },
  { id: "lifestyle", name: { zh: "生活种草", en: "Lifestyle" } },
  { id: "promo", name: { zh: "促销转化", en: "Promo" } },
  { id: "creative", name: { zh: "创意视觉", en: "Creative" } },
] as const;
export type AdTemplateGroupId = (typeof AD_TEMPLATE_GROUPS)[number]["id"];

/** Product categories a template is tuned for (new-project category vocabulary; omit = universal). */
export type AdTemplateCategory = "beauty" | "food" | "home" | "fashion" | "digital";

export interface AdTemplate {
  id: string;
  /** Card emoji — the OSS stand-in for Higgsfield's looping video preview */
  emoji: string;
  name: { zh: string; en: string };
  /** One-line selling-point pitch (Liblib card syntax: benefits in the title) */
  tagline: { zh: string; en: string };
  /** Browse group (AD_TEMPLATE_GROUPS id) — the filter chip the card lives under */
  group: AdTemplateGroupId;
  /** Product categories this template shines for; omitted = works for anything */
  goodFor?: AdTemplateCategory[];
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
    group: "product_show",
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
    group: "lifestyle",
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
    group: "product_show",
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
    group: "presenter",
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
    group: "story",
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
    group: "product_show",
    goodFor: ["food"],
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
    group: "product_show",
    goodFor: ["digital"],
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
    group: "presenter",
    styleType: "interview",
    videoMode: "live_presenter",
    look: "daylight_clean",
    cameraPlan: { hook: "pov_walk", social_proof: "lateral_track", demo: "follow_track", cta: "slow_push" },
    compose: { captionPreset: "standard", bgm: "chill", bgmDuck: true },
    scriptHint: { zh: "受访者口吻真实多样，观点具体不夸大，像随机街采不像摆拍" },
  },

  /* ---- product_show：商品展示（Higgsfield Ads/巨量千川「产品使用展示」系） ---- */
  {
    id: "bullet_time_white",
    emoji: "🧊",
    name: { zh: "白底子弹时间", en: "Bullet Time White" },
    tagline: { zh: "电商白底+时间冻结环绕，主图级质感动起来", en: "Clean white sweep + frozen-time orbit — your hero image, animated" },
    group: "product_show",
    styleType: "product_pov",
    videoMode: "product_closeup",
    look: "studio_product",
    cameraPlan: { hook: "crash_push", product_reveal: "orbit_slow", demo: "focus_shift", cta: "push_then_hold" },
    compose: { captionPreset: "minimal", bgm: "energetic", bgmDuck: true, quality: "hd", productCard: true },
    scriptHint: { zh: "纯白背景零杂物，商品是唯一主角，文案极简只留核心卖点" },
  },
  {
    id: "macro_texture",
    emoji: "🔍",
    name: { zh: "微距质感", en: "Macro Texture" },
    tagline: { zh: "极致微距怼质地，材质党一眼上头", en: "Extreme macro on texture — material lovers can't look away" },
    group: "product_show",
    goodFor: ["beauty", "digital"],
    styleType: "product_pov",
    videoMode: "product_closeup",
    look: "premium_gray",
    cameraPlan: { hook: "macro_glide", product_reveal: "crane_down_close", demo: "focus_shift", cta: "slow_push" },
    compose: { captionPreset: "minimal", bgm: "chill", bgmDuck: true, quality: "hd" },
    scriptHint: { zh: "画面全程贴近材质表面，突出纹理、光泽与工艺细节，文案少而精" },
  },
  {
    id: "demo_first",
    emoji: "🎯",
    name: { zh: "效果先行", en: "Demo First" },
    tagline: { zh: "首帧就是工作状态，功能比包装先说话", en: "Frame one is the product working — function before branding" },
    group: "product_show",
    goodFor: ["home", "digital"],
    styleType: "product_pov",
    videoMode: "scene_demo",
    look: "daylight_clean",
    cameraPlan: { hook: "crash_push", demo: "follow_track", product_reveal: "push_then_hold", cta: "slow_push" },
    compose: { captionPreset: "bold", bgm: "upbeat", bgmDuck: true, productCard: true },
    scriptHint: { zh: "第一镜直接展示商品正在解决问题的状态，不要包装不要铺垫，效果即钩子" },
  },
  {
    id: "extreme_test",
    emoji: "🔨",
    name: { zh: "极限测试", en: "Torture Test" },
    tagline: { zh: "防水抗摔承重硬核实测，眼见为实", en: "Waterproof, drop, load — hardcore stress tests, seeing is believing" },
    group: "product_show",
    goodFor: ["digital", "home"],
    styleType: "comparison",
    videoMode: "scene_demo",
    look: "tech_cool",
    cameraPlan: { hook: "dolly_zoom", demo: "handheld_real", product_reveal: "hero_rise", cta: "push_then_hold" },
    compose: { captionPreset: "bold", bgm: "energetic", bgmDuck: true },
    scriptHint: { zh: "围绕一项极端条件测试展开全片，测试过程真实可信，结果不夸大" },
  },
  {
    id: "fashion_walk",
    emoji: "👗",
    name: { zh: "试穿走位", en: "Try-On Walk" },
    tagline: { zh: "街头编辑部风试穿+跟拍，衣服穿上才会说话", en: "Editorial street try-on with tracking shots — clothes talk when worn" },
    group: "product_show",
    goodFor: ["fashion"],
    styleType: "scenario",
    videoMode: "live_presenter",
    look: "daylight_clean",
    cameraPlan: { hook: "whip_pan", demo: "lateral_track", product_reveal: "follow_track", cta: "slow_push" },
    compose: { captionPreset: "minimal", bgm: "chill", bgmDuck: true, quality: "hd" },
    scriptHint: { zh: "模特向镜头自然走来展示上身效果，突出版型与垂感，街头时尚杂志感" },
  },
  {
    id: "pack_flatlay",
    emoji: "🧩",
    name: { zh: "拼贴快闪", en: "Flatlay Flash" },
    tagline: { zh: "平铺拼贴+卡点快闪，剪辑门槛最低的爆量款", en: "Flatlay collage + beat-synced cuts — the lowest-effort volume format" },
    group: "product_show",
    styleType: "pain-point",
    videoMode: "graphic_montage",
    look: "daylight_clean",
    cameraPlan: { hook: "whip_pan", product_reveal: "overhead_top", demo: "focus_shift", cta: "push_then_hold" },
    compose: { captionPreset: "bold", bgm: "energetic", bgmDuck: true, productCard: true },
    scriptHint: { zh: "画面以商品平铺与大字卖点为主，节奏跟音乐卡点，每镜信息量一句话说清" },
  },

  /* ---- presenter：真人讲解（巨量千川口播系 + Creatify/Arcads UGC 系） ---- */
  {
    id: "expert_lab",
    emoji: "🥼",
    name: { zh: "专家背书", en: "Expert Endorse" },
    tagline: { zh: "白大褂讲成分讲原理，权威感拉满信任成交", en: "Lab-coat authority explains the science — trust that converts" },
    group: "presenter",
    goodFor: ["beauty"],
    styleType: "talking_head",
    videoMode: "live_presenter",
    look: "premium_gray",
    cameraPlan: { hook: "slow_push", demo: "macro_glide", social_proof: "focus_shift", cta: "push_then_hold" },
    compose: { captionPreset: "standard", bgm: "chill", bgmDuck: true },
    scriptHint: { zh: "以研究员口吻讲成分与原理，术语说人话，结论克制不绝对化；资质背书需真实" },
  },
  {
    id: "car_talk",
    emoji: "🚗",
    name: { zh: "车内口播", en: "Car Talk" },
    tagline: { zh: "车内私密感安利，通勤间隙的真心推荐", en: "In-car confessional — a commute-break recommendation that feels real" },
    group: "presenter",
    styleType: "talking_head",
    videoMode: "live_presenter",
    look: "daylight_clean",
    cameraPlan: { hook: "handheld_real", pain_point: "focus_shift", demo: "push_then_hold", cta: "slow_push" },
    compose: { captionPreset: "karaoke", bgm: "none", bgmDuck: false },
    scriptHint: { zh: "坐在车内对镜头口播，像跟朋友打视频电话，语气松弛真诚不像广告" },
  },
  {
    id: "objection_qa",
    emoji: "🙋",
    name: { zh: "答疑拔草", en: "Objection Crusher" },
    tagline: { zh: "逐条化解三大顾虑，高客单信任型带货", en: "Kill the top three objections one by one — trust-first selling" },
    group: "presenter",
    styleType: "talking_head",
    videoMode: "live_presenter",
    look: "warm_life",
    cameraPlan: { hook: "crash_push", pain_point: "handheld_real", social_proof: "lateral_track", cta: "push_then_hold" },
    compose: { captionPreset: "standard", bgm: "chill", bgmDuck: true },
    scriptHint: { zh: "开场点出用户最担心的问题，逐条正面回应给证据，最后才报价格" },
  },
  {
    id: "testimonial_stack",
    emoji: "👥",
    name: { zh: "多人证言", en: "Testimonial Stack" },
    tagline: { zh: "多位素人证言快剪，人多才是硬社证", en: "Rapid-fire testimonials from many faces — volume is the proof" },
    group: "presenter",
    styleType: "interview",
    videoMode: "live_presenter",
    look: "daylight_clean",
    cameraPlan: { hook: "whip_pan", social_proof: "lateral_track", demo: "follow_track", cta: "push_then_hold" },
    compose: { captionPreset: "karaoke", bgm: "energetic", bgmDuck: true },
    scriptHint: { zh: "多位不同身份的素人各说一句真实使用感受，每段短促直给，观点具体不重样" },
  },
  {
    id: "news_flash",
    emoji: "📰",
    name: { zh: "新闻播报", en: "Breaking News" },
    tagline: { zh: "新闻台播报式上新，正经脸讲好物自带反差", en: "Newsroom-style product bulletin — deadpan delivery, built-in contrast" },
    group: "presenter",
    styleType: "drama",
    videoMode: "live_presenter",
    look: "premium_gray",
    cameraPlan: { hook: "crash_push", social_proof: "focus_shift", demo: "lateral_track", cta: "push_then_hold" },
    compose: { captionPreset: "bold", bgm: "upbeat", bgmDuck: true },
    scriptHint: { zh: "主播以新闻播报口吻一本正经介绍商品，播报体与带货内容形成反差趣味，信息真实" },
  },
  {
    id: "tutorial_steps",
    emoji: "🎓",
    name: { zh: "保姆级教程", en: "Step Tutorial" },
    tagline: { zh: "分步教学顺手带货，学会即种草", en: "Step-by-step how-to that sells — teach it and they want it" },
    group: "presenter",
    goodFor: ["beauty", "home"],
    styleType: "talking_head",
    videoMode: "scene_demo",
    look: "daylight_clean",
    cameraPlan: { hook: "crash_push", demo: "overhead_top", product_reveal: "macro_glide", cta: "slow_push" },
    compose: { captionPreset: "standard", bgm: "chill", bgmDuck: true, productCard: true },
    scriptHint: { zh: "按第一步第二步分步教学，每步一个可跟做的动作，商品在步骤中自然出场" },
  },

  /* ---- story：剧情叙事（抖音短剧五段公式 + TikTok 叙事结构系） ---- */
  {
    id: "skeptic_flip",
    emoji: "🤨",
    name: { zh: "真香反转", en: "Skeptic Flip" },
    tagline: { zh: "本来不信→亲测真香，怀疑者转粉最有说服力", en: "Doubter turns believer on camera — conversion is the story" },
    group: "story",
    styleType: "reversal",
    videoMode: "live_presenter",
    look: "warm_life",
    cameraPlan: { hook: "handheld_real", pain_point: "dolly_zoom", demo: "macro_glide", cta: "push_then_hold" },
    compose: { captionPreset: "standard", bgm: "emotional", bgmDuck: true },
    scriptHint: { zh: "开场明确表达怀疑，试用过程如实记录，转变理由具体可信，不演过头" },
  },
  {
    id: "mini_drama",
    emoji: "🎬",
    name: { zh: "情景短剧", en: "Mini Drama" },
    tagline: { zh: "双人冲突开场，商品是解围的那个人", en: "Two-person conflict; the product plays the rescuer" },
    group: "story",
    styleType: "drama",
    videoMode: "live_presenter",
    look: "warm_life",
    cameraPlan: { hook: "dolly_zoom", pain_point: "handheld_real", demo: "follow_track", cta: "slow_push" },
    compose: { captionPreset: "standard", bgm: "emotional", bgmDuck: true },
    scriptHint: { zh: "家庭或办公室双人对话冲突开场，商品在剧情转折处自然出现化解矛盾" },
  },
  {
    id: "founder_story",
    emoji: "🏭",
    name: { zh: "工厂溯源", en: "Factory Story" },
    tagline: { zh: "老板带你看产线，源头实拍砍掉中间商话术", en: "Founder walks the line — source footage beats middleman talk" },
    group: "story",
    goodFor: ["food", "home"],
    styleType: "story",
    videoMode: "scene_demo",
    look: "daylight_clean",
    cameraPlan: { hook: "pov_walk", demo: "follow_track", social_proof: "lateral_track", product_reveal: "hero_rise", cta: "slow_push" },
    compose: { captionPreset: "standard", bgm: "upbeat", bgmDuck: true, productCard: true },
    scriptHint: { zh: "以探厂视角走进车间，展示真实产线与工艺环节，源头信息需真实可核" },
  },
  {
    id: "day_timeline",
    emoji: "📅",
    name: { zh: "效果日记", en: "Results Diary" },
    tagline: { zh: "第1天到第21天时间线记录，过程即证据", en: "Day 1 to Day 21 timeline — the process is the proof" },
    group: "story",
    goodFor: ["beauty"],
    styleType: "story",
    videoMode: "scene_demo",
    look: "daylight_clean",
    cameraPlan: { hook: "crash_push", pain_point: "handheld_real", demo: "focus_shift", cta: "push_then_hold" },
    compose: { captionPreset: "standard", bgm: "chill", bgmDuck: true },
    scriptHint: { zh: "按时间节点记录使用过程与变化，描述客观不承诺效果，避免绝对化用词" },
  },

  /* ---- lifestyle：生活种草（小红书沉浸系 + Higgsfield UGC 生活流） ---- */
  {
    id: "morning_routine",
    emoji: "☀️",
    name: { zh: "晨间流程", en: "Morning Routine" },
    tagline: { zh: "起床到出门的routine植入，生活流最软广告", en: "Wake-up-to-out-the-door routine — the softest product placement" },
    group: "lifestyle",
    goodFor: ["beauty", "home"],
    styleType: "scenario",
    videoMode: "scene_demo",
    look: "warm_life",
    cameraPlan: { hook: "pov_walk", demo: "follow_track", product_reveal: "macro_glide", cta: "slow_push" },
    compose: { captionPreset: "minimal", bgm: "chill", bgmDuck: true },
    scriptHint: { zh: "按晨间时间线串起多个生活动作，商品作为流程一环自然出现，不打断节奏" },
  },
  {
    id: "immersive_pov",
    emoji: "🛋️",
    name: { zh: "沉浸体验", en: "Immersive POV" },
    tagline: { zh: "全程第一视角沉浸使用，代入感就是种草力", en: "Full first-person immersion — presence is persuasion" },
    group: "lifestyle",
    styleType: "scenario",
    videoMode: "scene_demo",
    look: "warm_life",
    cameraPlan: { hook: "pov_walk", demo: "handheld_real", product_reveal: "crane_down_close", cta: "slow_push" },
    compose: { captionPreset: "minimal", bgm: "chill", bgmDuck: true },
    scriptHint: { zh: "全程第一视角展示使用过程，保留环境音的真实感，旁白像自言自语" },
  },
  {
    id: "cozy_asmr",
    emoji: "🎧",
    name: { zh: "治愈ASMR", en: "Cozy ASMR" },
    tagline: { zh: "沉浸声音质感，无BGM保留原声解压", en: "Immersive sound texture — no BGM, pure satisfying audio" },
    group: "lifestyle",
    goodFor: ["food", "beauty"],
    styleType: "product_pov",
    videoMode: "product_closeup",
    look: "night_neon",
    cameraPlan: { hook: "macro_glide", product_reveal: "crane_down_close", demo: "focus_shift", cta: "slow_push" },
    compose: { captionPreset: "minimal", bgm: "none", bgmDuck: false, quality: "hd" },
    scriptHint: { zh: "以声音质感为主线（开合、倾倒、揉捏等），画面慢而近，文案降到最少" },
  },
  {
    id: "vlog_soft",
    emoji: "🌸",
    name: { zh: "氛围感Vlog", en: "Soft Vlog" },
    tagline: { zh: "柔光滤镜+浅景深，唯美氛围里顺手安利", en: "Soft light and shallow focus — recommendations wrapped in mood" },
    group: "lifestyle",
    goodFor: ["beauty", "fashion"],
    styleType: "scenario",
    videoMode: "live_presenter",
    look: "forest_soft",
    cameraPlan: { hook: "slow_push", demo: "handheld_real", product_reveal: "focus_shift", cta: "slow_push" },
    compose: { captionPreset: "minimal", bgm: "emotional", bgmDuck: true },
    scriptHint: { zh: "整体唯美松弛的vlog氛围，先给情绪再给商品，安利像随口一提" },
  },
  {
    id: "home_makeover",
    emoji: "🏠",
    name: { zh: "改造对比", en: "Makeover Reveal" },
    tagline: { zh: "改造前后强对比，成就感替你卖货", en: "Before/after transformation — the payoff does the selling" },
    group: "lifestyle",
    goodFor: ["home"],
    styleType: "comparison",
    videoMode: "scene_demo",
    look: "warm_life",
    cameraPlan: { hook: "dolly_zoom", pain_point: "handheld_real", demo: "lateral_track", product_reveal: "crane_up", cta: "hero_rise" },
    compose: { captionPreset: "bold", bgm: "upbeat", bgmDuck: true, productCard: true },
    scriptHint: { zh: "先给改造前的杂乱现状，过程快剪，结尾大空间揭示改造后效果形成反差" },
  },

  /* ---- promo：促销转化（抖音话术型脚本系 + TikTok Urgency-Anchor；促销信息必须真实合规） ---- */
  {
    id: "flash_sale",
    emoji: "🔥",
    name: { zh: "促销快闪", en: "Promo Flash" },
    tagline: { zh: "七成种草三成促销，档期上新的转化收口", en: "70% value, 30% offer — the launch-window conversion closer" },
    group: "promo",
    styleType: "pain-point",
    videoMode: "graphic_montage",
    look: "daylight_clean",
    cameraPlan: { hook: "crash_push", product_reveal: "hero_rise", demo: "focus_shift", cta: "push_then_hold" },
    compose: { captionPreset: "bold", bgm: "energetic", bgmDuck: true, productCard: true },
    scriptHint: { zh: "前段快节奏讲价值，结尾集中讲优惠；优惠信息必须真实，不使用虚假紧迫话术" },
  },
  {
    id: "price_anchor",
    emoji: "⚖️",
    name: { zh: "比价锚点", en: "Price Anchor" },
    tagline: { zh: "先立参照再报价，价格优势眼见为实", en: "Anchor first, then reveal the price — the gap sells itself" },
    group: "promo",
    styleType: "comparison",
    videoMode: "product_closeup",
    look: "daylight_clean",
    cameraPlan: { hook: "whip_pan", pain_point: "focus_shift", product_reveal: "overhead_top", cta: "push_then_hold" },
    compose: { captionPreset: "bold", bgm: "upbeat", bgmDuck: true, productCard: true },
    scriptHint: { zh: "先给常见渠道价或同类价做参照，再展示本品价格与配置；对比信息需真实可核" },
  },
  {
    id: "bundle_pile",
    emoji: "🛒",
    name: { zh: "量大管饱", en: "Value Pile" },
    tagline: { zh: "俯拍堆满一桌，数量冲击就是性价比", en: "A table piled high, shot from above — quantity is the argument" },
    group: "promo",
    goodFor: ["food", "home"],
    styleType: "pain-point",
    videoMode: "product_closeup",
    look: "daylight_clean",
    cameraPlan: { hook: "crash_push", product_reveal: "overhead_top", demo: "lateral_track", cta: "push_then_hold" },
    compose: { captionPreset: "bold", bgm: "upbeat", bgmDuck: true, productCard: true },
    scriptHint: { zh: "把套餐内容全部铺开逐件清点，数量与赠品眼见为实，报价干脆" },
  },
  {
    id: "live_slice",
    emoji: "📺",
    name: { zh: "直播切片风", en: "Live-Room Cut" },
    tagline: { zh: "直播间高光话术+大字贴纸，切片感自带信任", en: "Live-room highlight energy with sticker captions — clip-native trust" },
    group: "promo",
    styleType: "talking_head",
    videoMode: "live_presenter",
    look: "night_neon",
    cameraPlan: { hook: "crash_push", social_proof: "handheld_real", demo: "focus_shift", cta: "push_then_hold" },
    compose: { captionPreset: "karaoke", bgm: "none", bgmDuck: false, productCard: true },
    scriptHint: { zh: "模拟直播间讲解的高光片段，话术密集直给有现场感，承诺内容必须真实" },
  },
  {
    id: "three_reasons",
    emoji: "🥇",
    name: { zh: "三大理由", en: "3 Reasons" },
    tagline: { zh: "三个理由清单体，最后一个放大招", en: "Three-reason listicle — save the best for last" },
    group: "promo",
    styleType: "comparison",
    videoMode: "product_closeup",
    look: "daylight_clean",
    cameraPlan: { hook: "whip_pan", product_reveal: "lazy_susan", demo: "overhead_top", cta: "push_then_hold" },
    compose: { captionPreset: "bold", bgm: "upbeat", bgmDuck: true, productCard: true },
    scriptHint: { zh: "以「三个理由」清单结构展开，逐条编号讲透，把最强卖点放在最后压轴" },
  },

  /* ---- creative：创意视觉（Higgsfield 奇观系：Giant/Splash/Graffiti 等） ---- */
  {
    id: "giant_product",
    emoji: "🗼",
    name: { zh: "巨物奇观", en: "Giant Product" },
    tagline: { zh: "商品放大成城市巨物，一眼停手指的奇观开场", en: "Your product towering over the skyline — a scroll-stopping spectacle" },
    group: "creative",
    styleType: "product_pov",
    videoMode: "product_closeup",
    look: "tech_cool",
    cameraPlan: { hook: "crane_up", product_reveal: "pull_reveal", demo: "arc_quarter", cta: "hero_rise" },
    compose: { captionPreset: "bold", bgm: "energetic", bgmDuck: true, quality: "hd" },
    scriptHint: { zh: "把商品呈现为矗立在城市或自然场景中的巨物，画面越壮观越好，卖点简短有力" },
  },
  {
    id: "splash_freeze",
    emoji: "💦",
    name: { zh: "飞溅定格", en: "Splash Freeze" },
    tagline: { zh: "高速摄影感飞溅瞬间，饮品美妆的氛围大片", en: "High-speed splash frozen mid-air — drinks and beauty in cinema mode" },
    group: "creative",
    goodFor: ["food", "beauty"],
    styleType: "product_pov",
    videoMode: "product_closeup",
    look: "studio_product",
    cameraPlan: { hook: "crash_push", product_reveal: "orbit_slow", demo: "macro_glide", cta: "push_then_hold" },
    compose: { captionPreset: "minimal", bgm: "energetic", bgmDuck: true, quality: "hd" },
    scriptHint: { zh: "以液体飞溅、粉末扬起等高速摄影感瞬间为视觉主线，动感与质感并重" },
  },
  {
    id: "street_poster",
    emoji: "🎨",
    name: { zh: "街头海报", en: "Street Poster" },
    tagline: { zh: "商品上墙变涂鸦与巨幅广告牌，潮流品牌感", en: "Your product as graffiti and giant billboards — streetwear energy" },
    group: "creative",
    goodFor: ["fashion", "digital"],
    styleType: "product_pov",
    videoMode: "graphic_montage",
    look: "night_neon",
    cameraPlan: { hook: "whip_pan", product_reveal: "crane_up", demo: "lateral_track", cta: "pull_reveal" },
    compose: { captionPreset: "bold", bgm: "energetic", bgmDuck: true },
    scriptHint: { zh: "商品以街头涂鸦、巨幅广告牌等城市视觉形式出现，整体潮流艺术感" },
  },
  {
    id: "pet_cameo",
    emoji: "🐶",
    name: { zh: "萌宠助阵", en: "Pet Cameo" },
    tagline: { zh: "毛孩子出镜带货，可爱即流量", en: "A furry co-host sells it — cuteness is reach" },
    group: "creative",
    goodFor: ["home", "food"],
    styleType: "scenario",
    videoMode: "scene_demo",
    look: "warm_life",
    cameraPlan: { hook: "crash_push", demo: "follow_track", product_reveal: "crane_down_close", cta: "slow_push" },
    compose: { captionPreset: "standard", bgm: "chill", bgmDuck: true, productCard: true },
    scriptHint: { zh: "宠物与商品同框互动作为记忆点，画面温馨有趣，宠物反应自然不摆拍" },
  },
  {
    id: "magic_transform",
    emoji: "✨",
    name: { zh: "一键变装", en: "Magic Switch" },
    tagline: { zh: "甩镜瞬间变装换景，反差感抓住前三秒", en: "Whip-cut outfit and scene switches — contrast owns the first 3 seconds" },
    group: "creative",
    goodFor: ["fashion", "beauty"],
    styleType: "reversal",
    videoMode: "scene_demo",
    look: "night_neon",
    cameraPlan: { hook: "whip_pan", product_reveal: "dolly_zoom", demo: "lateral_track", cta: "hero_rise" },
    compose: { captionPreset: "karaoke", bgm: "energetic", bgmDuck: true },
    scriptHint: { zh: "以瞬间变装或场景切换制造前后反差，切换点干脆利落卡在节拍上" },
  },
  {
    id: "comment_bubble",
    emoji: "💬",
    name: { zh: "评论爆梗", en: "Comment Hook" },
    tagline: { zh: "漂浮评论气泡+回复体，像爆款帖不像广告", en: "Floating comment bubbles, reply-style script — reads viral, not ad" },
    group: "creative",
    styleType: "interview",
    videoMode: "graphic_montage",
    look: "daylight_clean",
    cameraPlan: { hook: "crash_push", social_proof: "focus_shift", product_reveal: "push_then_hold", demo: "overhead_top", cta: "slow_push" },
    compose: { captionPreset: "standard", bgm: "upbeat", bgmDuck: true, productCard: true },
    scriptHint: { zh: "以「回复网友评论」的口吻展开，把常见疑问当话题逐条回应，社交感强" },
  },
];

/** Lookup by template id (undefined for unknown ids). */
export function getAdTemplate(id: string | undefined | null): AdTemplate | undefined {
  if (!id) return undefined;
  return AD_TEMPLATES.find((t) => t.id === id);
}

/**
 * Templates for the picker: optional group filter, and with a product category
 * chosen, category-tuned templates float to the front (stable partition — order
 * inside each half is preserved, so curation order still matters).
 */
export function listAdTemplates(opts?: { group?: AdTemplateGroupId | "all"; category?: string }): AdTemplate[] {
  const group = opts?.group && opts.group !== "all" ? opts.group : undefined;
  const pool = group ? AD_TEMPLATES.filter((t) => t.group === group) : [...AD_TEMPLATES];
  const category = opts?.category;
  if (!category) return pool;
  return [
    ...pool.filter((t) => t.goodFor?.includes(category as AdTemplateCategory)),
    ...pool.filter((t) => !t.goodFor?.includes(category as AdTemplateCategory)),
  ];
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
