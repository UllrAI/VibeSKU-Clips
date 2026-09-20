import { canCreateProduct, productInputSchema } from "./product-input";

describe("product input", () => {
  it("uses the same minimum material for both creation paths", () => {
    expect(
      canCreateProduct({
        name: "",
        sourceUrl: "https://example.com/product",
        info: "",
        images: [],
      }),
    ).toBe(true);
    expect(
      canCreateProduct({
        name: "Travel mug",
        sourceUrl: "",
        info: "Insulated steel",
        images: ["https://example.com/mug.jpg"],
      }),
    ).toBe(true);
    expect(
      canCreateProduct({
        name: "Travel mug",
        sourceUrl: "",
        info: "Insulated steel",
        images: [],
      }),
    ).toBe(false);
  });

  it("accepts only HTTPS source links", () => {
    expect(
      productInputSchema.safeParse({
        name: "",
        sourceUrl: "https://example.com/product",
        info: "",
        images: [],
      }).success,
    ).toBe(true);
    expect(
      productInputSchema.safeParse({
        name: "",
        sourceUrl: "ftp://example.com/product",
        info: "",
        images: [],
      }).success,
    ).toBe(false);
  });
});
