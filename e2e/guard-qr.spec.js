import { test, expect } from "@playwright/test";
import { loginAsDemo, expectWorkspace } from "./helpers/auth.js";
import { E2E_QR_TOKEN, hasRealSupabase } from "./helpers/fixtures.js";

test.skip(!hasRealSupabase(), "requires VITE_SUPABASE_URL and seeded E2E fixtures");

async function scanQr(page, token) {
  await page.waitForFunction(() => typeof window.__e2eProcessQr === "function", null, {
    timeout: 15_000,
  });
  await page.evaluate((value) => {
    window.__e2eProcessQr(value);
  }, token);
}

test.describe("guard QR redeem", () => {
  test.skip("first scan succeeds, second scan fails", async ({ page }) => {
    await loginAsDemo(page, "guard");
    await expectWorkspace(page);

    await scanQr(page, E2E_QR_TOKEN);
    await expect(page.locator(".result-card.ok")).toBeVisible({ timeout: 20_000 });

    await page.getByRole("button", { name: /סרוק|scan|another|עוד/i }).click();
    await scanQr(page, E2E_QR_TOKEN);
    await expect(page.locator(".result-card.err")).toBeVisible({ timeout: 20_000 });
  });
});
