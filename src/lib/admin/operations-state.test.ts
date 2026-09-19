import { describe, expect, it } from "@jest/globals";

import {
  deriveAdminWorkState,
  progressStep,
  resolveProviderTaskId,
  taskPayloadReferences,
} from "./operations-state";

describe("admin operation state", () => {
  it("keeps failures ahead of active-looking work state", () => {
    expect(
      deriveAdminWorkState({
        step: "video",
        stepStatus: "failed",
        taskStatus: "running",
      }),
    ).toBe("failed");
  });

  it("distinguishes active, completed, and operator attention", () => {
    expect(
      deriveAdminWorkState({
        step: "video",
        stepStatus: "running",
        taskStatus: "waiting",
      }),
    ).toBe("active");
    expect(
      deriveAdminWorkState({
        step: "done",
        stepStatus: "review",
        taskStatus: "completed",
      }),
    ).toBe("completed");
    expect(
      deriveAdminWorkState({
        step: "script",
        stepStatus: "review",
        taskStatus: "completed",
      }),
    ).toBe("attention");
  });

  it("reads only string owner and work references from task input", () => {
    expect(
      taskPayloadReferences({ userId: "user-1", workId: "work-1" }),
    ).toEqual({ userId: "user-1", workId: "work-1" });
    expect(taskPayloadReferences({ userId: 1, workId: null })).toEqual({
      userId: null,
      workId: null,
    });
    expect(taskPayloadReferences(null)).toEqual({
      userId: null,
      workId: null,
    });
  });
});

describe("provider job shown for a run", () => {
  it("prefers the job a working run is waiting on", () => {
    // A storyboard draws a frame per beat, and a video render spends its
    // first minutes on an opening frame. Neither is the registered job.
    expect(
      resolveProviderTaskId(
        {
          step: "drawing_storyboard",
          frame: 3,
          providerTaskId: "prism-frame-3",
        },
        null,
      ),
    ).toBe("prism-frame-3");
    expect(
      resolveProviderTaskId(
        { step: "preparing_video", providerTaskId: "prism-cover" },
        "lk888:99",
      ),
    ).toBe("prism-cover");
  });

  it("falls back to the registered job once progress is cleared", () => {
    // A finished run has no progress left, but the job it was billed for is
    // still the one to quote.
    expect(resolveProviderTaskId(null, "lk888:99")).toBe("lk888:99");
    expect(resolveProviderTaskId({ step: "rendering_video" }, "lk888:99")).toBe(
      "lk888:99",
    );
  });

  it("reports nothing for a run that never called a provider", () => {
    expect(resolveProviderTaskId({ step: "writing_script" }, null)).toBeNull();
    expect(resolveProviderTaskId({ providerTaskId: 42 }, null)).toBeNull();
  });
});

describe("progress step", () => {
  it("reads only a string step", () => {
    expect(progressStep({ step: "drawing_talent" })).toBe("drawing_talent");
    expect(progressStep({ step: 3 })).toBeNull();
    expect(progressStep(null)).toBeNull();
  });
});
