import { describe, expect, it, jest } from "@jest/globals";

const redirect = jest.fn(() => {
  throw new Error("NEXT_REDIRECT");
});

jest.mock("next/navigation", () => ({ redirect }));

describe("dashboard entry", () => {
  it("opens the single-clip workspace", async () => {
    const Page = (await import("./page")).default;

    expect(() => Page()).toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/dashboard/works");
  });
});
