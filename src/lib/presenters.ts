/**
 * Built-in presenter presets + the anti-"AI face" realism constraint.
 *
 * Why this exists: video models default to an over-polished "influencer face"
 * (flawless skin, symmetric features, studio light) that instantly reads as AI
 * and cheapens the whole video. Real UGC commerce videos are fronted by ordinary
 * people shot on phones. Verified on real Seedance 2.0 calls: prompting concrete
 * ordinary-person features (asymmetry, pores, blemishes, messy hair, phone-grade
 * noise) produces dramatically more credible on-camera humans.
 *
 * Two exports do the work:
 *  - REAL_FACE_CONSTRAINT: appended to any generation prompt that puts a person
 *    on camera (script character shots, i2v motion prompts).
 *  - PRESENTER_PRESETS: ready-made ordinary-person casts the LLM can pick from
 *    (or riff on) when a script style needs an on-camera presenter, so every
 *    generated cast starts from believable, non-influencer looks.
 *
 * Pure data + pure functions, no I/O.
 */

/** Realism constraint against the default "AI influencer face" (zh/en). */
export const REAL_FACE_CONSTRAINT = {
  zh: "人物必须是普通素人长相，绝不是网红脸：五官有细微不对称，皮肤有真实毛孔纹理和轻微瑕疵（雀斑、痘印、黑眼圈都可以），日常淡妆或素颜，发丝自然凌乱；画质像手机随手拍带轻微噪点，自然光略有偏色，绝不磨皮美颜、不打影棚光、无广告片精致感",
  en: "the person must look like an ordinary real human, never a polished influencer AI face: subtly asymmetric features, real skin texture with visible pores and minor blemishes (freckles, acne marks, dark circles are all fine), everyday light or no makeup, naturally messy hair; footage looks like a casual phone shot with slight noise and imperfect ambient white balance — never beautified, never studio-lit, no ad-grade polish",
} as const;

/** True when the text contains CJK characters (language pick for the constraint line). */
function hasCjk(s: string): boolean {
  return /[一-鿿぀-ヿ가-힯]/.test(s);
}

/** Returns the realism constraint in the language matching the surrounding prompt text. */
export function realFaceLine(surroundingText: string): string {
  return surroundingText && !hasCjk(surroundingText) ? REAL_FACE_CONSTRAINT.en : REAL_FACE_CONSTRAINT.zh;
}

export interface PresenterPreset {
  id: string;
  /** Display name (persona nickname, not a real person) */
  name: string;
  gender: "female" | "male";
  /** One-line persona for scripts */
  persona: string;
  /** Appearance anchor written with deliberate ordinary-person features */
  appearance: string;
  /** Product categories this presenter type sells well */
  goodFor: string;
}

/**
 * Six ordinary-person presenter archetypes, deliberately diverse in age, build
 * and styling so multi-video batches don't converge on one face. Every
 * appearance string bakes in anti-AI-face features.
 */
export const PRESENTER_PRESETS: PresenterPreset[] = [
  {
    id: "neighbor_sister",
    name: "邻家姐姐",
    gender: "female",
    persona: "实在爱吐槽，先挑刺后真香",
    appearance: "32 岁左右普通居家女性，微胖圆脸，松散丸子头带碎发，素颜有黑眼圈，皮肤有真实毛孔，穿洗旧的宽松居家服",
    goodFor: "家居日用 / 食品",
  },
  {
    id: "office_lady",
    name: "通勤上班族",
    gender: "female",
    persona: "理性种草，讲成分讲证据",
    appearance: "35 岁左右普通上班族女性，单眼皮，齐肩发发尾毛躁，面部有淡雀斑和眼角细纹，日常淡妆，穿普通衬衫",
    goodFor: "美妆护肤 / 数码 3C",
  },
  {
    id: "student_girl",
    name: "大学生妹妹",
    gender: "female",
    persona: "活泼真实，反应大",
    appearance: "22 岁左右普通女生，圆脸戴黑框眼镜，高马尾有碎发，脸颊有痘印，素颜，穿普通棉 T 恤",
    goodFor: "零食 / 平价好物",
  },
  {
    id: "practical_mom",
    name: "实在宝妈",
    gender: "female",
    persona: "精打细算，只认性价比",
    appearance: "38 岁左右普通妈妈，及肩自然卷发，有法令纹和真实肤质，不化妆，系着围裙或穿家常外套",
    goodFor: "母婴 / 食品 / 家居日用",
  },
  {
    id: "tech_bro",
    name: "理工直男",
    gender: "male",
    persona: "参数党，嘴硬心软真香现场",
    appearance: "30 岁左右普通男性，寸头方脸带胡茬，皮肤偏黑有真实质感，穿格子衬衫或纯色 T 恤",
    goodFor: "数码 3C / 工具",
  },
  {
    id: "honest_uncle",
    name: "实在大叔",
    gender: "male",
    persona: "话糙理不糙，自用推荐",
    appearance: "45 岁左右普通男性，短发鬓角花白，皮肤黝黑粗糙有皱纹，穿普通 polo 衫",
    goodFor: "食品 / 农产 / 工具",
  },
];

/**
 * Prompt block offering the built-in presenters to the script LLM. Styles that
 * cast on-camera characters append this so generated casts start from ordinary,
 * believable looks instead of the model's default influencer face.
 */
export function presenterPromptBlock(): string {
  const lines = PRESENTER_PRESETS.map(
    (p) => `- ${p.name}（${p.gender === "female" ? "女" : "男"}，${p.persona}）：${p.appearance}（适合${p.goodFor}）`
  );
  return `内置素人主播库（角色外观可直接选用其一或在其基础上微调，也可自创——但必须保持同样的"普通素人"真实感）：\n${lines.join("\n")}`;
}
