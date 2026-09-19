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
 *
 * The three garment formats answer three different questions and are not
 * interchangeable: `apparel` asks what it looks like on, `styling` asks what
 * else it goes with, and `fit_check` asks what size to order. Each one is also
 * written away from advertising cadence, because a clip that sounds like an
 * advertisement is the one thing a shoppable feed scrolls past.
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
      "0-3s already wearing it and already mid-sentence, filmed in a mirror or on a propped phone, 3-7s walking a few steps across the room so the fabric moves, 7-12s two details the wearer reaches down and shows on themselves, 12-15s one last unposed look while they finish the thought.",
    voice:
      "Answering a friend who asked how it fits: mid-thought, specific, and a little unedited. Never a reveal, never a final pose, never a closing pitch, and never a phrase copied from the listing.",
    angles: [
      "open still adjusting it, not yet settled",
      "open on the detail the listing photos never show",
      "open on what it was worn with",
      "open on the fit question everyone asks first",
    ],
    shots: [
      "full-length in a mirror, phone in hand, the room visible around them",
      "a turn or a few steps across the room, showing drape, movement, and the back",
      "close-up of fabric, seam, or hardware, held up by the wearer's own hand",
      "waist-up, the wearer pulling at a hem or waistband to show how much give it has",
    ],
  },
  styling: {
    structure:
      "0-3s the one garment named plainly, already on or held up, 3-7s the first way it is worn, head to feet, 7-12s the same piece restyled once or twice more, each look on screen long enough to read, 12-15s which of them they would actually leave the house in.",
    voice:
      "Thinking out loud while getting dressed, weighing the options rather than presenting them.",
    angles: [
      "open on the piece everyone says they cannot style",
      "open on the outfit it gets worn with most",
      "open on the same piece dressed up and dressed down",
      "open on what they nearly wore instead",
    ],
    shots: [
      "the garment held against the body in front of a mirror",
      "full-length of each look, head to feet, with a beat to turn",
      "cut between two looks from the same standing position and framing",
      "waist-up on the change that makes the difference: a tuck, a layer, a pushed-up sleeve",
    ],
  },
  fit_check: {
    structure:
      "0-3s their height, the size they usually wear, and the size they are in, 3-7s standing square to camera head to feet, arms down then raised, 7-12s where it actually runs big or small, pinched and pulled on camera, 12-15s the size they would tell someone to order.",
    voice:
      "Flat and factual, the way someone reads out numbers they have just checked. No enthusiasm and nothing that sounds like selling.",
    angles: [
      "open on the size ordered against the size usually worn",
      "open on the measurement people get wrong",
      "open on how it sits after sitting down in it",
      "open on the one place it is tight",
    ],
    shots: [
      "full-length standing square to camera, arms at the sides, whole garment in frame",
      "the same stance with arms raised and a quarter turn, showing where it pulls",
      "close on a waistband, shoulder seam, or cuff pinched between finger and thumb to show the slack",
      "seated or crouched, showing the fit that standing still hides",
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
