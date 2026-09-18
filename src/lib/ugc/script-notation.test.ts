import { describe, expect, it } from "@jest/globals";
import {
  displayText,
  parseScriptNotation,
  spokenText,
} from "./script-notation";

describe("script notation", () => {
  it("leaves a plain line exactly as written", () => {
    const line = "It picks up crumbs from the sofa in one pass.";
    expect(spokenText(line)).toBe(line);
    expect(displayText(line)).toBe(line);
  });

  it("speaks and captions a dual-text span differently", () => {
    const line = "The <GT-7000|gee tee seven thousand> holds a week.";
    expect(spokenText(line)).toBe("The gee tee seven thousand holds a week.");
    expect(displayText(line)).toBe("The GT-7000 holds a week.");
  });

  it("removes a caption break from what is performed", () => {
    expect(spokenText("One pass.||Then it is done.")).toBe(
      "One pass. Then it is done.",
    );
    expect(displayText("一次搞定。||真的。")).toBe("一次搞定。真的。");
  });

  it("keeps a malformed span visible instead of deleting words", () => {
    const line = "Model <  |x> ships today.";
    expect(spokenText(line)).toBe(line);
    expect(displayText(line)).toBe(line);
  });

  it("reports the break so a caption can be cut there", () => {
    expect(parseScriptNotation("a||b")).toEqual([
      { kind: "text", text: "a" },
      { kind: "break" },
      { kind: "text", text: "b" },
    ]);
  });
});
