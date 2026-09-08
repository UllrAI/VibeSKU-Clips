import { describe, expect, it } from "@jest/globals";
import { isProductImportFailure, jobFailureKey } from "./action-message";

describe("product operation failures", () => {
  it("retries page imports without turning analysis failures into imports", () => {
    expect(isProductImportFailure("FIRECRAWL_SITE_UNSUPPORTED")).toBe(true);
    expect(isProductImportFailure("UGC_PRODUCT_SOURCE_READ_FAILED")).toBe(
      false,
    );
  });

  it("shows a controlled message when analysis cannot read its reference page", () => {
    expect(jobFailureKey("UGC_PRODUCT_SOURCE_READ_FAILED")).toBe(
      "ugc_product_failure_source_read",
    );
  });
});
