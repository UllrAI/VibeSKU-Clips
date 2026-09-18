import type { TranscriptWord } from "@/database/ugc";
import { parseScriptNotation } from "../script-notation";

/**
 * Aligning the approved script with what the recognizer actually heard.
 *
 * Recognition supplies timing, never wording. A recognizer mangles exactly the
 * words this product cannot afford to get wrong — brand names, model numbers,
 * invented product words — and a subtitle burned into an MP4 cannot be
 * corrected afterwards. So captions are rendered from the script the operator
 * approved, positioned by the acoustic evidence measured against it.
 */

const SENTENCE_END = /[.!?。！？…]/u;
const CLAUSE_END = /[,、，;；:：]/u;
const CJK_CHARACTER =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

/** Largest number of tokens on either side that one alignment group may cover. */
const MAX_GROUP = 3;
/** A script word the recognizer never produced. */
const OMISSION_COST = 0.5;
/** A recognized word no script word accounts for. */
const INSERTION_COST = 0.35;

interface ScriptToken {
  text: string;
  normalized: string;
  /** How strongly the script wants a caption to end here. */
  breakAfter: "hard" | "soft" | "none";
}

export interface TimedToken extends ScriptToken {
  /**
   * Null when no acoustic evidence covers this token. The script still says it,
   * so it is still captioned; it just carries no window of its own and has to
   * be shown alongside words that do.
   */
  window: { startMs: number; endMs: number } | null;
}

function normalizeForAlignment(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function editDistance(
  left: readonly string[],
  right: readonly string[],
): number {
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    const current = [leftIndex + 1];
    for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
      current.push(
        Math.min(
          previous[rightIndex + 1]! + 1,
          current[rightIndex]! + 1,
          previous[rightIndex]! +
            (left[leftIndex] === right[rightIndex] ? 0 : 1),
        ),
      );
    }
    previous = current;
  }
  return previous[right.length]!;
}

/**
 * One token per Latin word and per CJK character, which is the granularity
 * recognizers report and the granularity a caption line breaks at.
 *
 * Script notation is resolved here rather than before here: a dual-text span
 * aligns on what was spoken and captions on what was written, so the two sides
 * have to stay attached to the same tokens.
 */
function tokenizeScript(text: string): ScriptToken[] {
  const tokens: ScriptToken[] = [];
  let latin = "";
  const flush = () => {
    if (!latin) return;
    const normalized = normalizeForAlignment(latin);
    if (normalized)
      tokens.push({ text: latin, normalized, breakAfter: "none" });
    latin = "";
  };
  const mark = (strength: "hard" | "soft") => {
    const last = tokens.at(-1);
    if (last && (strength === "hard" || last.breakAfter === "none")) {
      last.breakAfter = strength;
    }
  };
  const consume = (value: string) => {
    for (const character of value) {
      if (CJK_CHARACTER.test(character)) {
        flush();
        tokens.push({
          text: character,
          normalized: normalizeForAlignment(character),
          breakAfter: "none",
        });
        continue;
      }
      if (SENTENCE_END.test(character)) {
        flush();
        mark("hard");
        continue;
      }
      if (CLAUSE_END.test(character)) {
        flush();
        mark("soft");
        continue;
      }
      if (/\s/u.test(character)) {
        flush();
        continue;
      }
      latin += character;
    }
    flush();
  };

  for (const chunk of parseScriptNotation(text)) {
    if (chunk.kind === "break") {
      mark("hard");
      continue;
    }
    if (chunk.kind === "text") {
      consume(chunk.text);
      continue;
    }
    // The span is spoken as several words and captioned as one. Alignment runs
    // on the spoken side; the written side rides on the first of its tokens so
    // the caption appears exactly once, at the moment the span begins.
    const start = tokens.length;
    consume(chunk.spoken);
    for (let index = start; index < tokens.length; index += 1) {
      tokens[index] = {
        ...tokens[index]!,
        text: index === start ? chunk.display : "",
      };
    }
  }
  return tokens;
}

interface Group {
  sourceStart: number;
  sourceEnd: number;
  evidenceStart: number;
  evidenceEnd: number;
  exact: boolean;
}

interface Cell {
  cost: number;
  exactTokens: number;
  previousSource: number;
  previousEvidence: number;
  group: Group;
}

function groupCost(
  source: readonly ScriptToken[],
  evidence: readonly TranscriptWord[],
): number {
  const sourceText = source.map((token) => token.normalized).join("");
  const evidenceText = evidence
    .map((word) => normalizeForAlignment(word.text))
    .join("");
  // Identical wording split differently is a tokenisation difference, not a
  // misreading. Its cost must not grow with the letters a recognizer emits.
  const grouping = 0.055 * Math.max(0, source.length + evidence.length - 2);
  if (sourceText === evidenceText) return grouping;
  const width = Math.max(sourceText.length, evidenceText.length, 1);
  return editDistance([...sourceText], [...evidenceText]) / width + grouping;
}

/** Cheapest interpretation of the evidence as a reading of the script. */
function alignGroups(
  source: readonly ScriptToken[],
  evidence: readonly TranscriptWord[],
): Group[] {
  const rows: (Cell | undefined)[][] = Array.from(
    { length: source.length + 1 },
    () => Array<Cell | undefined>(evidence.length + 1).fill(undefined),
  );
  rows[0]![0] = {
    cost: 0,
    exactTokens: 0,
    previousSource: -1,
    previousEvidence: -1,
    group: {
      sourceStart: 0,
      sourceEnd: 0,
      evidenceStart: 0,
      evidenceEnd: 0,
      exact: false,
    },
  };

  const relax = (
    sourceIndex: number,
    evidenceIndex: number,
    group: Group,
    cost: number,
  ): void => {
    const previous = rows[sourceIndex]![evidenceIndex];
    if (!previous) return;
    const candidate: Cell = {
      cost: previous.cost + cost,
      exactTokens: previous.exactTokens + (group.exact ? 1 : 0),
      previousSource: sourceIndex,
      previousEvidence: evidenceIndex,
      group,
    };
    const current = rows[group.sourceEnd]![group.evidenceEnd];
    if (
      !current ||
      candidate.cost < current.cost - 1e-9 ||
      (candidate.cost < current.cost + 1e-9 &&
        candidate.exactTokens > current.exactTokens)
    ) {
      rows[group.sourceEnd]![group.evidenceEnd] = candidate;
    }
  };

  for (let s = 0; s <= source.length; s += 1) {
    for (let e = 0; e <= evidence.length; e += 1) {
      if (!rows[s]![e]) continue;
      for (
        let take = 1;
        take <= MAX_GROUP && s + take <= source.length;
        take += 1
      ) {
        for (
          let heard = 1;
          heard <= MAX_GROUP && e + heard <= evidence.length;
          heard += 1
        ) {
          const sourceGroup = source.slice(s, s + take);
          const evidenceGroup = evidence.slice(e, e + heard);
          relax(
            s,
            e,
            {
              sourceStart: s,
              sourceEnd: s + take,
              evidenceStart: e,
              evidenceEnd: e + heard,
              exact:
                take === 1 &&
                heard === 1 &&
                sourceGroup[0]!.normalized ===
                  normalizeForAlignment(evidenceGroup[0]!.text),
            },
            groupCost(sourceGroup, evidenceGroup),
          );
        }
      }
      if (s < source.length) {
        relax(
          s,
          e,
          {
            sourceStart: s,
            sourceEnd: s + 1,
            evidenceStart: e,
            evidenceEnd: e,
            exact: false,
          },
          OMISSION_COST,
        );
      }
      if (e < evidence.length) {
        relax(
          s,
          e,
          {
            sourceStart: s,
            sourceEnd: s,
            evidenceStart: e,
            evidenceEnd: e + 1,
            exact: false,
          },
          INSERTION_COST,
        );
      }
    }
  }

  const groups: Group[] = [];
  let s = source.length;
  let e = evidence.length;
  while (s > 0 || e > 0) {
    const cell = rows[s]![e];
    if (!cell) throw new Error("Speech alignment produced no complete path.");
    groups.push(cell.group);
    s = cell.previousSource;
    e = cell.previousEvidence;
  }
  return groups.reverse();
}

/** Spread one measured window across the script tokens that share it. */
function distribute(
  tokens: TimedToken[],
  source: readonly ScriptToken[],
  group: Group,
  startMs: number,
  endMs: number,
): void {
  const covered = source.slice(group.sourceStart, group.sourceEnd);
  const total = covered.reduce(
    (sum, token) => sum + token.normalized.length,
    0,
  );
  let offset = 0;
  for (const [index, token] of covered.entries()) {
    const width = total
      ? (token.normalized.length / total) * (endMs - startMs)
      : 0;
    tokens[group.sourceStart + index] = {
      ...token,
      window: {
        startMs: Math.round(startMs + offset),
        endMs: Math.round(startMs + offset + width),
      },
    };
    offset += width;
  }
}

export function alignScriptToEvidence(
  scriptText: string,
  words: readonly TranscriptWord[],
): TimedToken[] {
  const source = tokenizeScript(scriptText);
  const evidence = words.filter((word) => normalizeForAlignment(word.text));
  if (!source.length) return [];

  const tokens: TimedToken[] = source.map((token) => ({
    ...token,
    window: null,
  }));
  for (const group of alignGroups(source, evidence)) {
    if (
      group.evidenceEnd > group.evidenceStart &&
      group.sourceEnd > group.sourceStart
    ) {
      distribute(
        tokens,
        source,
        group,
        evidence[group.evidenceStart]!.startMs,
        evidence[group.evidenceEnd - 1]!.endMs,
      );
    }
  }
  return tokens;
}

/**
 * Whether the performance said the approved line at all.
 *
 * This is deliberately not read off the alignment above. Alignment explains the
 * evidence as a reading of the script and will merge or split tokens to do it,
 * which is exactly right for placing words in time and useless as a verdict —
 * a recognizer that reports Chinese in words rather than characters produces a
 * perfectly aligned take with almost no one-to-one pairs. Whole-text distance
 * asks the separate question of whether the wording matches.
 */
export function speechMatchesScript(expected: string, actual: string): boolean {
  const a = normalizeForAlignment(expected);
  const b = normalizeForAlignment(actual);
  if (!a) return !b;
  if (!b) return false;
  // Recognition may omit small particles or punctuation; a large disagreement is unsafe.
  if (Math.abs(a.length - b.length) / a.length > 0.3) return false;
  return editDistance([...a], [...b]) / Math.max(a.length, b.length) <= 0.25;
}
