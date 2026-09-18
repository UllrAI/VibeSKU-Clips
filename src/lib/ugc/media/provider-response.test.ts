import { describe, expect, it } from "@jest/globals";
import { rejectionDetail } from "./provider-response";

describe("provider rejection detail", () => {
  /** Captured from Prism's own 422 for an unsupported resolution. */
  it("names every field a validation error rejected", async () => {
    const response = Response.json(
      {
        detail: [
          {
            type: "value_error",
            loc: ["body", "resolution"],
            msg: "Value error, 无效的分辨率: NOPE，可选值: ['480p', '720p', '1080p']",
            input: "NOPE",
          },
          {
            type: "uuid_parsing",
            loc: ["body", "request_id"],
            msg: "Input should be a valid UUID",
            input: "BAD",
          },
        ],
      },
      { status: 422 },
    );

    const detail = await rejectionDetail(response);

    expect(detail).toContain("body.resolution: Value error, 无效的分辨率");
    expect(detail).toContain("body.request_id: Input should be a valid UUID");
  });

  it("keeps a plain string detail and a provider message", async () => {
    expect(
      await rejectionDetail(Response.json({ detail: "Task not found" })),
    ).toBe("Task not found");
    expect(
      await rejectionDetail(Response.json({ code: 400, msg: "余额不足" })),
    ).toBe("余额不足");
  });

  it("falls back to the raw body and gives up quietly on an empty one", async () => {
    expect(await rejectionDetail(new Response("upstream timeout\n"))).toBe(
      "upstream timeout",
    );
    expect(await rejectionDetail(new Response(""))).toBe("");
  });

  it("bounds what a provider can put in a log line", async () => {
    const detail = await rejectionDetail(new Response("x".repeat(5000)));

    expect(detail).toHaveLength(300);
  });
});
