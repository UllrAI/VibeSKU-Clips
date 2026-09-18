/**
 * Two annotations a spoken line may carry, and nothing else.
 *
 * A script is written for three readers at once: the voice, the caption, and
 * the person editing it. Plain text serves the voice well and the caption
 * badly, because the two disagree on exactly the words this product cannot
 * afford to get wrong — model numbers, units, invented product names — and on
 * where a thought ends.
 *
 * - `<GT-7000|gee tee seven thousand>` says the caption shows the left side
 *   while the performance says the right. Recognition hears the right side, so
 *   timing still comes from measured evidence; only the wording on screen is
 *   the writer's.
 * - `||` is a caption break the writer asked for. Without it, lines break on
 *   punctuation and then on length, which is a guess about where meaning ends.
 *
 * Both are optional. A line with neither behaves exactly as it did before.
 */

const DUAL_TEXT = /<([^<>|]{1,80})\|([^<>|]{1,80})>/g;
const CJK =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

export type ScriptChunk =
  | { kind: "text"; text: string }
  | { kind: "dual"; display: string; spoken: string }
  | { kind: "break" };

/** Joins two fragments the way the scripts they came from are written. */
export function joinSpokenText(left: string, right: string): string {
  if (!left || !right) return left + right;
  const seam = left.at(-1)!;
  const start = right[0]!;
  if (/\s/u.test(seam) || /\s/u.test(start)) return left + right;
  if (CJK.test(seam) || CJK.test(start)) return left + right;
  return `${left} ${right}`;
}

export function parseScriptNotation(raw: string): ScriptChunk[] {
  const chunks: ScriptChunk[] = [];
  const pushText = (text: string) => {
    text.split("||").forEach((part, index) => {
      if (index) chunks.push({ kind: "break" });
      if (part) chunks.push({ kind: "text", text: part });
    });
  };

  let read = 0;
  for (const match of raw.matchAll(DUAL_TEXT)) {
    pushText(raw.slice(read, match.index));
    const display = match[1]!.trim();
    const spoken = match[2]!.trim();
    // A span with an empty side says nothing useful. Show it as written rather
    // than silently deleting words the operator can see in the editor.
    if (display && spoken) chunks.push({ kind: "dual", display, spoken });
    else pushText(match[0]);
    read = match.index + match[0].length;
  }
  pushText(raw.slice(read));
  return chunks;
}

function render(raw: string, pick: (chunk: ScriptChunk) => string): string {
  return parseScriptNotation(raw).reduce(
    (line, chunk) => joinSpokenText(line, pick(chunk)),
    "",
  );
}

/** What is performed: for speech synthesis, the video model, and recognition. */
export function spokenText(raw: string): string {
  return render(raw, (chunk) =>
    chunk.kind === "dual"
      ? chunk.spoken
      : chunk.kind === "text"
        ? chunk.text
        : "",
  );
}

/** What is read: for captions and for anywhere a line is shown to a person. */
export function displayText(raw: string): string {
  return render(raw, (chunk) =>
    chunk.kind === "dual"
      ? chunk.display
      : chunk.kind === "text"
        ? chunk.text
        : "",
  );
}
