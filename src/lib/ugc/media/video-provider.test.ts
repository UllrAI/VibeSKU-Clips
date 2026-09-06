import { afterEach, describe, expect, it } from "@jest/globals";
import {
  activeVideoProvider,
  activeVideoResolutions,
  submitVideo,
} from "./video-provider";

describe("video provider selection", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.VIDEO_GENERATION_PROVIDER;
    delete process.env.LK666_API_KEY;
  });

  it("defaults to Prism and its supported resolutions", () => {
    expect(activeVideoProvider({})).toBe("prism");
    expect(activeVideoResolutions({})).toEqual(["480p", "720p"]);
  });

  it("offers 768-mapped 720p and higher tiers for lk666", () => {
    const source = { VIDEO_GENERATION_PROVIDER: "lk666" };

    expect(activeVideoProvider(source)).toBe("lk666");
    expect(activeVideoResolutions(source)).toEqual(["720p", "1080p", "2k"]);
  });

  it("prefixes submitted task ids so polling survives provider changes", async () => {
    process.env.VIDEO_GENERATION_PROVIDER = "lk666";
    process.env.LK666_API_KEY = "test-key";
    jest
      .spyOn(global, "fetch")
      .mockResolvedValue(
        Response.json({ code: 200, data: { task_id: 99 }, msg: "ok" }),
      );

    await expect(
      submitVideo({
        prompt: "One take",
        referenceUrls: ["https://example.com/product.png"],
        durationSeconds: 15,
        aspectRatio: "9:16",
        resolution: "720p",
        requestId: "request-id",
      }),
    ).resolves.toBe("lk666:99");
  });
});
