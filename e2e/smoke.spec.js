import { expect, test } from "@playwright/test";

test("login page loads", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".login-page")).toBeVisible();
  await expect(page.locator('input[type="email"]')).toBeVisible();
  await expect(page.locator('input[type="password"]')).toBeVisible();
  await expect(page.locator("form.login-form")).toBeVisible();
});
