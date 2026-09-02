import { describe, expect, it } from "vitest";
import { buildCmx3600Edl, buildOtioTimeline, buildTimelineCsv, exportTimeline, framesToTimecode, normalizedFrameRate } from "@/lib/timeline-export";

const input = {
  projectName: "产品访谈",
  sourceName: "../private/interview.mov",
  sourceDuration: 20,
  frameRate: 25,
  hasAudio: true,
  keepRanges: [{ start: 1, end: 4 }, { start: 8.5, end: 12 }],
  revision: 3,
  clipNotes: ["开场", "重点,包含逗号"],
};

describe("professional timeline export", () => {
  it("builds linked video/audio OTIO clips with relative media names", () => {
    const otio = JSON.parse(buildOtioTimeline(input));
    expect(otio.OTIO_SCHEMA).toBe("Timeline.1");
    expect(otio.tracks.children).toHaveLength(2);
    expect(otio.tracks.children[0].children).toHaveLength(2);
    expect(otio.tracks.children[0].children[0].source_range.start_time).toEqual(expect.objectContaining({ rate: 25, value: 25 }));
    expect(otio.tracks.children[0].children[0].media_reference.target_url).toBe("interview.mov");
    expect(otio.tracks.children[0].children[0].metadata["vibesku-clips"].transcript).toBe("开场");
    expect(JSON.stringify(otio)).not.toContain("private");
  });

  it("builds CMX 3600 events and a BOM-prefixed review CSV", () => {
    const edl = buildCmx3600Edl(input);
    expect(edl).toContain("001  AX       AA/V C");
    expect(edl).toContain("00:00:01:00 00:00:04:00 00:00:00:00 00:00:03:00");
    const csv = buildTimelineCsv(input);
    expect(csv.startsWith("\uFEFFEvent,Source")).toBe(true);
    expect(csv).toContain("interview.mov");
    expect(csv).toContain('"重点,包含逗号"');
  });

  it("uses real frame rates and returns deterministic handoff metadata", () => {
    expect(framesToTimecode(90, 30)).toBe("00:00:03:00");
    expect(normalizedFrameRate(29.97002997)).toBe(29.97003);
    const result = exportTimeline("otio", input);
    expect(result).toMatchObject({ fileName: "产品访谈-r3.otio", clips: 2, duration: 6.5, frameRate: 25 });
    expect(exportTimeline("otio", { ...input, projectName: "Launch v0.8.97", revision: null }).fileName).toBe("Launch-v0.8.97-draft.otio");
  });
});
