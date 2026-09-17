import { describe, expect, it } from "@jest/globals";
import {
  beatsCoverDuration,
  shotDurationSeconds,
  voiceoverBudgetFor,
  voiceoverFitsBeats,
} from "./constants";
import { buildWordSubtitleTrack } from "./composition";
import { speechMatchesScript } from "./media/speech";

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

  it("scales speech budget with the selected duration", () => {
    expect(voiceoverBudgetFor("en", 30)).toBe(voiceoverBudgetFor("en", 15) * 2);
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
  });

  it("offsets measured ASR word times across shots", () => {
    const result = buildWordSubtitleTrack([
      {
        durationMs: 3000,
        words: [{ text: "Hello", startMs: 100, endMs: 900 }],
      },
      {
        durationMs: 3000,
        words: [{ text: "world", startMs: 200, endMs: 1000 }],
      },
    ]);
    expect(result).toContain("00:00:03,200 --> 00:00:04,000");
  });

  it("flags hallucinated or missing speech", () => {
    expect(speechMatchesScript("Hello, world!", "hello world")).toBe(true);
    expect(
      speechMatchesScript("Hello, world!", "different product and offer"),
    ).toBe(false);
    expect(speechMatchesScript("", "buy now")).toBe(false);
  });
});
