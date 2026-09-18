import { generateObject } from "ai";
import { cloneBlueprintSchema } from "./blueprint-schema";
import { getAuthoringModel } from "./model";
import type { CloneBlueprint, ReferenceFrameRecord } from "./types";
import type { TranscriptWord } from "@/database/ugc";

/**
 * Reading a reference video into something a different person, selling a
 * different product, in a different language, can be made from.
 *
 * The one thing that must not survive is the reference's clock. New copy and a
 * new performer land on different seconds, so every event is recorded by what
 * it *responds to* — the cut answers a question, the close-up illustrates a
 * claim — and the original seconds are kept only so an operator can jump back
 * and check the reading.
 */

export interface AnalyzeReferenceInput {
  /** Signed, short-lived URLs for the sampled stills, in time order. */
  frames: ReferenceFrameRecord[];
  transcript: string;
  words: TranscriptWord[];
  durationMs: number;
  /** The operator's interface language. A reading is addressed to them. */
  readingLocale: string;
}

function spokenAround(words: readonly TranscriptWord[], atMs: number): string {
  const window = words.filter(
    (word) => word.endMs > atMs - 1500 && word.startMs < atMs + 1500,
  );
  return window
    .map((word) => word.text)
    .join(" ")
    .slice(0, 200);
}

/**
 * Stills carry what changed; the words carry why. Pairing each frame with the
 * speech around it is what lets the model say which idea a picture serves,
 * rather than listing what is on screen.
 */
export async function analyzeReference(
  input: AnalyzeReferenceInput,
): Promise<CloneBlueprint> {
  const { object } = await generateObject({
    model: getAuthoringModel(),
    schema: cloneBlueprintSchema,
    system: [
      "You read a short social video and explain how it works, so a different creator can make their own version of it for a different product.",
      "Watch the whole piece first: its hook, its argument or story, where attention shifts, and what it wants the viewer to feel or do. Then account for the concrete choices that make that work.",
      "Record what each visual event RESPONDS TO, never when it happened. A clone has different words, a different performer and different timing, so a cut at 3.2 seconds is worthless; 'cuts to the price tag the moment she names the number, so the comparison is readable' survives the rewrite.",
      "`sourceStart` and `sourceEnd` are seconds in the supplied reference. They exist only so a person can jump back and check your reading. Never treat them as timing for the new video.",
      "`spokenGist` is the gist of a passage in your own words. Do not transcribe it: the clone must not reuse the original's copy.",
      "`preserve` names the relationships that should survive replacing the person, the product and every word — the reason the piece holds attention.",
      "`redesign` names what belongs to this original specifically and has to be rethought: a joke about the presenter's own life, a claim only that product can make, a demonstration that needs a screen.",
      "Beats divide the piece by what each stretch accomplishes, not by camera cuts. A beat can contain several cuts; one long take can be two beats.",
      "Be concrete and specific. 'Good pacing' explains nothing; 'each example holds shorter than the last, so the list feels like it is accelerating' can be rebuilt.",
      `Write every field in ${input.readingLocale}. You are explaining this piece to an operator who reads that language, whatever language the reference itself speaks.`,
      "The one exception is words actually spoken in the reference: quote those in their original language, so they can be checked against the video. Never translate a quoted line and never present a translation as a quote.",
    ].join("\n"),
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text" as const,
            text: [
              `Reference video: ${(input.durationMs / 1000).toFixed(1)} seconds. Its spoken language is whatever the transcript below shows.`,
              "",
              "Full transcript as recognized:",
              input.transcript || "(no speech recognized)",
              "",
              `${input.frames.length} stills follow in time order, each labelled with its position and the words spoken around it.`,
            ].join("\n"),
          },
          ...input.frames.flatMap((frame) => [
            {
              type: "text" as const,
              text: `Still at ${(frame.atMs / 1000).toFixed(1)}s — spoken around here: ${
                spokenAround(input.words, frame.atMs) || "(silence)"
              }`,
            },
            {
              type: "file" as const,
              data: new URL(frame.url),
              mediaType: "image",
            },
          ]),
        ],
      },
    ],
  });

  return object;
}
