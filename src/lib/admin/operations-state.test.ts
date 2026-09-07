import { describe, expect, it } from "@jest/globals";

import {
  deriveAdminWorkState,
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
