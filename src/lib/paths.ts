/**
 * Unified runtime path resolution. Deployments may inject writable data and migration
 * directories; local development falls back to folders under the project root.
 */

import { join } from "path";

/** Writable data root directory (sqlite.db / uploads / output all live under here) */
export function getDataDir(): string {
  return process.env.APP_DATA_DIR || join(process.cwd(), "data");
}

/** Migrations SQL directory. */
export function getMigrationsDir(): string {
  return process.env.APP_MIGRATIONS_DIR || join(process.cwd(), "drizzle");
}

/**
 * Last path component regardless of separator style. DB rows written on Windows carry
 * backslash absolute paths (e.g. `D:\vibesku-clips\data\output\<id>\final.mp4`) while download
 * URLs always need the bare file name — a plain split("/") returns the whole Windows path
 * and produces broken `/api/output/...` URLs (issue #15). Pure function.
 */
export function fileNameOf(p: string | null | undefined): string {
  return (p ?? "").split(/[\\/]/).pop() ?? "";
}

/** Upload assets root directory: data/uploads */
export function getUploadsDir(): string {
  return join(getDataDir(), "uploads");
}

/** Composition output root directory: data/output */
export function getOutputDir(): string {
  return join(getDataDir(), "output");
}
