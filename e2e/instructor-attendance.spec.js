import { test, expect } from "@playwright/test";
import { openInstructorAttendance } from "./helpers/auth.js";
import {
  E2E_LESSON_ID,
  E2E_GROUP_SESSION_ID,
  hasRealSupabase,
} from "./helpers/fixtures.js";

test.skip(!hasRealSupabase(), "requires VITE_SUPABASE_URL");

async function openSessionRoster(page, sessionId) {
  const sessionBtn = page.locator(`[data-testid="attendance-session-${sessionId}"]`);
  await expect(sessionBtn).toBeVisible({ timeout: 20_000 });
  await sessionBtn.click();
  await expect(page.locator('[data-testid="attendance-save"]')).toBeVisible({
    timeout: 20_000,
  });
}

async function saveAttendance(page) {
  await page.locator('[data-testid="attendance-save"]').click();
  await expect(page.locator(".toast")).toContainText(/הנוכחות נשמרה|Attendance saved/i, {
    timeout: 15_000,
  });
}

test.describe("instructor attendance (mobile)", () => {
  test("marks private lesson absent", async ({ page }) => {
    await openInstructorAttendance(page);
    await openSessionRoster(page, E2E_LESSON_ID);

    await page.getByRole("button", { name: /^לא הגיע$|^Absent$/i }).click();
    await saveAttendance(page);
  });

  test("marks group session present", async ({ page }) => {
    await openInstructorAttendance(page);
    await openSessionRoster(page, E2E_GROUP_SESSION_ID);

    await expect(page.getByText("ילד E2E")).toBeVisible();
    await page.getByRole("button", { name: /^הגיע$|^Present$/i }).first().click();
    await saveAttendance(page);
  });
});
