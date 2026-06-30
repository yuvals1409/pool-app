import { test, expect } from "@playwright/test";
import { loginAsDemo, expectWorkspace } from "./helpers/auth.js";

test.describe("schedule tab", () => {
  test("admin can open schedule view", async ({ page }) => {
    await loginAsDemo(page, "admin");
    await expectWorkspace(page);
    await page.getByRole("button", { name: /לו"ז|Schedule/ }).click();
    await expect(page.locator(".schedule-wrap")).toBeVisible({ timeout: 15_000 });
  });

  test("guard can open schedule view", async ({ page }) => {
    await loginAsDemo(page, "guard");
    await expectWorkspace(page);
    await page.getByRole("button", { name: /לו"ז|Schedule/ }).click();
    await expect(page.locator(".schedule-wrap")).toBeVisible({ timeout: 15_000 });
  });
});
