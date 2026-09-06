import { describe, expect, it } from "@jest/globals";
import { isProductUrl, productNameFromUrl } from "./product-name";

describe("isProductUrl", () => {
  it("accepts absolute http links only", () => {
    expect(isProductUrl("https://shop.example.com/p/kettle")).toBe(true);
    expect(isProductUrl("  http://example.com  ")).toBe(true);
    expect(isProductUrl("shop.example.com/p/kettle")).toBe(false);
    expect(isProductUrl("Ceramic pour-over kettle")).toBe(false);
    expect(isProductUrl("ftp://example.com/a")).toBe(false);
  });
});

describe("productNameFromUrl", () => {
  it("reads the product slug out of the path", () => {
    expect(
      productNameFromUrl(
        "https://shop.example.com/products/ceramic-pour-over-kettle",
        "fallback",
      ),
    ).toBe("Ceramic pour over kettle");
  });

  it("drops trailing ids and file extensions", () => {
    expect(
      productNameFromUrl("https://example.com/p/kettle-1044821.html", "x"),
    ).toBe("Kettle");
  });

  it("falls back to the host when the path says nothing", () => {
    expect(productNameFromUrl("https://www.example.com/", "x")).toBe(
      "Example.com",
    );
    expect(productNameFromUrl("https://example.com/p/12345", "x")).toBe(
      "Example.com",
    );
  });

  it("returns the fallback for anything that is not a link", () => {
    expect(productNameFromUrl("Ceramic kettle", "Ceramic kettle")).toBe(
      "Ceramic kettle",
    );
  });
});
