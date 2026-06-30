import { test, expect } from "@playwright/test";

test("health declaration page loads", async ({ page }) => {
  await page.goto("/health-declaration");
  await expect(page.locator(".health-declaration")).toBeVisible();
  await expect(page.locator(".hd-demo-badge, .hd-question").first()).toBeVisible();
});
