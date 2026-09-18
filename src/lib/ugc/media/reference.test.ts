import { describe, expect, it, jest } from "@jest/globals";
import {
  classifyDownloaderError,
  fetchLinkedVideo,
  frameTimes,
  referenceAspectRatio,
} from "./reference";

describe("reference sampling", () => {
  it("samples inside each slice rather than on its edges", () => {
    const times = frameTimes(8_000);
    expect(times[0]).toBeGreaterThan(0);
    expect(times.at(-1)).toBeLessThan(8_000);
    // Evenly spaced, which is what makes a hold legible as a hold.
    const gaps = times.slice(1).map((time, index) => time - times[index]!);
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThanOrEqual(1);
  });

  it("keeps the grid inside its bounds whatever the clip's length", () => {
    expect(frameTimes(1_000)).toHaveLength(2);
    expect(frameTimes(600_000)).toHaveLength(16);
    expect(frameTimes(15_000).length).toBeLessThanOrEqual(16);
  });

  it("reports only a frame a clip can actually be produced in", () => {
    expect(referenceAspectRatio({ width: 1080, height: 1920 })).toBe("9:16");
    expect(referenceAspectRatio({ width: 1440, height: 1080 })).toBe("16:9");
    // Neither shape, and portrait is where shoppable feeds live.
    expect(referenceAspectRatio({ width: 1000, height: 1000 })).toBe("9:16");
    expect(referenceAspectRatio({ width: null, height: null })).toBeNull();
  });
});

describe("linked reference fetching", () => {
  it("treats a file link as a file without asking a platform for permission", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch");
    await expect(
      fetchLinkedVideo("ftp://example.com/clip.mp4", "/tmp/unused.mp4"),
    ).rejects.toMatchObject({ failure: "unreadable" });
    // A rejected protocol never reaches the network at all.
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe("downloader failure classification", () => {
  // Captured from yt-dlp against real sites. The wording is the contract:
  // "This video is unavailable" is not "video unavailable", and a platform
  // that simply returns 403 never mentions signing in at all.
  it.each([
    [
      "ERROR: [youtube] dXrCIsUidLo: Sign in to confirm you’re not a bot. Use --cookies-from-browser",
      "platform_refused",
    ],
    [
      "ERROR: unable to download video data: HTTP Error 403: Forbidden",
      "platform_refused",
    ],
    ["ERROR: [youtube] aaaaaaaaaaa: This video is unavailable", "unavailable"],
    [
      "ERROR: [youtube] x: Video unavailable. This video has been removed by the uploader",
      "unavailable",
    ],
    [
      "ERROR: [youtube] x: The uploader has not made this video available in your country",
      "region_blocked",
    ],
    [
      "ERROR: File is larger than max-filesize (900000000 bytes > 524288000 bytes). Aborting.",
      "too_large",
    ],
    ["ERROR: Unsupported URL: https://example.com/", "unsupported_site"],
    ["ERROR: something nobody has seen before", "unreadable"],
  ])("reads %s", (message, expected) => {
    expect(classifyDownloaderError(message)).toBe(expected);
  });
});
