import { describe, expect, it } from "@jest/globals";
import { loadWorkerEnv } from "./worker-env";

describe("worker environment", () => {
  it("uses the application database for jobs by default", () => {
    const env = loadWorkerEnv({
      DATABASE_URL: "postgresql://worker:worker@localhost/app",
    });

    expect(env.JOB_DATABASE_URL).toBe(env.DATABASE_URL);
    expect(env.DB_POOL_SIZE).toBe(5);
    expect(env.JOB_DB_POOL_SIZE).toBe(3);
    expect(env.WORKER_GRACEFUL_TIMEOUT_MS).toBe(30_000);
    expect(env.PRISM_API_BASE_URL).toBe(
      "https://staging-prism.ullrai.com/api/v1",
    );
    expect(env.VIDEO_GENERATION_PROVIDER).toBe("prism");
    expect(env.LK666_API_BASE_URL).toBe("https://api.lk888.ai");
    expect(env.FIRECRAWL_API_BASE_URL).toBe("https://api.firecrawl.dev/v2");
  });

  it("accepts lk666 as the video provider", () => {
    const env = loadWorkerEnv({
      DATABASE_URL: "postgresql://worker:worker@localhost/app",
      VIDEO_GENERATION_PROVIDER: "lk666",
      LK666_API_KEY: "test-key",
    });

    expect(env.VIDEO_GENERATION_PROVIDER).toBe("lk666");
    expect(env.LK666_API_KEY).toBe("test-key");
  });

  it("accepts Firecrawl product import credentials", () => {
    const env = loadWorkerEnv({
      DATABASE_URL: "postgresql://worker:worker@localhost/app",
      FIRECRAWL_API_BASE_URL: "https://firecrawl.example.com/v2",
      FIRECRAWL_API_KEY: "fc-test-key",
    });

    expect(env.FIRECRAWL_API_BASE_URL).toBe("https://firecrawl.example.com/v2");
    expect(env.FIRECRAWL_API_KEY).toBe("fc-test-key");
  });

  it("accepts a separate queue database and explicit pool budgets", () => {
    const env = loadWorkerEnv({
      DATABASE_URL: "postgresql://worker:worker@localhost/app",
      JOB_DATABASE_URL: "postgresql://worker:worker@localhost/jobs",
      DB_POOL_SIZE: "4",
      JOB_DB_POOL_SIZE: "2",
      WORKER_GRACEFUL_TIMEOUT_MS: "45000",
    });

    expect(env.JOB_DATABASE_URL).toContain("/jobs");
    expect(env.DB_POOL_SIZE).toBe(4);
    expect(env.JOB_DB_POOL_SIZE).toBe(2);
    expect(env.WORKER_GRACEFUL_TIMEOUT_MS).toBe(45_000);
  });

  it("rejects non-PostgreSQL and invalid pool configuration", () => {
    expect(() =>
      loadWorkerEnv({ DATABASE_URL: "mysql://localhost/app" }),
    ).toThrow("Invalid worker environment");
    expect(() =>
      loadWorkerEnv({
        DATABASE_URL: "postgresql://localhost/app",
        JOB_DB_POOL_SIZE: "0",
      }),
    ).toThrow("Invalid worker environment");
  });
});
