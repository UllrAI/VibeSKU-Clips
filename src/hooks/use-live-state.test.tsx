import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import { act, renderHook } from "@testing-library/react";

jest.mock("next/navigation", () => ({
  useRouter: jest.fn(),
}));

import { useRouter } from "next/navigation";
import { useLiveState } from "./use-live-state";

interface TestState {
  revision: string;
  live: boolean;
  failed: boolean;
}

const isLive = (state: TestState) => state.live;
const mockUseRouter = useRouter as jest.MockedFunction<typeof useRouter>;

describe("useLiveState", () => {
  const refresh = jest.fn();

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockUseRouter.mockReturnValue({ refresh } as ReturnType<typeof useRouter>);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("adopts a newer state supplied by a server refresh", () => {
    const first: TestState = {
      revision: "done-v1",
      live: false,
      failed: false,
    };
    const next: TestState = {
      revision: "running-v2",
      live: true,
      failed: false,
    };
    const { result, rerender } = renderHook(
      ({ initial }) => useLiveState("/state", initial, isLive),
      { initialProps: { initial: first } },
    );

    rerender({ initial: next });

    expect(result.current).toEqual(next);
  });

  it("publishes a failed poll before the page refresh completes", async () => {
    const failed: TestState = {
      revision: "failed-v2",
      live: false,
      failed: true,
    };
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => failed,
    } as Response);

    const { result } = renderHook(() =>
      useLiveState(
        "/state",
        { revision: "running-v2", live: true, failed: false },
        isLive,
      ),
    );

    await act(async () => {
      jest.advanceTimersByTime(3_000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(result.current).toEqual(failed);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
