import { test, expect } from "@playwright/test";
import { loginAsDemo, expectWorkspace } from "./helpers/auth.js";

test.describe("role navigation", () => {
  test("admin lands on admin workspace", async ({ page }) => {
    await loginAsDemo(page, "admin");
    await expectWorkspace(page);
    await expect(page.locator(".admin-tab-root")).toBeVisible();
  });

  test("guard lands on scan screen", async ({ page }) => {
    await loginAsDemo(page, "guard");
    await expectWorkspace(page);
    await expect(page.getByText(/כניסה לבריכה|Pool entry/i)).toBeVisible();
    await expect(page.getByTestId("guard-scan-start")).toBeVisible();
  });

  test("office lands on office layout", async ({ page }) => {
    await loginAsDemo(page, "office");
    await expectWorkspace(page);
    await expect(page.locator(".office-layout")).toBeVisible();
  });
});
