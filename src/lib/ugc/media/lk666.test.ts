import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import { PermanentJobError } from "@/lib/jobs/definition";
import { getLk666Task, lk666Resolution, submitLk666Video } from "./lk666";

describe("lk666 media client", () => {
  beforeEach(() => {
    process.env.LK666_API_BASE_URL = "https://api.lk888.ai/";
    process.env.LK666_API_KEY = "test-key";
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.LK666_API_BASE_URL;
    delete process.env.LK666_API_KEY;
  });

  it("submits H3 with the provider resolution mapping", async () => {
    const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue(
      Response.json({
        code: 200,
        data: { task_id: 123456 },
        msg: "ok",
      }),
    );

    await expect(
      submitLk666Video({
        model: "h3",
        prompt: "One continuous product demonstration",
        referenceUrls: ["https://example.com/product.png"],
        durationSeconds: 15,
        aspectRatio: "16:9",
        resolution: "720p",
        requestId: "unused-by-provider",
      }),
    ).resolves.toBe("123456");

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("https://api.lk888.ai/v1/media/generate");
    expect(init?.headers).toMatchObject({
      authorization: "Bearer test-key",
      "content-type": "application/json",
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      model: "hailuo-h3-quannengcankao",
      prompt: "One continuous product demonstration",
      params: {
        duration: "15",
        aspect_ratio: "16:9",
        resolution: "768P",
        image_url: ["https://example.com/product.png"],
      },
    });
  });

  it("uses is_final and state when polling", async () => {
    jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(
        Response.json({
          task_id: 123456,
          state: "running",
          is_final: false,
          result_url: "",
          error: "",
          cost: 0,
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          task_id: 123456,
          state: "success",
          is_final: true,
          result_url: "https://example.com/video.mp4",
          error: "",
          cost: 0.23,
        }),
      );

    await expect(getLk666Task("123456")).resolves.toMatchObject({
      status: "pending",
      outputUrl: null,
    });
    await expect(getLk666Task("123456")).resolves.toEqual({
      status: "completed",
      outputUrl: "https://example.com/video.mp4",
      errorMessage: null,
      provider: "lk666",
      extra: { cost: 0.23 },
    });
  });

  it("submits Seedance 2.5 through the documented Ark-compatible endpoint", async () => {
    const fetchMock = jest
      .spyOn(global, "fetch")
      .mockResolvedValue(Response.json({ id: "99936297", status: "queued" }));

    await expect(
      submitLk666Video({
        model: "seedance-2.5",
        prompt: "A continuous product demonstration",
        referenceUrls: ["https://example.com/product.png"],
        durationSeconds: 15,
        aspectRatio: "9:16",
        resolution: "1080p",
        requestId: "unused-by-provider",
      }),
    ).resolves.toBe("seedance:99936297");

    const [url, init] = fetchMock.mock.calls.at(-1) ?? [];
    expect(url).toBe("https://api.lk888.ai/api/v3/contents/generations/tasks");
    expect(JSON.parse(String(init?.body))).toEqual({
      model: "doubao-seedance-2-5-260628",
      content: [
        { type: "text", text: "A continuous product demonstration" },
        {
          type: "image_url",
          role: "reference_image",
          image_url: { url: "https://example.com/product.png" },
        },
      ],
      resolution: "1080p",
      ratio: "9:16",
      duration: 15,
    });
  });

  it("polls Seedance tasks and reads the completed video URL", async () => {
    const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue(
      Response.json({
        id: "99936297",
        model: "doubao-seedance-2-0-260128",
        status: "succeeded",
        error: null,
        content: { video_url: "https://example.com/seedance.mp4" },
        usage: { completion_tokens: 107680 },
      }),
    );

    await expect(getLk666Task("seedance:99936297")).resolves.toEqual({
      status: "completed",
      outputUrl: "https://example.com/seedance.mp4",
      errorMessage: null,
      provider: "lk666",
      extra: { completion_tokens: 107680 },
    });
    expect(fetchMock.mock.calls.at(-1)?.[0]).toBe(
      "https://api.lk888.ai/api/v3/contents/generations/tasks/99936297",
    );
  });

  it("limits prompts to the provider's 4096-character maximum", async () => {
    const fetchMock = jest
      .spyOn(global, "fetch")
      .mockResolvedValue(
        Response.json({ code: 200, data: { task_id: 123456 } }),
      );

    await submitLk666Video({
      model: "h3",
      prompt: "画".repeat(5_000),
      referenceUrls: ["https://example.com/product.png"],
      durationSeconds: 15,
      aspectRatio: "9:16",
      resolution: "720p",
      requestId: "unused-by-provider",
    });

    const [, init] = fetchMock.mock.calls.at(-1) ?? [];
    const body = JSON.parse(String(init?.body)) as { prompt: string };
    expect(Array.from(body.prompt)).toHaveLength(4096);
  });

  it("rejects unsupported 480p requests before spending", () => {
    expect(() => lk666Resolution("480p")).toThrow(PermanentJobError);
    expect(lk666Resolution("1080p")).toBe("1080P");
    expect(lk666Resolution("2k")).toBe("2K");
  });
});
