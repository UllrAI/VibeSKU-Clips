import type { ScriptTemplateBrief } from "./types";
import type { ScriptTemplate } from "./constants";

/**
 * The three formats delivered in the first phase. Each one is a production
 * recipe, not a visual theme: it fixes how the 15 seconds are spent and which
 * openings the writer may rotate through.
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
