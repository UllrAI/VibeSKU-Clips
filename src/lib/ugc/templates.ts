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
      "0-2s start mid-thought with one specific observation while the product is already in hand, 2-6s show the detail that prompted it, 6-12s use the product once so the observation is visible, 12-15s end on a plain who-it-is-for takeaway rather than a pitch.",
    voice:
      "A creator thinking out loud to one friend: short, concrete, lightly imperfect, and free of slogans, superlatives, rehearsed enthusiasm, or sales cadence.",
    angles: [
      "open on the outcome the viewer wants",
      "open on the first useful detail visible in hand",
      "open on the practical question this demo answers",
      "open on the ordinary workaround this product replaces",
    ],
    shots: [
      "handheld chest-up phone shot that begins mid-gesture rather than in a presenter pose",
      "close-up from the creator's own point of view, autofocus finding the product",
      "over-the-shoulder use in the room where it naturally belongs",
      "brief reaction shot that ends before it becomes a sign-off",
    ],
  },
  scenario: {
    structure:
      "0-2s begin inside a recognisable small annoyance with no introduction, 2-6s reach for the product as part of the same moment, 6-12s show one complete use with the useful change visible, 12-15s return to the ordinary activity and let the result close the loop.",
    voice:
      "Observational and low-key, describing only the small fix visible on screen.",
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
      "0-2s show the finished state or the mistake this avoids, 2-5s the first physical step, 5-11s one or two remaining steps without skipping the product interaction, 11-15s show the finished state in its real context with one concise takeaway.",
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
  tech_demo: {
    structure:
      "0-2s show the task already failing or taking too many steps, 2-5s put the device into use without a product introduction, 5-12s complete one real task with the relevant control and response visible, 12-15s show the outcome and state one practical limitation or best-fit use.",
    voice:
      "Sparse and matter-of-fact. Let taps, clicks, indicator sounds, and the visible response carry the demo; never read a feature list or pretend to have tested what the supplied facts do not prove.",
    angles: [
      "open on the exact task the device shortens",
      "open on the control people need to find first",
      "open on the small physical detail listing photos hide",
      "open on the device responding in real time",
    ],
    shots: [
      "over-the-shoulder view of the device in its normal setup, screen or controls readable",
      "tight hand-held close-up of one control being used once",
      "side angle showing the device and its physical response in the same frame",
      "wider view of the completed task, with the device left naturally in place",
    ],
  },
  beauty_routine: {
    structure:
      "0-2s begin at the exact point in a real routine where this product enters, 2-6s show the amount and texture at true scale, 6-12s apply it with one useful technique or answer one common usage question, 12-15s show the immediate finish in ordinary light without claiming an unsupported result.",
    voice:
      "Personal and useful like a get-ready-with-me aside, but never a fabricated testimonial. Describe only visible texture, application, finish, and recorded product facts; no miracle language or long-term efficacy claim.",
    angles: [
      "open halfway through the routine, reaching for this step",
      "open on how much product is actually used",
      "open on the texture in natural light",
      "open by answering one common application question",
    ],
    shots: [
      "casual mirror or vanity shot with the rest of the routine still around",
      "macro of the dispensed texture on a fingertip, applicator, or brush",
      "three-quarter close-up while the product is applied, hand and contact point visible",
      "unfiltered finish turned between window light and room light",
    ],
  },
  food_drink: {
    structure:
      "0-2s open on the most sensory real action — tear, pour, fizz, crunch, steam — with no greeting, 2-6s show preparation at true scale, 6-12s show the product being served or tasted and name only supported flavour or texture facts, 12-15s leave it in the everyday moment where someone would actually have it.",
    voice:
      "Sensory and economical, led by natural preparation sounds. Never invent a tasting history, popularity claim, or flavour note that is absent from the supplied facts.",
    angles: [
      "open on the package sound and first pour",
      "open on the texture changing during preparation",
      "open on the serving size beside an ordinary hand or cup",
      "open on the first bite or sip without an exaggerated reaction",
    ],
    shots: [
      "tight handheld macro of opening, pouring, bubbling, breaking, or steam",
      "top-down preparation shot with ordinary kitchen clutter at the edges",
      "side close-up at table height showing texture and true portion size",
      "medium candid shot of one bite or sip, then the product set back down",
    ],
  },
  apparel: {
    structure:
      "0-3s already wearing it and mid-sentence in a mirror or on a propped phone, 3-7s walk past camera and turn fully away so the entire back and rear fit are unobstructed, 7-12s return at a side or three-quarter angle and show two details on the body, 12-15s one unposed full-length movement while finishing the thought.",
    voice:
      "Answering a friend who asked how it fits: mid-thought, specific, and a little unedited. Never a reveal, never a final pose, never a closing pitch, and never a phrase copied from the listing.",
    angles: [
      "open still adjusting it, not yet settled",
      "open on the detail the listing photos never show",
      "open on what it was worn with",
      "open on the fit question everyone asks first",
    ],
    shots: [
      "full-length front view in a mirror, phone in hand, the room visible around them",
      "full-length rear view after a complete turn, back of the garment unobstructed from shoulders or waist to hem",
      "close-up of fabric, seam, or hardware, held up by the wearer's own hand",
      "side or three-quarter full-body view while walking, sitting, or reaching so the garment moves",
    ],
  },
  styling: {
    structure:
      "0-3s the one garment named plainly, already on or held up, 3-7s the first look head to feet from the front, 7-11s the next look restyled and seen from the side and then fully turned away so the shared piece is visible from the back, 11-15s one close styling adjustment and the look they would actually leave in.",
    voice:
      "Thinking out loud while getting dressed, weighing the options rather than presenting them.",
    angles: [
      "open on a piece that needs more than one styling idea",
      "open on the simplest outfit built around it",
      "open on the same piece dressed up and dressed down",
      "open on what they nearly wore instead",
    ],
    shots: [
      "the garment held against the body in front of a mirror",
      "full-length front view of the first look, head to feet",
      "full-length back view of the restyled look after a complete turn, the shared garment unobstructed",
      "cut between two looks from the same standing position and framing",
      "waist-up on the change that makes the difference: a tuck, a layer, a pushed-up sleeve",
    ],
  },
  fit_check: {
    structure:
      "0-3s their height, usual size, and the size shown, 3-6s stand square to camera head to feet, 6-9s turn fully around and pause on the back fit, 9-13s sit, raise the arms, or pinch the exact area that runs big or small, 13-15s give the plain sizing takeaway without a recommendation pitch.",
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
      "full-length directly from behind after a complete turn, showing the rear waist, rise, shoulders, and hem that apply",
      "side view with arms raised or while sitting, showing where the garment pulls",
      "close on a waistband, shoulder seam, or cuff pinched between finger and thumb to show the slack",
    ],
  },
  accessory: {
    structure:
      "0-3s the piece by itself, close enough to read the material, 3-7s it goes on, 7-12s worn and moving at the scale it is actually seen, 12-15s a last look with the rest of the outfit in frame.",
    voice:
      "Low-key and specific, focused on scale, material, fastening, and how the piece sits when worn.",
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
      "0-2s begin with the parcel already being opened, 2-7s reveal the product and everything verifiably included, 7-12s handle one material or setup detail at true scale, 12-15s set it down ready for first use without a performed reaction or sales close.",
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
