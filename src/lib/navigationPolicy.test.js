import { describe, expect, it, vi } from "vitest";

vi.mock("./config.js", () => ({
  ADMIN_EMAIL: "owner@test.com",
}));

import {
  getDefaultTab,
  getEligibleTabIds,
  getPlatformGate,
  sanitizeActiveTab,
  sanitizeAdminSection,
} from "./navigationPolicy.js";

const admin = { email: "admin@test.com", role: "admin", id: "a1" };
const guard = { email: "guard@test.com", role: "guard", id: "g1" };
const instructor = { email: "inst@test.com", role: "instructor", id: "i1" };
const office = { email: "office@test.com", role: "office", id: "o1" };
const owner = { email: "owner@test.com", role: "admin", id: "own" };

describe("navigationPolicy", () => {
  describe("getPlatformGate", () => {
    it("blocks instructor on desktop", () => {
      expect(getPlatformGate(instructor, true)).toBe("mobile_only");
    });

    it("blocks office on mobile", () => {
      expect(getPlatformGate(office, false)).toBe("desktop_only");
    });

    it("allows guard on desktop", () => {
      expect(getPlatformGate(guard, true)).toBeNull();
    });

    it("allows owner everywhere", () => {
      expect(getPlatformGate(owner, true)).toBeNull();
      expect(getPlatformGate(owner, false)).toBeNull();
    });
  });

  describe("getEligibleTabIds", () => {
    it("admin desktop gets admin, schedule, office", () => {
      expect(getEligibleTabIds(admin, true)).toEqual(["admin", "schedule", "office"]);
    });

    it("guard gets guard and schedule", () => {
      expect(getEligibleTabIds(guard, true)).toEqual(["guard", "schedule"]);
    });

    it("instructor mobile gets attendance tabs", () => {
      expect(getEligibleTabIds(instructor, false)).toEqual([
        "attendance",
        "instructor",
        "guard",
        "personal",
      ]);
    });

    it("instructor desktop gets no tabs", () => {
      expect(getEligibleTabIds(instructor, true)).toEqual([]);
    });

    it("office desktop gets office only", () => {
      expect(getEligibleTabIds(office, true)).toEqual(["office"]);
    });
  });

  describe("getDefaultTab", () => {
    it("defaults guard to guard tab", () => {
      expect(getDefaultTab(guard, true)).toBe("guard");
    });

    it("defaults instructor to attendance", () => {
      expect(getDefaultTab(instructor, false)).toBe("attendance");
    });

    it("defaults admin desktop to admin", () => {
      expect(getDefaultTab(admin, true)).toBe("admin");
    });
  });

  describe("sanitizeActiveTab", () => {
    it("keeps valid tab", () => {
      expect(sanitizeActiveTab("schedule", guard, true)).toBe("schedule");
    });

    it("falls back to default for invalid tab", () => {
      expect(sanitizeActiveTab("admin", guard, true)).toBe("guard");
    });
  });

  describe("sanitizeAdminSection", () => {
    it("maps legacy enrollments to products", () => {
      expect(sanitizeAdminSection("enrollments", admin, true)).toBe("products");
    });

    it("keeps valid section", () => {
      expect(sanitizeAdminSection("customers", admin, true)).toBe("customers");
    });
  });
});
