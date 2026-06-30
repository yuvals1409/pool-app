import { test, expect } from "@playwright/test";
import { loginAsDemo } from "./helpers/auth.js";

test.describe("platform gates", () => {
  test("instructor on desktop sees mobile-only gate", async ({ page }) => {
    await loginAsDemo(page, "instructor");
    await expect(page.getByText(/זמין בטלפון בלבד|Mobile only/i)).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.locator(".app-workspace-shell")).toHaveCount(0);
  });

  test.describe("mobile viewport", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("office on mobile sees desktop-only gate", async ({ page }) => {
      await loginAsDemo(page, "office");
      await expect(page.getByText(/זמין במחשב בלבד|Desktop only/i)).toBeVisible({
        timeout: 20_000,
      });
      await expect(page.locator(".app-workspace-shell")).toHaveCount(0);
    });
  });
});
