import { test, expect } from "@playwright/test";
import { loginAsDemo, expectWorkspace } from "./helpers/auth.js";
import { hasRealSupabase } from "./helpers/fixtures.js";

test.skip(!hasRealSupabase(), "requires VITE_SUPABASE_URL");

test.describe("instructor mobile attendance", () => {
  test("attendance tab loads on mobile", async ({ page }) => {
    await loginAsDemo(page, "instructor");
    await expectWorkspace(page);

    await page.getByRole("tab", { name: /נוכחות|Attendance/i }).click();
    const stage = page.locator(".content.tab-stage");
    await expect(stage).toContainText(/נוכחות|Attendance/i, { timeout: 20_000 });
    await expect(stage).toContainText(/סמן הגיע|Mark present/i);
  });
});
