import { afterEach, describe, expect, it } from "@jest/globals";
import {
  activeVideoModelOptions,
  activeVideoProvider,
  isActiveVideoConfiguration,
  submitVideo,
  videoTaskProvider,
} from "./video-provider";

describe("video provider selection", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.VIDEO_GENERATION_PROVIDER;
    delete process.env.LK888_API_KEY;
  });

  it("defaults to Prism and its supported resolutions", () => {
    expect(activeVideoProvider({})).toBe("prism");
    expect(activeVideoModelOptions({})).toEqual([
      { model: "h3", resolutions: ["480p", "720p"] },
    ]);
    expect(isActiveVideoConfiguration("seedance-2.0", "720p", {})).toBe(false);
  });

  it("offers 768-mapped 720p and higher tiers for lk888", () => {
    const source = { VIDEO_GENERATION_PROVIDER: "lk888" };

    expect(activeVideoProvider(source)).toBe("lk888");
    expect(activeVideoModelOptions(source)).toEqual([
      { model: "h3", resolutions: ["720p", "1080p", "2k"] },
      {
        model: "seedance-2.0",
        resolutions: ["480p", "720p", "1080p"],
      },
      {
        model: "seedance-2.5",
        resolutions: ["480p", "720p", "1080p"],
      },
    ]);
    expect(isActiveVideoConfiguration("seedance-2.5", "2k", source)).toBe(
      false,
    );
  });

  it("prefixes submitted task ids so polling survives provider changes", async () => {
    process.env.VIDEO_GENERATION_PROVIDER = "lk888";
    process.env.LK888_API_KEY = "test-key";
    jest
      .spyOn(global, "fetch")
      .mockResolvedValue(
        Response.json({ code: 200, data: { task_id: 99 }, msg: "ok" }),
      );

    await expect(
      submitVideo({
        model: "h3",
        prompt: "One take",
        referenceUrls: ["https://example.com/product.png"],
        durationSeconds: 15,
        aspectRatio: "9:16",
        resolution: "720p",
        requestId: "request-id",
      }),
    ).resolves.toBe("lk888:99");
  });

  it("reads the provider back off a saved task id", () => {
    expect(videoTaskProvider("lk888:seedance:99")).toBe("lk888");
    expect(videoTaskProvider("prism:abc")).toBe("prism");
    // Saved before provider routing existed.
    expect(videoTaskProvider("abc")).toBe("prism");
    expect(() => videoTaskProvider("vendor:abc")).toThrow(
      "The saved video provider task id is invalid.",
    );
  });
});
