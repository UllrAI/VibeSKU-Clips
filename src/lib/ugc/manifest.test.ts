import { describe, expect, it } from "@jest/globals";
import {
  buildExportManifest,
  countUnmatched,
  manifestToCsv,
  type ManifestClip,
} from "./manifest";

function clip(overrides: Partial<ManifestClip> = {}): ManifestClip {
  return {
    reference: "VC-0001-001",
    locale: "en",
    market: "US",
    accountTag: null,
    publishCaption: "Sofa, sorted.",
    videoUrl: "/api/files/content?key=video",
    coverUrl: "/api/files/content?key=cover",
    subtitleUrl: "/api/files/content?key=subs",
    disclosure: "This video contains AI-generated content.",
    product: {
      name: "Cordless hand vacuum",
      variant: "White",
      shopUrl: "https://shop.example/vacuum",
    },
    ...overrides,
  };
}

describe("export manifest", () => {
  it("groups rows by product", () => {
    const manifest = buildExportManifest(
      [
        clip(),
        clip({
          reference: "VC-0001-002",
          product: {
            name: "Ceramic pour-over set",
            variant: null,
            shopUrl: "https://shop.example/pour-over",
          },
        }),
      ],
      "product",
      "Unassigned",
    );

    expect(manifest.groups.map((group) => group.label)).toEqual([
      "Ceramic pour-over set",
      "Cordless hand vacuum",
    ]);
  });

  it("labels clips without an account tag when grouping by account", () => {
    const manifest = buildExportManifest([clip()], "accountTag", "Unassigned");

    expect(manifest.groups[0]?.label).toBe("Unassigned");
  });

  it("flags assets with no storefront link for the target market", () => {
    const manifest = buildExportManifest(
      [
        clip(),
        clip({
          reference: "VC-0001-003",
          product: {
            name: "Cordless hand vacuum",
            variant: null,
            shopUrl: null,
          },
        }),
      ],
      "product",
      "Unassigned",
    );

    expect(countUnmatched(manifest)).toBe(1);
    expect(
      manifest.groups[0]?.rows.map((row) => row.awaitingProductMatch),
    ).toEqual([false, true]);
  });

  it("escapes CSV fields that contain separators", () => {
    const manifest = buildExportManifest(
      [clip({ publishCaption: 'Sofa, "sorted"' })],
      "product",
      "Unassigned",
    );
    const csv = manifestToCsv(manifest);

    expect(csv.split("\n")[0]).toContain("reference");
    expect(csv).toContain('"Sofa, ""sorted"""');
  });
});
