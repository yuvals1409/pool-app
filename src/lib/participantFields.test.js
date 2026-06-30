import { describe, expect, it, vi } from "vitest";
import {
  calcAge,
  gradeRequired,
  normalizeSheetGender,
  validateParticipantFields,
} from "./participantFields.js";

describe("participantFields", () => {
  describe("calcAge", () => {
    it("calculates age from birth date", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-06-30T12:00:00"));
      expect(calcAge("2016-06-30")).toBe(10);
      vi.useRealTimers();
    });

    it("returns null for invalid date", () => {
      expect(calcAge("")).toBeNull();
      expect(calcAge("invalid")).toBeNull();
    });
  });

  describe("gradeRequired", () => {
    it("requires grade for minors", () => {
      expect(gradeRequired({ childAge: 10 })).toBe(true);
    });

    it("does not require grade for adults", () => {
      expect(gradeRequired({ childAge: 20 })).toBe(false);
    });
  });

  describe("validateParticipantFields", () => {
    it("returns null for valid child", () => {
      expect(
        validateParticipantFields({
          gender: "male",
          grade: "ג'",
          childAge: 8,
        }),
      ).toBeNull();
    });

    it("requires gender", () => {
      expect(validateParticipantFields({ gender: "", grade: "ג'", childAge: 8 })).toBe(
        "participantGenderRequired",
      );
    });

    it("requires grade for child", () => {
      expect(validateParticipantFields({ gender: "female", grade: "", childAge: 8 })).toBe(
        "participantGradeRequired",
      );
    });

    it("rejects invalid grade", () => {
      expect(
        validateParticipantFields({ gender: "male", grade: "invalid", childAge: 8 }),
      ).toBe("participantGradeInvalid");
    });
  });

  describe("normalizeSheetGender", () => {
    it("normalizes hebrew gender values", () => {
      expect(normalizeSheetGender("זכר")).toBe("male");
      expect(normalizeSheetGender("נקבה")).toBe("female");
    });

    it("returns null for unknown", () => {
      expect(normalizeSheetGender("")).toBeNull();
      expect(normalizeSheetGender("other")).toBeNull();
    });
  });
});
