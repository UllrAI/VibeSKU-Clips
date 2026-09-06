import { describe, expect, it } from "@jest/globals";
import {
  getAllLocalizedPosts,
  getAllPostSlugs,
  getAllPosts,
  getAuthorBySlug,
  getLocalizedBlogPath,
  getLocalizedBlogPostPath,
  getPostBySlug,
  getPostLocalizations,
} from "./blog";

const BILINGUAL_SLUGS = [
  "fifteen-second-ugc-structure",
  "language-and-market-are-two-settings",
];
const ENGLISH_ONLY_SLUGS = ["ugc-clip-production-guide"];
const SLUGS = [...BILINGUAL_SLUGS, ...ENGLISH_ONLY_SLUGS].sort();

describe("blog content localization helpers", () => {
  it("returns the localized blog post when the locale exists", () => {
    const post = getPostBySlug("fifteen-second-ugc-structure", "zh-Hans");

    expect(post).toBeDefined();
    expect(post?.locale).toBe("zh-Hans");
    expect(post?.title).toContain("15 秒");
    expect(post?.availableLocales).toEqual(["en", "zh-Hans"]);
  });

  it("returns only posts authored for the requested locale", () => {
    const posts = getAllPosts("zh-Hans");

    expect(posts).toHaveLength(BILINGUAL_SLUGS.length);
    expect(posts.every((post) => post.locale === "zh-Hans")).toBe(true);
    expect(getAllPosts("en")).toHaveLength(SLUGS.length);
    expect(getAllPostSlugs()).toEqual(SLUGS);
  });

  it("exposes all localized source records for sitemap and metadata", () => {
    expect(getAllLocalizedPosts()).toHaveLength(
      BILINGUAL_SLUGS.length * 2 + ENGLISH_ONLY_SLUGS.length,
    );
    for (const slug of BILINGUAL_SLUGS) {
      expect(getPostLocalizations(slug).map((post) => post.locale)).toEqual([
        "en",
        "zh-Hans",
      ]);
    }
    for (const slug of ENGLISH_ONLY_SLUGS) {
      expect(getPostLocalizations(slug).map((post) => post.locale)).toEqual([
        "en",
      ]);
    }
  });

  it("keeps the page template as the only source of article H1 headings", () => {
    expect(
      getAllLocalizedPosts().every(
        (post) =>
          !post.content
            .replaceAll(/```[\s\S]*?```|~~~[\s\S]*?~~~/g, "")
            .match(/^#\s+/m),
      ),
    ).toBe(true);
  });

  it("builds locale-aware paths and resolves authors", () => {
    expect(getLocalizedBlogPath("en")).toBe("/blog");
    expect(getLocalizedBlogPath("zh-Hans")).toBe("/zh-Hans/blog");
    expect(
      getLocalizedBlogPostPath("fifteen-second-ugc-structure", "zh-Hans"),
    ).toBe("/zh-Hans/blog/fifteen-second-ugc-structure");
    expect(getAuthorBySlug("admin")?.name).toBe("UllrAI");
  });

  it("returns undefined or empty collections for missing blog entities", () => {
    expect(getPostBySlug("missing-post")).toBeUndefined();
    expect(getPostLocalizations("missing-post")).toEqual([]);
    expect(getAuthorBySlug()).toBeUndefined();
    expect(getAuthorBySlug(null)).toBeUndefined();
    expect(getAuthorBySlug("missing-author")).toBeUndefined();
  });
});
