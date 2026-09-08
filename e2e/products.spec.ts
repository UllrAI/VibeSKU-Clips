import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { loginAs } from "./helpers/auth";

test("imports a product URL and opens the editable review page", async ({
  page,
}) => {
  await loginAs(page, "user");
  await page.goto("/dashboard/products");

  await page.getByRole("button", { name: "Add product" }).click();
  await expect(page.getByRole("tab", { name: "Enter manually" })).toBeVisible();
  await page.getByRole("tab", { name: "Import from URL" }).click();
  await page
    .getByLabel("Product page URL")
    .fill("https://example.com/products/ceramic-pour-over-kettle");
  await page.getByRole("button", { name: "Import and review" }).click();

  await expect(page).toHaveURL(/\/dashboard\/products\/[0-9a-f-]{36}$/);
  await expect(
    page.getByRole("heading", { name: "Ceramic pour over kettle" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", {
      name: "https://example.com/products/ceramic-pour-over-kettle",
    }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Edit material" }).click();
  await page.getByLabel("Product name").fill("Edited ceramic kettle");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(
    page.getByRole("heading", { name: "Edited ceramic kettle" }),
  ).toBeVisible();
});

test("keeps extracted facts pending until the operator confirms them", async ({
  page,
}) => {
  await loginAs(page, "user");
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
  let productId: string;
  try {
    const [product] = await sql`
      insert into ugc_products ("userId", name, images, facts, status)
      values (
        'e2e-user',
        'Imported review product',
        '[]'::jsonb,
        ${JSON.stringify({
          summary: "A product imported from a public product page.",
          appearance: "Matte white package.",
          specs: ["250 ml"],
          sellingPoints: ["Compact package"],
          scenarios: ["Daily use"],
          sources: ["product page"],
        })}::jsonb,
        'review'
      )
      returning id
    `;
    productId = product.id;
  } finally {
    await sql.end({ timeout: 5 });
  }

  await page.goto(`/dashboard/products/${productId}`);
  await expect(page.getByText("Needs review", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Make a clip from this" }),
  ).toBeHidden();

  await page.getByRole("button", { name: "Looks right" }).click();
  await expect(page.getByText("Ready", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Make a clip from this" }),
  ).toBeVisible();
});
