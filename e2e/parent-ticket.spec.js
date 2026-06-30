import { test, expect } from "@playwright/test";
import { E2E_LESSON_ID, E2E_PASS_TOKEN, hasRealSupabase } from "./helpers/fixtures.js";

test.skip(!hasRealSupabase(), "requires VITE_SUPABASE_URL and seeded E2E fixtures");

test.describe("public parent tickets", () => {
  test("lesson ticket loads by query param", async ({ page }) => {
    await page.goto(`/?ticket=${E2E_LESSON_ID}`);
    await expect(page.locator(".lesson-info")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("ילד E2E")).toBeVisible();
  });

  test("access pass loads by public path", async ({ page }) => {
    await page.goto(`/t/${E2E_PASS_TOKEN}`);
    await expect(page.locator(".lesson-info")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("ילד E2E")).toBeVisible();
  });
});
