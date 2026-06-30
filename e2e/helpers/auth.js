import { expect } from "@playwright/test";

const DEMO_ROLE_LABELS = {
  admin: "מנהל",
  guard: "שומר",
  instructor: "מדריך",
  office: "משרד",
};

export async function loginAsDemo(page, role) {
  await page.goto("/");
  await expect(page.locator(".login-demo-grid")).toBeVisible({ timeout: 15_000 });
  await page
    .locator(".login-demo-grid")
    .getByRole("button", { name: DEMO_ROLE_LABELS[role] })
    .click();
}

export async function switchToEnglish(page) {
  const enButton = page.locator(".lang-switcher button", { hasText: "EN" });
  if (await enButton.count()) {
    await enButton.first().click();
  }
}

export async function expectWorkspace(page) {
  await expect(page.locator(".app-workspace-shell, .app-main")).toBeVisible({
    timeout: 20_000,
  });
}

export async function openInstructorAttendance(page) {
  await loginAsDemo(page, "instructor");
  await expectWorkspace(page);
  await page.getByRole("tab", { name: /נוכחות|Attendance/i }).click();
  await expect(page.locator(".content.tab-stage")).toContainText(/נוכחות|Attendance/i, {
    timeout: 20_000,
  });
}
