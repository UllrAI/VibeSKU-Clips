import type { ExportManifest, ExportManifestRow } from "./types";

export interface ManifestClip {
  reference: string;
  locale: string;
  market: string;
  accountTag: string | null;
  publishCaption: string | null;
  videoUrl: string | null;
  coverUrl: string | null;
  subtitleUrl: string | null;
  disclosure: string | null;
  product: {
    name: string;
    variant: string | null;
    shopUrl: string | null;
  };
}

function toRow(clip: ManifestClip): ExportManifestRow {
  return {
    reference: clip.reference,
    productName: clip.product.name,
    variant: clip.product.variant,
    market: clip.market,
    locale: clip.locale,
    shopUrl: clip.product.shopUrl,
    // Without a storefront link for the target market the asset is not
    // shoppable, and the manifest says so rather than guessing.
    awaitingProductMatch: !clip.product.shopUrl,
    publishCaption: clip.publishCaption,
    videoUrl: clip.videoUrl,
    coverUrl: clip.coverUrl,
    subtitleUrl: clip.subtitleUrl,
    disclosure: clip.disclosure,
    accountTag: clip.accountTag,
  };
}

export function buildExportManifest(
  clips: ManifestClip[],
  groupBy: "product" | "accountTag",
  unassignedLabel: string,
): ExportManifest {
  const groups = new Map<
    string,
    { label: string; rows: ExportManifestRow[] }
  >();

  for (const clip of clips) {
    const key =
      groupBy === "product" ? clip.product.name : (clip.accountTag ?? "");
    const label = key || unassignedLabel;
    const group = groups.get(label) ?? { label, rows: [] };
    group.rows.push(toRow(clip));
    groups.set(label, group);
  }

  return {
    generatedAt: new Date().toISOString(),
    groupBy,
    groups: [...groups.values()]
      .map((group) => ({ key: group.label, ...group }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  };
}

export function countUnmatched(manifest: ExportManifest): number {
  return manifest.groups.reduce(
    (total, group) =>
      total + group.rows.filter((row) => row.awaitingProductMatch).length,
    0,
  );
}

const CSV_COLUMNS: (keyof ExportManifestRow)[] = [
  "reference",
  "productName",
  "variant",
  "market",
  "locale",
  "shopUrl",
  "awaitingProductMatch",
  "accountTag",
  "videoUrl",
  "coverUrl",
  "subtitleUrl",
  "publishCaption",
  "disclosure",
];

function escapeCsv(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /["\n,]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function manifestToCsv(manifest: ExportManifest): string {
  const header = ["group", ...CSV_COLUMNS].join(",");
  const lines = manifest.groups.flatMap((group) =>
    group.rows.map((row) =>
      [
        escapeCsv(group.label),
        ...CSV_COLUMNS.map((column) => escapeCsv(row[column])),
      ].join(","),
    ),
  );
  return [header, ...lines].join("\n");
}
