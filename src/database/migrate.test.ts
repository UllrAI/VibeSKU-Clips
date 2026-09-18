import { describe, expect, it } from "@jest/globals";
import { isDatabaseUnreachable } from "./migrate";

describe("database reachability", () => {
  it("waits out a host that has not resolved yet", () => {
    // The exact error a worker exited on when its pod started before DNS.
    expect(
      isDatabaseUnreachable(
        new Error("getaddrinfo ENOTFOUND postgresql.zeabur.internal"),
      ),
    ).toBe(true);
    expect(
      isDatabaseUnreachable(
        Object.assign(new Error("connect failed"), { code: "ECONNREFUSED" }),
      ),
    ).toBe(true);
    // postgres-js reports the socket failure as the cause.
    expect(
      isDatabaseUnreachable(
        new Error("write CONNECTION_CLOSED", {
          cause: new Error("read ECONNRESET"),
        }),
      ),
    ).toBe(true);
  });

  it("does not wait out a broken release", () => {
    expect(
      isDatabaseUnreachable(
        new Error('password authentication failed for user "app"'),
      ),
    ).toBe(false);
    expect(
      isDatabaseUnreachable(new Error('relation "ugc_works" already exists')),
    ).toBe(false);
    expect(isDatabaseUnreachable("not an error")).toBe(false);
  });
});
