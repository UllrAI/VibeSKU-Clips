import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { PermanentJobError, RetryableJobError } from "@/lib/jobs/definition";
import { createPrismRequestId, submitImage, submitVideo } from "./prism";

const TASK_ID = "11111111-1111-4111-8111-111111111111";

function successfulSubmission(): Response {
  return new Response(JSON.stringify({ data: { task_id: TASK_ID } }), {
    status: 202,
    headers: { "content-type": "application/json" },
  });
}

describe("Prism media client", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.PRISM_API_BASE_URL = "https://staging-prism.ullrai.com/api/v1/";
    process.env.PRISM_API_KEY = "test-key";
    process.env.PRISM_API_SECRET = "test-secret";
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.PRISM_API_BASE_URL;
    delete process.env.PRISM_API_KEY;
    delete process.env.PRISM_API_SECRET;
  });

  it("submits GPT Image 2 at 1K and low quality", async () => {
    const fetchMock = jest
      .spyOn(global, "fetch")
      .mockResolvedValue(successfulSubmission());

    await expect(
      submitImage({
        prompt: "Draw the product",
        referenceUrls: ["https://example.com/product.png"],
        aspectRatio: "9:16",
        requestId: TASK_ID,
      }),
    ).resolves.toBe(TASK_ID);

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("https://staging-prism.ullrai.com/api/v1/image-gen");
    expect(init?.headers).toMatchObject({
      "X-API-Key": "test-key",
      "X-API-Secret": "test-secret",
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      prompt: "Draw the product",
      model: "gpt-image-2",
      image_size: "1K",
      quality: "low",
      aspect_ratio: "9:16",
      request_id: TASK_ID,
      reference_urls: ["https://example.com/product.png"],
    });
  });

  it("submits 15-second portrait video to MiniMax H3", async () => {
    const fetchMock = jest
      .spyOn(global, "fetch")
      .mockResolvedValue(successfulSubmission());
    const references = Array.from(
      { length: 10 },
      (_, index) => `https://example.com/frame-${index}.png`,
    );

    await submitVideo({
      prompt: "Animate the storyboard",
      referenceUrls: references,
      durationSeconds: 15,
      aspectRatio: "9:16",
      requestId: TASK_ID,
    });

    const [, init] =
      fetchMock.mock.calls[fetchMock.mock.calls.length - 1] ?? [];
    expect(JSON.parse(String(init?.body))).toEqual({
      prompt: "Animate the storyboard",
      model: "minimax-h3",
      duration: 15,
      aspect_ratio: "9:16",
      resolution: "720p",
      generate_audio: true,
      request_id: TASK_ID,
      reference_images: references.slice(0, 9),
    });
  });

  it("fast-fails authentication errors and retains transient error codes", async () => {
    jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }));
    const request = {
      prompt: "Draw the product",
      referenceUrls: [],
      aspectRatio: "9:16",
      requestId: TASK_ID,
    };

    const authError = await submitImage(request).catch((error) => error);
    expect(authError).toBeInstanceOf(PermanentJobError);
    expect(authError).toMatchObject({ code: "PRISM_AUTH_FAILED" });

    const unavailableError = await submitImage(request).catch((error) => error);
    expect(unavailableError).toBeInstanceOf(RetryableJobError);
    expect(unavailableError).toMatchObject({ code: "PRISM_UNAVAILABLE" });
  });

  it("derives stable, distinct UUIDs for frame submissions", () => {
    const first = createPrismRequestId(TASK_ID, "frame-1");
    const repeated = createPrismRequestId(TASK_ID, "frame-1");
    const second = createPrismRequestId(TASK_ID, "frame-2");

    expect(first).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(repeated).toBe(first);
    expect(second).not.toBe(first);
  });
});
