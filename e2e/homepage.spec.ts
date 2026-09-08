import { expect, test } from "@playwright/test";

for (const locale of ["en", "zh-Hans"] as const) {
  for (const theme of ["light", "dark"] as const) {
    for (const width of [320, 390, 1440]) {
      test(`homepage ${locale} ${theme} at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.context().addCookies([
          {
            name: "locale",
            value: locale,
            url: test.info().project.use.baseURL!,
          },
        ]);
        await page.addInitScript(
          (value) => localStorage.setItem("theme", value),
          theme,
        );
        const errors: string[] = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.goto(locale === "en" ? "/" : "/zh-Hans");
        await expect(page.locator("html")).toHaveClass(new RegExp(theme));
        await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
        const product = page.getByRole("tab", {
          name: locale === "en" ? "Product detail" : "商品细节",
          exact: true,
        });
        await product.click();
        await expect(product).toHaveAttribute("aria-selected", "true");
        await expect(
          page.getByRole("tabpanel", {
            name: locale === "en" ? "Product detail" : "商品细节",
          }),
        ).toContainText(locale === "en" ? "closer look" : "靠近一点");
        await product.press("ArrowRight");
        await expect(
          page.getByRole("tabpanel", {
            name: locale === "en" ? "Gift idea" : "送礼灵感",
          }),
        ).toContainText(locale === "en" ? "everyday moments" : "每个小瞬间");
        await page
          .getByRole("link", {
            name:
              locale === "en"
                ? "See how the story comes together"
                : "看看故事如何发生",
            exact: true,
          })
          .click();
        await expect(page).toHaveURL(/#how-it-works$/);
        await page
          .getByRole("tab", {
            name: locale === "en" ? "Landscape" : "横屏",
            exact: true,
          })
          .click();
        await expect(
          page.getByRole("tabpanel", {
            name: locale === "en" ? "Landscape" : "横屏",
            exact: true,
          }),
        ).toBeVisible();
        const question = page.locator("summary").first();
        await question.click();
        await expect(page.locator("details").first()).toHaveAttribute(
          "open",
          "",
        );
        await question.press("Enter");
        await expect(page.locator("details").first()).not.toHaveAttribute(
          "open",
          "",
        );
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
        ).toBe(true);
        const photo = page.getByRole("img", {
          name:
            locale === "en"
              ? /AI concept image of a creator/
              : /AI 概念图：出镜人物/,
        });
        await expect(photo.first()).toBeVisible();
        expect(
          await photo
            .first()
            .evaluate((element) => (element as HTMLImageElement).naturalWidth),
        ).toBeGreaterThan(0);
        await page
          .getByRole("link", {
            name:
              locale === "en" ? "Make your first story" : "开始你的第一个故事",
            exact: true,
          })
          .first()
          .click();
        await expect(page).toHaveURL(/\/signup$/);
        expect(errors).toEqual([]);
      });
    }
  }
}
