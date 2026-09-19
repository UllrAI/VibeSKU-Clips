import { describe, expect, it } from "@jest/globals";
import { mediaTaskLog } from "./task-log";

describe("mediaTaskLog", () => {
  it("names the provider and the id before anything has come back", () => {
    expect(mediaTaskLog("lk888", "lk888:99")).toEqual({
      provider: "lk888",
      providerTaskId: "lk888:99",
    });
  });

  it("carries the provider url and usage once the job lands", () => {
    expect(
      mediaTaskLog("prism", "prism:abc", {
        status: "completed",
        outputUrl: "https://provider.example/clip.mp4",
        errorMessage: null,
        provider: "fal",
        extra: { cost: 12 },
      }),
    ).toEqual({
      provider: "prism",
      providerTaskId: "prism:abc",
      servedBy: "fal",
      outputUrl: "https://provider.example/clip.mp4",
      providerUsage: { cost: 12 },
    });
  });

  it("reports the provider's own reason for a failure", () => {
    expect(
      mediaTaskLog("lk888", "lk888:99", {
        status: "failed",
        outputUrl: null,
        errorMessage: "content rejected",
        provider: "lk888",
        extra: null,
      }),
    ).toEqual({
      provider: "lk888",
      providerTaskId: "lk888:99",
      providerError: "content rejected",
    });
  });
});
