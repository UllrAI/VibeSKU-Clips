import { describe, expect, it } from "@jest/globals";
import { authoringModelLog } from "./model";

describe("authoringModelLog", () => {
  it("names the endpoint and model a script is written by", () => {
    expect(
      authoringModelLog({
        LLM_BASE_URL: "https://llm.example/v1",
        AI_DEFAULT_MODEL: "some/model",
      }),
    ).toEqual({
      llmBaseUrl: "https://llm.example/v1",
      llmModel: "some/model",
    });
  });

  it("never carries the key", () => {
    const log = authoringModelLog({
      LLM_API_KEY: "sk-secret",
      LLM_BASE_URL: "https://llm.example/v1",
    });

    expect(JSON.stringify(log)).not.toContain("sk-secret");
  });

  it("logs rather than throws when the environment is unusable", () => {
    // A log line is not a precondition: an invalid base URL must still print.
    expect(authoringModelLog({ LLM_BASE_URL: "not-a-url" })).toEqual({
      llmBaseUrl: "unconfigured",
      llmModel: "unconfigured",
    });
  });
});
