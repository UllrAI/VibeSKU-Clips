import { workListStatus } from "./work-status";

describe("workListStatus", () => {
  it("keeps a legacy reopened work complete when a usable video exists", () => {
    expect(
      workListStatus({
        failed: false,
        videoUrl: "/video.mp4",
        taskActive: false,
        work: { step: "script", stepStatus: "review" },
      }),
    ).toBe("completed");
  });

  it("shows a work as running while its next video version is active", () => {
    expect(
      workListStatus({
        failed: false,
        videoUrl: "/video.mp4",
        taskActive: true,
        work: { step: "video", stepStatus: "running" },
      }),
    ).toBe("running");
  });

  it("keeps the current video complete when a newer version fails", () => {
    expect(
      workListStatus({
        failed: true,
        videoUrl: "/video.mp4",
        taskActive: false,
        work: { step: "video", stepStatus: "running" },
      }),
    ).toBe("completed");
  });

  it("does not call a stale completed task a new active version", () => {
    expect(
      workListStatus({
        failed: false,
        videoUrl: "/video.mp4",
        taskActive: false,
        work: { step: "video", stepStatus: "running" },
      }),
    ).toBe("completed");
  });
});
