/**
 * Similarity hints help an operator avoid shipping near-identical clips to a
 * matrix of accounts. They are a review aid, not an originality judgement, and
 * never block generation or export on their own.
 */
const HIGH_SIMILARITY_THRESHOLD = 0.82;

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\p{P}\p{S}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Character shingles work for both spaced and unspaced writing systems. */
function shingles(text: string, size = 3): Set<string> {
  const normalized = normalize(text).replace(/ /g, "");
  const result = new Set<string>();
  for (let index = 0; index + size <= normalized.length; index += 1) {
    result.add(normalized.slice(index, index + size));
  }
  return result;
}

export function similarityScore(left: string, right: string): number {
  const a = shingles(left);
  const b = shingles(right);
  if (a.size === 0 || b.size === 0) return a.size === b.size ? 1 : 0;

  let shared = 0;
  for (const item of a) {
    if (b.has(item)) shared += 1;
  }
  return shared / (a.size + b.size - shared);
}

/** Groups clips whose spoken content is effectively the same take. */
export function similarityKeyFor(input: {
  locale: string;
  hook: string;
  voiceover: string;
}): string {
  const normalized = normalize(`${input.hook} ${input.voiceover}`);
  let hash = 5381;
  for (let index = 0; index < normalized.length; index += 1) {
    hash = ((hash << 5) + hash + normalized.charCodeAt(index)) >>> 0;
  }
  return `${input.locale}:${hash.toString(36)}`;
}

export interface SimilarityCandidate {
  id: string;
  reference: string;
  locale: string;
  text: string;
}

export interface SimilarityHint {
  id: string;
  matchedId: string;
  matchedReference: string;
  score: number;
}

/**
 * Compares each candidate against the ones before it plus any already-exported
 * material, and reports only pairs above the high-similarity threshold.
 */
export function findSimilarityHints(
  candidates: SimilarityCandidate[],
  exported: SimilarityCandidate[] = [],
): SimilarityHint[] {
  const hints: SimilarityHint[] = [];
  const seen: SimilarityCandidate[] = [...exported];

  for (const candidate of candidates) {
    let best: SimilarityHint | null = null;
    for (const other of seen) {
      if (other.locale !== candidate.locale) continue;
      const score = similarityScore(candidate.text, other.text);
      if (score < HIGH_SIMILARITY_THRESHOLD) continue;
      if (!best || score > best.score) {
        best = {
          id: candidate.id,
          matchedId: other.id,
          matchedReference: other.reference,
          score,
        };
      }
    }
    if (best) hints.push(best);
    seen.push(candidate);
  }

  return hints;
}
