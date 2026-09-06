import { PERMANENT_REDIRECTS } from "./redirects";

describe("permanent redirects", () => {
  it("declares no legacy URLs while the site has no retired routes", () => {
    expect(PERMANENT_REDIRECTS).toEqual([]);
  });
});
