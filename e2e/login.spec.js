import { expect, test } from "@playwright/test";

const email = process.env.E2E_TEST_EMAIL;
const password = process.env.E2E_TEST_PASSWORD;

test.skip(!email || !password, "requires E2E_TEST_EMAIL and E2E_TEST_PASSWORD");

test("email login reaches workspace shell", async ({ page }) => {
  await page.goto("/");
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.locator("form.login-form button[type='submit']").click();

  await expect(page.locator(".login-page")).toBeHidden({ timeout: 20_000 });
  await expect(page.locator(".app-workspace-shell")).toBeVisible({
    timeout: 20_000,
  });
});
