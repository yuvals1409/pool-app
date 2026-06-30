import { describe, expect, it, vi } from "vitest";

vi.mock("./supabase.js", () => ({ supabase: {} }));

import {
  normalizePublicPass,
  normalizeRedeemResult,
  parseAccessLogReason,
} from "./accessPass.js";

describe("accessPass", () => {
  describe("normalizePublicPass", () => {
    it("maps ok result", () => {
      const result = normalizePublicPass({
        result: "ok",
        qr_token: "qr-1",
        public_token: "pub-1",
        child_name: "ילד",
        session_date: "2026-06-30",
      });
      expect(result.ok).toBe(true);
      expect(result.childName).toBe("ילד");
      expect(result.qrToken).toBe("qr-1");
    });

    it("returns not_found for missing data", () => {
      expect(normalizePublicPass(null)).toEqual({
        ok: false,
        result: "not_found",
        raw: null,
      });
    });

    it("returns error result from api", () => {
      expect(normalizePublicPass({ result: "used" }).result).toBe("used");
    });
  });

  describe("normalizeRedeemResult", () => {
    it("maps successful redeem", () => {
      const result = normalizeRedeemResult({
        result: "ok",
        child_name: "דני",
        product_name: "שחייה",
        photo_missing: true,
      });
      expect(result.ok).toBe(true);
      expect(result.childName).toBe("דני");
      expect(result.photoMissing).toBe(true);
    });

    it("maps used pass", () => {
      const result = normalizeRedeemResult({
        result: "used",
        child_name: "דני",
        used_at: "2026-06-30T10:00:00Z",
      });
      expect(result.ok).toBe(false);
      expect(result.result).toBe("used");
      expect(result.usedAt).toBeTruthy();
    });

    it("returns not_found for null", () => {
      expect(normalizeRedeemResult(null)).toEqual({ ok: false, result: "not_found" });
    });
  });

  describe("parseAccessLogReason", () => {
    it("parses json reason", () => {
      expect(parseAccessLogReason('{"child_name":"דני"}')).toEqual({ child_name: "דני" });
    });

    it("returns null for invalid json", () => {
      expect(parseAccessLogReason("not-json")).toBeNull();
      expect(parseAccessLogReason(null)).toBeNull();
    });
  });
});
