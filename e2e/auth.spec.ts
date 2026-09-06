import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers/auth";

test("redirects unauthenticated dashboard requests to login", async ({
  page,
}) => {
  await page.goto("/dashboard/settings");

  await expect(page).toHaveURL(
    /\/login\?callbackUrl=%2Fdashboard%2Fsettings(?:&|$)/,
  );
});

test("allows an E2E user session to access the dashboard", async ({ page }) => {
  await loginAs(page, "user");

  await page.goto("/dashboard");

  // Reaching the route without the login redirect is what proves the session;
  // no dashboard surface renders the account details on the server.
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Production overview" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Products" })).toBeVisible();
});
