import { describe, expect, it } from "@jest/globals";
import { beatsCoverDuration, shotDurationSeconds } from "./constants";
import { buildSubtitleTrack } from "./composition";
import { alignScriptToEvidence, speechMatchesScript } from "./media/alignment";
import { estimateSpeechSeconds, voiceoverFitsBeats } from "./speech-estimate";

describe("segmented production invariants", () => {
  it("rounds contiguous approved beats to provider-sized shots", () => {
    expect(
      beatsCoverDuration(
        [
          { start: 0, end: 10 },
          { start: 10, end: 20 },
          { start: 20, end: 30 },
        ],
        30,
      ),
    ).toBe(true);
    expect(
      beatsCoverDuration(
        [
          { start: 0, end: 16 },
          { start: 16, end: 30 },
        ],
        30,
      ),
    ).toBe(false);
    expect(
      beatsCoverDuration(
        [
          { start: 0, end: 10 },
          { start: 11, end: 30 },
        ],
        30,
      ),
    ).toBe(false);
    expect(
      beatsCoverDuration(
        [
          { start: 0, end: 7.5 },
          { start: 7.5, end: 15 },
        ],
        15,
      ),
    ).toBe(true);
    expect(shotDurationSeconds({ start: 0, end: 7.5 })).toBe(8);
    expect(shotDurationSeconds({ start: 7.5, end: 15 })).toBe(7);
  });

  it("measures how long a line takes to say rather than how long it is", () => {
    // Fewer characters, more syllables, so the shorter string takes longer.
    expect("unable".length).toBeLessThan("strength".length);
    expect(estimateSpeechSeconds("unable", "en")).toBeGreaterThan(
      estimateSpeechSeconds("strength", "en"),
    );
    expect(estimateSpeechSeconds("", "en")).toBe(0);
    // Shopping copy is mostly numbers, and numbers are spoken.
    expect(estimateSpeechSeconds("2024 2025 2026", "en")).toBeGreaterThan(1);
    expect(estimateSpeechSeconds("5000mAh battery", "en")).toBeGreaterThan(
      estimateSpeechSeconds("battery", "en"),
    );
    // Small kana modify the preceding mora instead of adding one.
    expect(estimateSpeechSeconds("きゃ", "ja")).toBe(
      estimateSpeechSeconds("き", "ja"),
    );
  });

  it("rejects a beat whose line cannot be read inside its own shot", () => {
    expect(
      voiceoverFitsBeats(
        [{ start: 0, end: 3, voiceover: "A concise line" }],
        "en",
      ),
    ).toBe(true);
    expect(
      voiceoverFitsBeats(
        [
          {
            start: 0,
            end: 3,
            voiceover:
              "A line that clearly cannot fit in just three seconds of narration",
          },
        ],
        "en",
      ),
    ).toBe(false);
    // The whole track fits its clip even though no single beat overruns.
    expect(
      voiceoverFitsBeats(
        [
          { start: 0, end: 4, voiceover: "Seventeen separate syllables here" },
          { start: 4, end: 8, voiceover: "Another seventeen syllables spoken" },
        ],
        "en",
      ),
    ).toBe(true);
  });

  it("captions the approved wording, not what the recognizer heard", () => {
    const result = buildSubtitleTrack([
      {
        durationMs: 3000,
        voiceover: "VibeSKU ships today.",
        words: [
          { text: "vibe", startMs: 100, endMs: 500 },
          { text: "sku", startMs: 500, endMs: 900 },
          { text: "ships", startMs: 900, endMs: 1300 },
          { text: "today", startMs: 1300, endMs: 1800 },
        ],
      },
    ]);
    expect(result).toContain("VibeSKU ships today");
    expect(result).not.toContain("vibe sku");
  });

  it("offsets measured word times across shots and breaks on script punctuation", () => {
    const result = buildSubtitleTrack([
      {
        durationMs: 3000,
        voiceover: "Hello.",
        words: [{ text: "Hello", startMs: 100, endMs: 900 }],
      },
      {
        durationMs: 3000,
        voiceover: "World.",
        words: [{ text: "world", startMs: 200, endMs: 1000 }],
      },
    ]);
    expect(result).toContain("00:00:03,200 --> 00:00:04,000");
    // Two sentences in two shots never share one cue.
    expect(result.split("-->")).toHaveLength(3);
  });

  it("never drops approved wording the recognizer missed", () => {
    // Recognition heard only the last two words. The rest is long enough to be
    // split off by the line-length limit, which is where it used to vanish.
    const line = "Honestly this completely changed my routine, buy now.";
    const words = [
      { text: "buy", startMs: 2000, endMs: 2300 },
      { text: "now", startMs: 2300, endMs: 2600 },
    ];
    const tokens = alignScriptToEvidence(line, words);
    expect(tokens.filter((token) => !token.window).length).toBeGreaterThan(3);

    const result = buildSubtitleTrack([
      { durationMs: 8000, voiceover: line, words },
    ]);
    for (const word of [
      "Honestly",
      "completely",
      "changed",
      "routine",
      "buy",
    ]) {
      expect(result).toContain(word);
    }
  });

  it("shows nothing for a line that was never spoken at all", () => {
    expect(
      buildSubtitleTrack([
        { durationMs: 4000, voiceover: "Silent beat.", words: [] },
      ]),
    ).toBe("");
  });

  it("times a recognizer that reports words where the script has characters", () => {
    // Mandarin recognition returns words, the script tokenises to characters.
    // Alignment must still place every character without a one-to-one pair.
    const tokens = alignScriptToEvidence("这款面霜很好用", [
      { text: "这款", startMs: 0, endMs: 400 },
      { text: "面霜", startMs: 400, endMs: 900 },
      { text: "很好用", startMs: 900, endMs: 1500 },
    ]);
    expect(tokens).toHaveLength(7);
    expect(tokens.every((token) => token.window)).toBe(true);
    expect(tokens[0]!.window!.startMs).toBe(0);
    expect(tokens.at(-1)!.window!.endMs).toBe(1500);
    // And the verdict on the take is unaffected by that tokenisation gap.
    expect(speechMatchesScript("这款面霜很好用", "这款 面霜 很好用")).toBe(
      true,
    );
  });

  it("flags a performance that said something else", () => {
    expect(speechMatchesScript("Hello, world!", "hello world")).toBe(true);
    expect(
      speechMatchesScript("Hello, world!", "different product and offer"),
    ).toBe(false);
    // A silent beat that produced speech is a hallucinated performance.
    expect(speechMatchesScript("", "buy now")).toBe(false);
  });
});
