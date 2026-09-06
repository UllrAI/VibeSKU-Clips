import { describe, expect, it } from "@jest/globals";
import {
  buildExportManifest,
  manifestToCsv,
  type ManifestClip,
} from "./manifest";

function clip(overrides: Partial<ManifestClip> = {}): ManifestClip {
  return {
    reference: "VC-0001-001",
    locale: "en",
    market: "US",
    publishCaption: "Sofa, sorted.",
    videoUrl: "/api/files/content?key=video",
    coverUrl: "/api/files/content?key=cover",
    subtitleUrl: "/api/files/content?key=subs",
    disclosure: "This video contains AI-generated content.",
    product: {
      name: "Cordless hand vacuum",
      variant: "White",
    },
    ...overrides,
  };
}

describe("export manifest", () => {
  it("groups rows by product", () => {
    const manifest = buildExportManifest([
      clip(),
      clip({
        reference: "VC-0001-002",
        product: {
          name: "Ceramic pour-over set",
          variant: null,
        },
      }),
    ]);

    expect(manifest.groups.map((group) => group.label)).toEqual([
      "Ceramic pour-over set",
      "Cordless hand vacuum",
    ]);
  });

  it("escapes CSV fields that contain separators", () => {
    const manifest = buildExportManifest([
      clip({ publishCaption: 'Sofa, "sorted"' }),
    ]);
    const csv = manifestToCsv(manifest);

    expect(csv.split("\n")[0]).toContain("reference");
    expect(csv).toContain('"Sofa, ""sorted"""');
  });
});
