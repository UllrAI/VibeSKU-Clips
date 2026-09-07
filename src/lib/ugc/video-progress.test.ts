import { videoGenerationPhase, VIDEO_PROGRESS_STEP } from "./video-progress";

describe("videoGenerationPhase", () => {
  it("shows accepted tasks as queued before the worker starts", () => {
    expect(videoGenerationPhase("queued", null)).toBe("queued");
  });

  it("shows a running task as preparing until the provider accepts it", () => {
    expect(videoGenerationPhase("running", null)).toBe("preparing");
  });

  it("preserves the provider stage while a continuation is waiting", () => {
    expect(
      videoGenerationPhase("waiting", {
        step: VIDEO_PROGRESS_STEP.rendering,
      }),
    ).toBe("rendering");
  });

  it("reports archiving after the provider finishes", () => {
    expect(
      videoGenerationPhase("running", {
        step: VIDEO_PROGRESS_STEP.archiving,
      }),
    ).toBe("archiving");
  });
});
