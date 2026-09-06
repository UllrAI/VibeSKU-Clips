import { describe, expect, it } from "@jest/globals";
import { workStepPosition, workStepsFor } from "./work-steps";

describe("work steps", () => {
  it("skips storyboard for one-take video", () => {
    expect(workStepsFor("one_take")).toEqual(["product", "script", "video"]);
    expect(workStepPosition("video", "one_take")).toBe(2);
    expect(workStepPosition("done", "one_take")).toBe(3);
  });

  it("keeps storyboard in the reviewed workflow", () => {
    expect(workStepsFor("storyboard")).toEqual([
      "product",
      "script",
      "storyboard",
      "video",
    ]);
    expect(workStepPosition("video", "storyboard")).toBe(3);
    expect(workStepPosition("done", "storyboard")).toBe(4);
  });
});
