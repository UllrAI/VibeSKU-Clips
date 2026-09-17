import { shotDurationSeconds } from "./constants";

/**
 * How long a written line takes to say, measured before anything is generated.
 *
 * Counting characters answers the wrong question: "a" and "extraordinarily"
 * are both one word, and an English sentence of the same length can run two
 * seconds shorter or longer depending on its syllables. Narration that does
 * not fit its shot is only discovered after every shot has been paid for, so
 * the estimate has to be made at authoring time and be about time, not length.
 *
 * Delivery densities are whole-passage rates that already include ordinary
 * speech pauses, not pause-free articulation rates. They are authoring
 * starting points, not a calibration of any particular voice model.
 */
const DELIVERY_UNITS_PER_SECOND: Record<string, number> = {
  en: 4.6,
  es: 5.9,
  pt: 5.8,
  /** Han characters, roughly one syllable each. */
  "zh-Hans": 5.25,
  /** Morae, which is why small kana do not count on their own. */
  ja: 7.5,
  /** Hangul syllable blocks. */
  ko: 5.7,
};

const CJK_UNIT =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
/** Small kana modify the preceding mora rather than adding one. */
const SMALL_KANA = /[ぁぃぅぇぉゃゅょゎァィゥェォャュョヮ]/u;
const LATIN_WORD = /[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu;

function deliveryRate(locale: string): number {
  return DELIVERY_UNITS_PER_SECOND[locale] ?? DELIVERY_UNITS_PER_SECOND.en!;
}

/**
 * Digits are spoken, and shopping copy is full of them: prices, capacities,
 * discounts, battery hours. Counting only letters rated "5000mAh, 24 hours"
 * at nearly nothing. No dictionary settles how a number is read aloud, so the
 * count is per digit, a little above one syllable each.
 */
const SYLLABLES_PER_DIGIT = 1.5;

/**
 * Vowel-cluster syllable counting. It is an approximation with no pronunciation
 * dictionary behind it, deliberately: a dictionary cannot pronounce the brand
 * names and product models this copy is full of either.
 */
function latinSyllables(word: string, locale: string): number {
  const digits = (word.match(/\d/g) ?? []).length * SYLLABLES_PER_DIGIT;
  const normalized = word
    .toLowerCase()
    .normalize("NFC")
    .replace(/[^a-záéíóúüñãâêôçà]/g, "");
  if (!normalized) return digits;
  if (locale === "es" || locale === "pt") {
    const clusters = normalized.match(/[aeiouáéíóúüãâêôà]+/g) ?? [];
    return (
      digits +
      Math.max(
        1,
        clusters.reduce((sum, cluster) => {
          // A cluster is one syllable unless it holds more than one strong vowel.
          const strong = cluster.match(/[aeoáéóãâêôà]/g)?.length ?? 0;
          return sum + Math.max(1, strong);
        }, 0),
      )
    );
  }
  if (normalized.length <= 3) return digits + 1;
  const stripped = normalized
    .replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "")
    .replace(/^y/, "");
  return digits + Math.max(1, stripped.match(/[aeiouy]+/g)?.length ?? 1);
}

/** Pronunciation units in one written line, in the unit its locale is rated in. */
function countSpeechUnits(text: string, locale: string): number {
  const cjk = [...text].filter(
    (character) => CJK_UNIT.test(character) && !SMALL_KANA.test(character),
  ).length;
  const latin = (
    text.replace(new RegExp(CJK_UNIT.source, "gu"), " ").match(LATIN_WORD) ?? []
  ).reduce((sum, word) => sum + latinSyllables(word, locale), 0);
  return cjk + latin;
}

/** Seconds the wording needs at the locale's ordinary delivery density. */
export function estimateSpeechSeconds(text: string, locale: string): number {
  if (!text.trim()) return 0;
  return countSpeechUnits(text, locale) / deliveryRate(locale);
}

/**
 * Every beat's line must fit its own shot, and the whole track must fit the
 * clip. A beat that fails here costs nothing to rewrite; the same line reaching
 * the renderer wastes every shot generated before it.
 */
export function voiceoverFitsBeats(
  beats: readonly { start: number; end: number; voiceover: string }[],
  locale: string,
): boolean {
  const total = beats.reduce(
    (sum, beat) => sum + estimateSpeechSeconds(beat.voiceover, locale),
    0,
  );
  return (
    total <= (beats.at(-1)?.end ?? 0) &&
    beats.every(
      (beat) =>
        estimateSpeechSeconds(beat.voiceover, locale) <=
        shotDurationSeconds(beat),
    )
  );
}
