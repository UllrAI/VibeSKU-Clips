import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const sourceRoots = [path.join(root, "src", "app"), path.join(root, "src", "components")];
const extensions = new Set([".css", ".ts", ".tsx"]);

const forbidden = [
  { pattern: /\bglass-card\b/, reason: "legacy glass surface" },
  { pattern: /\bneon-glow\b/, reason: "glow-based selection" },
  { pattern: /\bbrand-gradient(?:-text)?\b/, reason: "legacy gradient naming" },
  { pattern: /\bgrid-bg\b/, reason: "legacy decorative-background naming" },
  { pattern: /\bshadow-(?:lg|xl|2xl)\b/, reason: "large shadow" },
  { pattern: /\bdrop-shadow(?:-[^\s"'`}]+)?/, reason: "decorative drop shadow" },
  { pattern: /\bbackdrop-blur(?:-[^\s"'`}]+)?/, reason: "glass-like backdrop blur" },
  { pattern: /text-shadow\s*:/, reason: "text glow or shadow" },
  { pattern: /\btransition-all\b|transition\s*:\s*all\b/, reason: "unbounded transition" },
  { pattern: /\bbg-gradient-to-[^\s"'`}]+/, reason: "decorative utility gradient" },
  { pattern: /\b(?:from|via|to)-(?:blue|indigo|violet|purple|fuchsia)-\d+\b/, reason: "blue-purple gradient color" },
];

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(fullPath));
    else if (extensions.has(path.extname(entry.name))) files.push(fullPath);
  }
  return files;
}

const files = (await Promise.all(sourceRoots.map(collectFiles))).flat();
const violations = [];

for (const file of files) {
  const lines = (await readFile(file, "utf8")).split("\n");
  lines.forEach((line, index) => {
    for (const rule of forbidden) {
      if (rule.pattern.test(line)) {
        violations.push(`${path.relative(root, file)}:${index + 1} ${rule.reason}`);
      }
    }
  });
}

if (violations.length > 0) {
  console.error("Design-system check failed:\n" + violations.map((item) => `- ${item}`).join("\n"));
  process.exit(1);
}

console.log(`Design-system check passed (${files.length} source files scanned).`);
