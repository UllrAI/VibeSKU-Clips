import { buildFileUrl, fileKeyFromUrl } from "./url";

describe("authenticated file URLs", () => {
  it("round-trips an object key", () => {
    const key = "uploads/user/a + b.webp";
    expect(fileKeyFromUrl(buildFileUrl(key))).toBe(key);
  });

  it("does not treat external or unrelated paths as stored files", () => {
    expect(fileKeyFromUrl("https://example.com/image.webp")).toBeNull();
    expect(
      fileKeyFromUrl("https://files.local/api/files/content?key=image.webp"),
    ).toBeNull();
    expect(fileKeyFromUrl("/other?key=image.webp")).toBeNull();
    expect(fileKeyFromUrl("not a URL")).toBeNull();
  });
});
