import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./config.js", () => ({
  ADMIN_EMAIL: "owner@test.com",
}));

const permissions = await import("./permissions.js");

const owner = { email: "owner@test.com", role: "admin", id: "owner-1" };
const admin = { email: "admin@test.com", role: "admin", id: "admin-1" };
const instructor = { email: "inst@test.com", role: "instructor", id: "inst-1" };
const guard = { email: "guard@test.com", role: "guard", id: "guard-1" };
const office = { email: "office@test.com", role: "office", id: "office-1" };
const parent = { email: "parent@test.com", role: "parent", id: "parent-1" };

describe("permissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("identifies owner by email", () => {
    expect(permissions.isOwner(owner)).toBe(true);
    expect(permissions.isOwner(admin)).toBe(false);
  });

  it("canScan allows guard and instructor", () => {
    expect(permissions.canScan(guard)).toBe(true);
    expect(permissions.canScan(instructor)).toBe(true);
    expect(permissions.canScan(office)).toBe(false);
    expect(permissions.canScan(parent)).toBe(false);
  });

  it("canMarkPayment allows office and admin", () => {
    expect(permissions.canMarkPayment(office)).toBe(true);
    expect(permissions.canMarkPayment(admin)).toBe(true);
    expect(permissions.canMarkPayment(instructor)).toBe(false);
  });

  it("assignableRoles respects actor role", () => {
    expect(permissions.assignableRoles(owner)).toEqual([
      "admin",
      "office",
      "instructor",
      "guard",
    ]);
    expect(permissions.assignableRoles(admin)).toEqual(["instructor", "guard"]);
    expect(permissions.assignableRoles(instructor)).toEqual([]);
  });

  it("canRevokeUser blocks revoking owner and non-managers", () => {
    expect(permissions.canRevokeUser(admin, instructor)).toBe(true);
    expect(permissions.canRevokeUser(admin, owner)).toBe(false);
    expect(permissions.canRevokeUser(instructor, guard)).toBe(false);
    expect(permissions.canRevokeUser(admin, admin)).toBe(false);
  });

  it("canEditLesson respects role and lesson state", () => {
    const lesson = {
      instructor_id: "inst-1",
      used: false,
      cancelled: false,
    };

    expect(permissions.canEditLesson(instructor, lesson)).toBe(true);
    expect(permissions.canEditLesson(instructor, { ...lesson, instructor_id: "other" })).toBe(
      false,
    );
    expect(permissions.canEditLesson(admin, lesson)).toBe(true);
    expect(permissions.canEditLesson(instructor, { ...lesson, used: true })).toBe(false);
    expect(permissions.canEditLesson(instructor, { ...lesson, cancelled: true })).toBe(false);
    expect(permissions.canEditLesson(guard, lesson)).toBe(false);
  });
});
