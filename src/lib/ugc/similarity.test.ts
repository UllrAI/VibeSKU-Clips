import { describe, expect, it } from "@jest/globals";
import {
  findSimilarityHints,
  similarityKeyFor,
  similarityScore,
} from "./similarity";

describe("similarity hints", () => {
  it("scores identical wording as a full match", () => {
    expect(
      similarityScore("keeps crumbs off the sofa", "keeps crumbs off the sofa"),
    ).toBe(1);
  });

  it("scores unrelated wording low", () => {
    expect(
      similarityScore(
        "keeps crumbs off the sofa",
        "brews a cup while you get dressed",
      ),
    ).toBeLessThan(0.3);
  });

  it("ignores punctuation and casing when grouping takes", () => {
    expect(
      similarityKeyFor({
        locale: "en",
        hook: "Look at this!",
        voiceover: "It picks up everything.",
      }),
    ).toBe(
      similarityKeyFor({
        locale: "en",
        hook: "look at this",
        voiceover: "it picks up everything",
      }),
    );
  });

  it("keys the same wording apart per locale", () => {
    expect(
      similarityKeyFor({ locale: "en", hook: "a", voiceover: "b" }),
    ).not.toBe(similarityKeyFor({ locale: "es", hook: "a", voiceover: "b" }));
  });

  it("reports only the closest high-similarity pair, within one locale", () => {
    const hints = findSimilarityHints([
      {
        id: "1",
        reference: "VC-0001-001",
        locale: "en",
        text: "It picks up crumbs from the sofa in one pass.",
      },
      {
        id: "2",
        reference: "VC-0001-002",
        locale: "en",
        text: "It picks up crumbs from the sofa in one pass!",
      },
      {
        id: "3",
        reference: "VC-0001-003",
        locale: "es",
        text: "It picks up crumbs from the sofa in one pass.",
      },
      {
        id: "4",
        reference: "VC-0001-004",
        locale: "en",
        text: "Three steps to descale the kettle without a mess.",
      },
    ]);

    expect(hints).toEqual([
      expect.objectContaining({ id: "2", matchedReference: "VC-0001-001" }),
    ]);
  });

  it("compares new clips against already exported material", () => {
    const hints = findSimilarityHints(
      [
        {
          id: "new",
          reference: "VC-0002-001",
          locale: "en",
          text: "It picks up crumbs from the sofa in one pass.",
        },
      ],
      [
        {
          id: "old",
          reference: "VC-0001-001",
          locale: "en",
          text: "It picks up crumbs from the sofa in one pass.",
        },
      ],
    );

    expect(hints[0]?.matchedReference).toBe("VC-0001-001");
  });
});
