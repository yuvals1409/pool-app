import { test, expect } from "@playwright/test";
import { loginAsDemo, expectWorkspace } from "./helpers/auth.js";
import { E2E_SEARCH_PHONE, hasRealSupabase } from "./helpers/fixtures.js";

test.skip(!hasRealSupabase(), "requires VITE_SUPABASE_URL and seeded E2E fixtures");

test.describe("office enrollment search", () => {
  test("finds participant by phone", async ({ page }) => {
    await loginAsDemo(page, "office");
    await expectWorkspace(page);

    await page.getByTestId("office-search-phone").fill(E2E_SEARCH_PHONE);
    await page.getByTestId("office-search-phone").press("Enter");

    await expect(page.locator(".data-table tbody tr, .grouped-list .log-item").first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText("ילד E2E")).toBeVisible();
  });
});
