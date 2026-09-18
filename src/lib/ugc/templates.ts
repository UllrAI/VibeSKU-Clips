import type { ScriptTemplateBrief } from "./types";
import type { ScriptTemplate } from "./constants";

/**
 * The delivered formats. Each one is a production recipe, not a visual theme:
 * it fixes how the 15 seconds are spent, which openings the writer may rotate
 * through, and the shot vocabulary the beats are composed from.
 *
 * `shots` is what carries the difference between a thing held in the hand and
 * a thing worn on the body. A handheld demo is framed on the object and the
 * hands; a garment has to be seen at full length and in motion, or its fit —
 * the only thing the buyer is deciding about — never appears on screen.
 */
export const TEMPLATE_BRIEFS: Record<ScriptTemplate, ScriptTemplateBrief> = {
  spokesperson: {
    structure:
      "0-3s the presenter speaks straight to camera with the product in hand, 3-7s one clear close-up of the product, 7-12s the single strongest selling point demonstrated, 12-15s a calm sign-off pointing to the in-app listing.",
    voice:
      "A real person recommending something they use, speaking in short spoken sentences with no advertising cadence.",
    angles: [
      "open on the outcome the viewer wants",
      "open on the moment the presenter first tried it",
      "open on the one detail people always ask about",
      "open on a direct comparison with the usual workaround",
    ],
    shots: [
      "handheld medium shot, presenter to camera",
      "close-up of the product, shallow depth of field",
      "over-the-shoulder demonstration",
      "product on a plain surface, slow push in",
    ],
  },
  scenario: {
    structure:
      "0-3s the everyday problem shown, not narrated, 3-7s the product enters the scene, 7-12s the situation resolves with the product in use, 12-15s a short line closing the loop.",
    voice:
      "Observational and low-key, the way someone describes a small fix that worked.",
    angles: [
      "open in the middle of the annoyance",
      "open on the moment right before it goes wrong",
      "open on a familiar corner of the home or bag",
      "open on someone else noticing the result first",
    ],
    shots: [
      "wide shot of the everyday scene",
      "insert of the problem in detail",
      "product being picked up and used",
      "the resolved scene, natural light",
    ],
  },
  tutorial: {
    structure:
      "0-3s state what will be shown, 3-7s step one, 7-12s steps two and three at pace, 12-15s the finished result held to camera.",
    voice:
      "Instructional but unhurried, using the imperative and naming each step once.",
    angles: [
      "open on the finished result, then rewind",
      "open on the most common mistake",
      "open on how long the whole thing takes",
      "open on the single tool needed",
    ],
    shots: [
      "top-down shot of the work surface",
      "hands operating the product, close",
      "angled shot showing the mechanism",
      "finished result held to camera",
    ],
  },
  apparel: {
    structure:
      "0-3s the whole look lands on camera at full length, 3-7s the wearer moves so the fabric moves with them, 7-12s two close details that decide the purchase, 12-15s the look held still, facing camera.",
    voice:
      "Someone describing how a thing actually fits them, the way they would to a friend who asked, with no runway commentary.",
    angles: [
      "open on how it moves rather than how it looks standing still",
      "open on the detail the listing photos never show",
      "open on what it was worn with",
      "open on the fit question everyone asks first",
    ],
    shots: [
      "full-length shot, head to feet, natural stance, whole garment in frame",
      "a turn or a few steps, showing drape, movement, and the back",
      "close-up of fabric, seam, or hardware at conversational distance",
      "waist-up with the wearer's own hands adjusting the fit",
    ],
  },
  accessory: {
    structure:
      "0-3s the piece by itself, close enough to read the material, 3-7s it goes on, 7-12s worn and moving at the scale it is actually seen, 12-15s a last look with the rest of the outfit in frame.",
    voice:
      "Low-key and specific, the way someone talks about a small thing they keep reaching for.",
    angles: [
      "open on the material catching the light",
      "open on how small or how large it really is",
      "open on the moment of putting it on",
      "open on what it replaced",
    ],
    shots: [
      "macro of the piece alone, shallow depth of field",
      "hands fastening or putting it on, close",
      "worn shot at true scale against the body",
      "half-body with the piece in an everyday outfit",
    ],
  },
  unboxing: {
    structure:
      "0-3s the sealed package in hand, 3-7s it opens and the product comes out, 7-12s first contact and the one thing that is better or smaller than expected, 12-15s the product set down ready to use.",
    voice:
      "Reacting in the moment, plainly, without performing surprise the product has not earned.",
    angles: [
      "open on the size of the box against a hand",
      "open on the one thing checked first",
      "open on what was expected before opening",
      "open on everything that came in the box",
    ],
    shots: [
      "package held to camera, label legible",
      "top-down of the box opening on a plain surface",
      "product lifted out, hands only",
      "product held at conversational distance, turned once",
    ],
  },
};

/**
 * Fallback synthetic-content notice used when a locked operator script carries
 * no disclosure of its own. Generated scripts still carry one when needed.
 */
const DEFAULT_DISCLOSURES: Record<string, string> = {
  "zh-Hans": "本视频包含 AI 生成内容。",
  en: "This video contains AI-generated content.",
  ja: "この動画には AI 生成コンテンツが含まれます。",
  ko: "이 영상에는 AI 생성 콘텐츠가 포함되어 있습니다.",
  pt: "Este vídeo contém conteúdo gerado por IA.",
  es: "Este video contiene contenido generado por IA.",
};

export function defaultDisclosure(locale: string): string {
  return DEFAULT_DISCLOSURES[locale] ?? DEFAULT_DISCLOSURES.en;
}
