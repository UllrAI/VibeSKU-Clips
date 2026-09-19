import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "@jest/globals";
import {
  TEMPLATE_OPTIONS,
  templateDescriptionKey,
  templateKey,
} from "./labels";

/**
 * Template message keys are built from the enum value at render time, so no
 * static scan of the source can tell that a newly added format has copy. This
 * is what notices.
 */
const CATALOGS = ["en", "zh-Hans"] as const;

describe("template labels", () => {
  it.each(CATALOGS)("names every format in %s", (locale) => {
    const catalog = JSON.parse(
      fs.readFileSync(
        path.join(process.cwd(), "src", "messages", `${locale}.json`),
        "utf8",
      ),
    ) as Record<string, string>;

    for (const template of TEMPLATE_OPTIONS) {
      expect(catalog[templateKey(template)]).toBeTruthy();
      expect(catalog[templateDescriptionKey(template)]).toBeTruthy();
    }
  });
});
