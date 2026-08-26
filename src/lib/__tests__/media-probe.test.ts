import { describe, expect, it } from "vitest";
import { parseFrameRate } from "@/lib/media-probe";

describe("media frame-rate parsing", () => {
  it("parses rational FFprobe rates and rejects invalid metadata", () => {
    expect(parseFrameRate("30000/1001")).toBeCloseTo(29.97003, 5);
    expect(parseFrameRate("25/1")).toBe(25);
    expect(parseFrameRate("0/0")).toBe(30);
    expect(parseFrameRate("1000/1")).toBe(30);
  });
});
