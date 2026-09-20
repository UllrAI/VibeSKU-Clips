import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { AppDatabase } from "@/database/client";

const mockCreateBackgroundTask = jest.fn();

jest.mock("@/lib/tasks/service", () => ({
  createBackgroundTask: mockCreateBackgroundTask,
}));
jest.mock("@/lib/jobs/ugc/work-script", () => ({
  workScriptJob: { name: "ugc.work.script" },
}));

beforeEach(() => {
  mockCreateBackgroundTask.mockReset();
  mockCreateBackgroundTask.mockResolvedValue({ taskRun: { id: "run-1" } });
});

describe("startWorksWaitingForProduct", () => {
  it("starts only the script task and clears automatic continuation", async () => {
    const set = jest.fn(() => ({ where: jest.fn().mockResolvedValue([]) }));
    const db = {
      select: () => ({
        from: () => ({
          where: async () => [{ id: "work-1" }],
        }),
      }),
      update: () => ({ set }),
    } as unknown as AppDatabase;
    const { startWorksWaitingForProduct } = await import("./work-script-queue");

    await startWorksWaitingForProduct(db, "product-1", "user-1");

    expect(mockCreateBackgroundTask).toHaveBeenCalledWith(
      expect.objectContaining({
        db,
        payload: { workId: "work-1", userId: "user-1" },
        idempotencyKey: "work-1:script:product-ready",
      }),
    );
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        step: "script",
        stepStatus: "running",
        taskRunId: "run-1",
        autoStartScript: false,
      }),
    );
  });
});
