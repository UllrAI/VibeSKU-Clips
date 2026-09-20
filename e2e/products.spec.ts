import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { loginAs } from "./helpers/auth";

test("creates a product from a URL with the shared product fields", async ({
  page,
}) => {
  await loginAs(page, "user");
  await page.goto("/dashboard/products");

  await page.getByRole("button", { name: "Add product" }).click();
  await page
    .getByLabel("Reference link")
    .fill("https://example.com/products/ceramic-pour-over-kettle");
  await page.getByRole("button", { name: "Save and read" }).click();

  await expect(page).toHaveURL(/\/dashboard\/products\/[0-9a-f-]{36}$/);
  await expect(
    page.getByRole("heading", { name: "Ceramic pour over kettle" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", {
      name: "https://example.com/products/ceramic-pour-over-kettle",
    }),
  ).toBeVisible();
});

test("makes parsed facts available without a separate confirmation", async ({
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
        'Imported ready product',
        ${JSON.stringify(["https://example.com/product.jpg"])}::jsonb,
        ${JSON.stringify({
          overview:
            "A product imported from a public product page in a matte white 250 ml package.",
          highlights: ["Compact package", "Daily use"],
          sources: ["product page"],
        })}::jsonb,
        'ready'
      )
      returning id
    `;
    productId = product.id;
  } finally {
    await sql.end({ timeout: 5 });
  }

  await page.goto(`/dashboard/products/${productId}`);
  await expect(page.getByText("Ready", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Make a clip from this" }),
  ).toBeVisible();
});

test("keeps ready facts usable while changed material is queued for parsing", async ({
  page,
}) => {
  await loginAs(page, "user");
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
  let productId: string;
  const removedImageUrl = "https://example.com/removed-product-image.jpg";
  const keptImageUrl = "https://example.com/kept-product-image.jpg";
  try {
    const [product] = await sql`
      insert into ugc_products (
        "userId", name, "sourceUrl", images, facts, status
      )
      values (
        'e2e-user',
        'Operation boundaries product',
        'https://example.com/products/operation-boundaries',
        ${JSON.stringify([removedImageUrl, keptImageUrl])}::jsonb,
        ${JSON.stringify({
          overview: "A saved product with a saved product image.",
          highlights: ["Saved material"],
          sources: ["product page"],
        })}::jsonb,
        'ready'
      )
      returning id
    `;
    productId = product.id;

    await page.goto(`/dashboard/products/${productId}`);

    await page.getByRole("button", { name: "Edit material" }).click();
    const editDialog = page.getByRole("dialog");
    await editDialog
      .getByRole("button", { name: "Remove image" })
      .first()
      .click();
    await editDialog.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Ready", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Make a clip from this" }),
    ).toBeVisible();

    const [run] = await sql`
      select input
      from task_runs
      where "scopeKey" = ${`user:e2e-user:product:${productId}`}
        and kind = 'ugc.product.ingest'
      order by "createdAt" desc
      limit 1
    `;
    expect(run.input.importMaterial).toBeUndefined();

    const [saved] = await sql`
      select images
      from ugc_products
      where id = ${productId}
    `;
    expect(saved.images).toEqual([keptImageUrl]);
  } finally {
    await sql.end({ timeout: 5 });
  }
});
