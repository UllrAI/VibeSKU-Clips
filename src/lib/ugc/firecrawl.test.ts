import { afterEach, describe, expect, it } from "@jest/globals";
import { FirecrawlError, importProductSource } from "./firecrawl";
import { UnreadableSourceError } from "./source-fetch";

const PRODUCT_URL = "https://93.184.216.34/products/headphones";
const TEST_ENV = {
  FIRECRAWL_API_BASE_URL: "https://firecrawl.example.com/v2/",
  FIRECRAWL_API_KEY: "fc-test-key",
};

afterEach(() => {
  jest.restoreAllMocks();
});

describe("importProductSource", () => {
  it("imports product material without copying structured price or stock", async () => {
    const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: {
            markdown: "# Headphones\nThirty-hour battery life.",
            images: [
              "https://93.184.216.34/images/other-product.jpg?width=1200",
              "https://93.184.216.34/images/wireless-headphones-gallery.jpg?width=200",
              "https://93.184.216.34/images/wireless-headphones-gallery.jpg?width=1600",
              "https://93.184.216.34/images/swatch-black.jpg",
              "https://93.184.216.34/images/wireless-headphones-detail.jpg?width=1200",
            ],
            metadata: {
              title: "Fallback page title",
              ogImage: "/images/fallback.jpg",
            },
            product: {
              title: "Wireless Headphones",
              brand: "Acme",
              category: "Audio",
              description: "Noise-cancelling over-ear headphones.",
              variants: [
                {
                  title: "Wireless Headphones — Black",
                  sku: "ACME-BLK",
                  values: { color: "Black" },
                  price: { amount: 199, currency: "USD" },
                  availability: { inStock: true },
                  images: [
                    {
                      url: "https://93.184.216.34/images/headphones.jpg",
                      alt: "Black headphones",
                    },
                  ],
                },
              ],
            },
          },
        }),
        { status: 200 },
      ),
    );

    const result = await importProductSource(PRODUCT_URL, { env: TEST_ENV });

    expect(result).toMatchObject({
      name: "Wireless Headphones",
      variant: "Black",
      images: [
        "https://93.184.216.34/images/headphones.jpg",
        "https://93.184.216.34/images/wireless-headphones-gallery.jpg?width=1600",
        "https://93.184.216.34/images/wireless-headphones-detail.jpg?width=1200",
        "https://93.184.216.34/images/fallback.jpg",
      ],
    });
    expect(result.text).toContain("Brand: Acme");
    expect(result.text).toContain("color: Black");
    expect(result.text).toContain("Thirty-hour battery life.");
    expect(result.text).not.toContain("199");
    expect(result.text).not.toContain("inStock");

    const request = fetchMock.mock.calls[0]?.[1];
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://firecrawl.example.com/v2/scrape",
    );
    expect(JSON.parse(String(request?.body))).toMatchObject({
      url: PRODUCT_URL,
      formats: ["markdown", "product", "images"],
      onlyMainContent: true,
    });
  });

  it("requires a configured API key", async () => {
    await expect(
      importProductSource(PRODUCT_URL, {
        env: { FIRECRAWL_API_BASE_URL: TEST_ENV.FIRECRAWL_API_BASE_URL },
      }),
    ).rejects.toMatchObject<Partial<FirecrawlError>>({
      code: "FIRECRAWL_NOT_CONFIGURED",
      retryable: false,
    });
  });

  it("classifies rate limits as retryable", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
        status: 429,
      }),
    );

    await expect(
      importProductSource(PRODUCT_URL, { env: TEST_ENV }),
    ).rejects.toMatchObject<Partial<FirecrawlError>>({
      code: "FIRECRAWL_UNAVAILABLE",
      retryable: true,
    });
  });

  it("distinguishes an unsupported site from an authentication failure", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          error: "We do not support this site. Please use another website.",
        }),
        { status: 403 },
      ),
    );

    await expect(
      importProductSource(PRODUCT_URL, { env: TEST_ENV }),
    ).rejects.toMatchObject<Partial<FirecrawlError>>({
      code: "FIRECRAWL_SITE_UNSUPPORTED",
      retryable: false,
    });
  });

  it("keeps ordinary forbidden responses classified as authentication failures", async () => {
    jest
      .spyOn(global, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }),
      );

    await expect(
      importProductSource(PRODUCT_URL, { env: TEST_ENV }),
    ).rejects.toMatchObject<Partial<FirecrawlError>>({
      code: "FIRECRAWL_AUTH_FAILED",
      retryable: false,
    });
  });

  it("pauses a product when no readable page material is returned", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: { warning: "No product found" },
        }),
        { status: 200 },
      ),
    );

    await expect(
      importProductSource(PRODUCT_URL, { env: TEST_ENV }),
    ).rejects.toBeInstanceOf(UnreadableSourceError);
  });
});
