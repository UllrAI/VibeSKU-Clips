import { describe, it, expect, vi, afterEach } from "vitest";
import { PrismProvider } from "@/lib/providers/prism";
import { ProviderError } from "@/lib/providers/base";

/**
 * Issue #16 regressions — paid-task money safety.
 *
 * A user clicked "convert to motion" once, the UI reported a 30s timeout, yet the gateway had
 * billed a text-to-video task and the app kept no task ID. The provider changed since (one
 * gateway instead of seven), but the four defects behind that loss are properties of the
 * request layer, not of any one vendor, so the nets stay:
 *  1. non-idempotent POST auto-retried on timeout → could create duplicate paid tasks
 *  2. task ID unavailable until final success → a poll failure lost the paid task
 *  3. one transient status-query failure aborted the whole wait
 *  4. a failed task must still surface its ID so the run can be recovered
 */

const cfg = { name: "prism", apiKey: "test-key", apiSecret: "test-secret", baseUrl: "https://example.com", timeout: 50 };

// access the protected request/getTaskStatus for direct policy testing
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asAny = (p: unknown) => p as any;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** fetch stub that never responds and rejects with AbortError when the request times out */
function stubHangingFetch() {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Promise((_, reject) => {
        init.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      });
    })
  );
  return calls;
}

/** fetch stub that always returns the given HTTP status */
function stubStatusFetch(status: number) {
  const fn = vi.fn(async () => ({
    ok: false,
    status,
    statusText: "ERR",
    text: async () => "boom",
  }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("非幂等付费 POST 的重试策略（issue #16 问题1）", () => {
  it("POST 超时：绝不自动重试（fetch 仅 1 次），且错误提示服务端可能已受理", async () => {
    const calls = stubHangingFetch();
    const p = new PrismProvider(cfg);
    await expect(asAny(p).request("/video-gen", { method: "POST", body: {} })).rejects.toMatchObject({
      code: "TIMEOUT",
      message: expect.stringContaining("服务端可能已受理"),
    });
    expect(calls.length).toBe(1);
  });

  it("GET 超时：幂等请求照常重试（fetch 3 次）", async () => {
    const calls = stubHangingFetch();
    const p = new PrismProvider(cfg);
    await expect(asAny(p).request("/tasks/x")).rejects.toMatchObject({ code: "TIMEOUT" });
    expect(calls.length).toBe(3);
  }, 15000);

  it("POST 429：服务端明确拒绝（未受理），可以安全重试（fetch 3 次）", async () => {
    const fn = stubStatusFetch(429);
    const p = new PrismProvider(cfg);
    await expect(asAny(p).request("/video-gen", { method: "POST", body: {} })).rejects.toThrow(ProviderError);
    expect(fn.mock.calls.length).toBe(3);
  }, 15000);

  it("POST 500：服务端状态不明，不重试（fetch 仅 1 次）", async () => {
    const fn = stubStatusFetch(500);
    const p = new PrismProvider(cfg);
    await expect(asAny(p).request("/video-gen", { method: "POST", body: {} })).rejects.toThrow(ProviderError);
    expect(fn.mock.calls.length).toBe(1);
  });

  it("显式声明 idempotent: true 的 POST 可重试（预留给带幂等键的平台）", async () => {
    const fn = stubStatusFetch(500);
    const p = new PrismProvider(cfg);
    await expect(asAny(p).request("/video-gen", { method: "POST", body: {}, idempotent: true })).rejects.toThrow(
      ProviderError
    );
    expect(fn.mock.calls.length).toBe(3);
  }, 15000);
});

describe("提交前校验：错误的模型 id 不产生任何付费调用", () => {
  it("目录里没有的视频模型 → 提交前报 UNKNOWN_MODEL，request 未被调用", async () => {
    const p = new PrismProvider(cfg);
    const req = vi.spyOn(asAny(p), "request").mockResolvedValue({ data: { task_id: "never" } });
    await expect(
      p.submitVideoTask({ modelId: "my-org/custom-model", mode: "image-to-video", prompt: "x" })
    ).rejects.toMatchObject({ code: "UNKNOWN_MODEL" });
    expect(req).not.toHaveBeenCalled();
  });
});

describe("两阶段提交：先拿 task ID 再轮询（issue #16 问题2/3）", () => {
  it("submitVideoTask 只提交不轮询：返回 taskId，getTaskStatus 不被调用", async () => {
    const p = new PrismProvider(cfg);
    vi.spyOn(asAny(p), "request").mockResolvedValue({ data: { task_id: "task-3" } });
    const statusSpy = vi.spyOn(p, "getTaskStatus");
    const { taskId, modelId } = await p.submitVideoTask({
      modelId: "minimax-h3",
      mode: "image-to-video",
      prompt: "x",
      firstFrameUrl: "https://example.com/f.png",
    });
    expect(taskId).toBe("task-3");
    expect(modelId).toBe("minimax-h3");
    expect(statusSpy).not.toHaveBeenCalled();
  });

  it("已受理但响应里没有 task_id → 报错而不是把 undefined 当任务 ID 继续轮询", async () => {
    const p = new PrismProvider(cfg);
    vi.spyOn(asAny(p), "request").mockResolvedValue({ success: true, data: {} });
    await expect(
      p.submitVideoTask({ modelId: "minimax-h3", mode: "text-to-video", prompt: "x" })
    ).rejects.toMatchObject({ code: "NO_TASK_ID" });
  });
});

describe("轮询容错：临时查询失败不能丢弃已付费任务（issue #16 问题3/修复4）", () => {
  it("状态查询失败 2 次后恢复 → 最终成功返回结果", async () => {
    const p = new PrismProvider(cfg);
    const statusSpy = vi
      .spyOn(p, "getTaskStatus")
      .mockRejectedValueOnce(new ProviderError("超时", "TIMEOUT", "prism"))
      .mockRejectedValueOnce(new ProviderError("超时", "TIMEOUT", "prism"))
      .mockResolvedValue({
        taskId: "task-4",
        status: "completed",
        result: { taskId: "task-4", videoUrls: ["https://example.com/v.mp4"], modelId: "m" },
      });
    const final = await p.waitForTask("task-4", { interval: 1 });
    expect(final.status).toBe("completed");
    expect(statusSpy.mock.calls.length).toBe(3);
  });

  it("状态查询持续失败 → 报 STATUS_UNKNOWN（而非任务失败），并携带 taskId 供恢复", async () => {
    const p = new PrismProvider(cfg);
    vi.spyOn(p, "getTaskStatus").mockRejectedValue(new ProviderError("网络中断", "NETWORK_ERROR", "prism"));
    try {
      await p.waitForTask("task-5", { interval: 1 });
      expect.unreachable("应当抛出 STATUS_UNKNOWN");
    } catch (e) {
      expect(e).toBeInstanceOf(ProviderError);
      expect((e as ProviderError).code).toBe("STATUS_UNKNOWN");
      expect((e as ProviderError).taskId).toBe("task-5");
    }
  });

  it("云端明确失败 → TASK_FAILED，同样携带 taskId", async () => {
    const p = new PrismProvider(cfg);
    vi.spyOn(p, "getTaskStatus").mockResolvedValue({ taskId: "task-6", status: "failed", error: "NSFW blocked" });
    try {
      await p.waitForTask("task-6", { interval: 1 });
      expect.unreachable("应当抛出 TASK_FAILED");
    } catch (e) {
      expect((e as ProviderError).code).toBe("TASK_FAILED");
      expect((e as ProviderError).taskId).toBe("task-6");
    }
  });
});
