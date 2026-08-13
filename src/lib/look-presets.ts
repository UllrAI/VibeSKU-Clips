/**
 * Visual "look" presets — the structured lighting/palette panel borrowed from
 * Higgsfield Cinema Studio 3.5 (Style Settings: enumerated Color Palettes + Lighting
 * options instead of free text) and Liblib's relight/composite workflow family
 * (电商打光/重打光/融图 being a top workflow category).
 *
 * Why this exists: the project had NO global visual-style setting — keyframe image
 * prompts relied entirely on whatever style words the script LLM improvised, so shots
 * within one video could drift between looks. A single global look keeps keyframes
 * consistent AND anchors lighting through the i2v pass (i2v models drift lighting when
 * unspecified).
 *
 * Two prompt surfaces per preset:
 *  - `image`: appended to the keyframe generation prompt (rich: light + palette + backdrop).
 *  - `motion`: short lighting anchor for the i2v motion prompt (concise: motion prompts
 *    must stay camera-led; a long style block would dilute the movement instruction).
 *
 * Pure data + pure functions, no I/O. Names/prompts are bilingual data, not i18n keys
 * (same convention as camera-presets.ts / BUILTIN_STYLE_PACKS).
 */

export interface LookPreset {
  id: string;
  /** Display name (picker label) */
  name: { zh: string; en: string };
  /** Appended to the keyframe image-generation prompt */
  image: { zh: string; en: string };
  /** Short lighting anchor appended to the i2v motion prompt */
  motion: { zh: string; en: string };
  /**
   * Preset family: "styled" (default) = art-directed looks; "real" = raw phone-shot looks
   * (the 2026 anti-"AI slop" survey: a camera-identity phrase at the very FRONT of a video
   * prompt biases the model toward handheld-phone distribution far more than mid-prompt
   * quality words — see `opener`).
   */
  group?: "styled" | "real";
  /**
   * Camera-identity opener PREPENDED to the i2v motion prompt (front tokens carry the most
   * weight). Only "real" looks define it; styled looks keep the appended anchor alone.
   */
  opener?: { zh: string; en: string };
}

/** Sentinel meaning "no global look" (the LLM's own per-shot style words stand alone). */
export const LOOK_NONE = "none";

export const LOOK_PRESETS: LookPreset[] = [
  {
    id: "daylight_clean",
    name: { zh: "清透日光", en: "Clean Daylight" },
    image: {
      zh: "明亮自然的窗边日光，空气感清透，浅色干净背景，白平衡准确",
      en: "bright natural window daylight, airy and clean, light minimal backdrop, accurate white balance",
    },
    motion: {
      zh: "全程保持明亮清透的自然日光",
      en: "keep bright clean natural daylight throughout",
    },
  },
  {
    id: "warm_life",
    name: { zh: "暖调生活感", en: "Warm Lifestyle" },
    image: {
      zh: "温暖的午后阳光色调，橙黄暖光洒落，居家生活氛围，柔和阴影",
      en: "warm afternoon sunlight tones, golden light spill, cozy home atmosphere, soft shadows",
    },
    motion: {
      zh: "全程保持温暖的橙黄午后光调",
      en: "keep the warm golden afternoon light throughout",
    },
  },
  {
    id: "studio_product",
    name: { zh: "影棚质感", en: "Studio Product" },
    image: {
      zh: "专业影棚布光，主体轮廓光清晰，深色渐变背景，商品质感锐利高级",
      en: "professional studio lighting, crisp rim light on the subject, dark gradient backdrop, sharp premium product texture",
    },
    motion: {
      zh: "全程保持影棚级布光与深色背景",
      en: "keep the studio lighting and dark backdrop throughout",
    },
  },
  {
    id: "night_neon",
    name: { zh: "夜景氛围", en: "Night Neon" },
    image: {
      zh: "夜晚城市霓虹氛围，冷暖光对比，浅景深光斑背景，情绪感强",
      en: "night city neon mood, warm-cool light contrast, shallow-depth bokeh backdrop, strong atmosphere",
    },
    motion: {
      zh: "全程保持夜景霓虹光斑氛围",
      en: "keep the neon night bokeh mood throughout",
    },
  },
  {
    id: "premium_gray",
    name: { zh: "高级灰调", en: "Premium Gray" },
    image: {
      zh: "低饱和高级灰色调，柔和漫射光，极简构图，高端克制的质感",
      en: "desaturated premium gray palette, soft diffused light, minimalist composition, restrained high-end feel",
    },
    motion: {
      zh: "全程保持低饱和灰调与柔和漫射光",
      en: "keep the desaturated gray palette and soft diffused light throughout",
    },
  },
  {
    id: "forest_soft",
    name: { zh: "森系自然", en: "Soft Botanical" },
    image: {
      zh: "自然绿植环境，清晨柔光带薄雾感，清新治愈的色调",
      en: "natural greenery setting, soft misty morning light, fresh soothing palette",
    },
    motion: {
      zh: "全程保持清晨柔光与清新绿调",
      en: "keep the soft morning light and fresh green palette throughout",
    },
  },
  {
    id: "food_appetizing",
    name: { zh: "食欲暖光", en: "Appetizing Warm" },
    image: {
      zh: "暖色食欲光，食物色泽饱满诱人，浅景深背景虚化，细节油亮",
      en: "warm appetizing light, rich saturated food colors, shallow depth of field, glossy details",
    },
    motion: {
      zh: "全程保持暖色食欲光与饱满色泽",
      en: "keep the warm appetizing light and rich colors throughout",
    },
  },
  {
    id: "tech_cool",
    name: { zh: "科技冷调", en: "Tech Cool" },
    image: {
      zh: "冷色调科技感光效，蓝紫色轮廓光，深色简洁背景，未来感",
      en: "cool-toned tech lighting, blue-violet rim light, dark clean backdrop, futuristic feel",
    },
    motion: {
      zh: "全程保持冷调科技光效",
      en: "keep the cool tech lighting throughout",
    },
  },
  // ---- "real" family (2026-08): raw phone-shot looks for the UGC don't-look-AI path.
  // All wording stays positive ("what the image IS") — visual negatives are placebos on
  // Seedance, and flaw-stacking is banned by the two-round real-face A/B lesson.
  {
    id: "phone_raw",
    name: { zh: "手机直出", en: "Phone Raw" },
    group: "real",
    opener: {
      zh: "UGC 创作者手机手持实拍",
      en: "UGC creator, handheld phone footage",
    },
    image: {
      zh: "真实手机直出画质，色彩自然未调色，混合色温带轻微白平衡漂移，轻度压缩感，生活化取景略偏离居中构图",
      en: "raw ungraded phone-camera look, natural colors with mixed color temperature and a slight white-balance drift, mild compression feel, casual slightly off-center framing",
    },
    motion: {
      zh: "全程保持未调色的自然色彩与混合色温",
      en: "keep the ungraded natural colors and mixed color temperature throughout",
    },
  },
  {
    id: "selfie_front",
    name: { zh: "前置自拍", en: "Front-cam Selfie" },
    group: "real",
    opener: {
      zh: "手机前置摄像头手持自拍，握持手机的手臂入画",
      en: "Handheld arm's-length selfie on the phone front camera, the holding arm visible in frame",
    },
    image: {
      zh: "前置手机镜头自拍视角，26mm 等效广角带近距边缘畸变，握持手机的手臂入画，机位略低于视线，日常生活背景",
      en: "front phone-camera selfie view, 26mm-equivalent wide angle with close-range edge distortion, the holding arm visible in frame, camera slightly below eye level, everyday background",
    },
    motion: {
      zh: "全程保持前置镜头的广角透视与自然室内光",
      en: "keep the front-camera wide-angle perspective and natural indoor light throughout",
    },
  },
  {
    id: "propped_static",
    name: { zh: "搁置机位", en: "Propped Static" },
    group: "real",
    opener: {
      zh: "手机搁在台面上固定拍摄，画面带极轻微的台面震动",
      en: "Vertical phone video propped on a counter, static with small surface vibrations",
    },
    image: {
      zh: "手机搁在台面上拍摄的固定视角，高度贴近台面略微仰视，生活痕迹背景，自然室内光",
      en: "fixed viewpoint of a phone propped on a counter, slightly low and tilted up, lived-in background, natural indoor light",
    },
    motion: {
      zh: "全程保持固定的搁置视角与自然室内光",
      en: "keep the fixed propped viewpoint and natural indoor light throughout",
    },
  },
];

/** Lookup by preset id; "none"/unknown → undefined (no look applied). */
export function getLookPreset(id: string | undefined): LookPreset | undefined {
  if (!id || id === LOOK_NONE) return undefined;
  return LOOK_PRESETS.find((p) => p.id === id);
}

/** True when the text contains CJK characters (language pick mirrors motion-prompt.ts). */
function hasCjk(s: string): boolean {
  return /[一-鿿぀-ヿ가-힯]/.test(s);
}

/**
 * The image-prompt suffix for a look in the language of the surrounding prompt
 * (CJK → Chinese; empty sample defaults to Chinese, domestic-first). Undefined when
 * no look is selected.
 */
export function lookImageSuffix(id: string | undefined, sampleText: string): string | undefined {
  const preset = getLookPreset(id);
  if (!preset) return undefined;
  return !sampleText || hasCjk(sampleText) ? preset.image.zh : preset.image.en;
}
