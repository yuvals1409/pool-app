import { describe, expect, it } from "vitest";
import {
  computeFormGroupName,
  createEmptyFormState,
  formStateToProductPayload,
  normalizeScheduleSlots,
} from "./groupModel.js";
import { GROUP_TYPE_ANNUAL, GROUP_TYPE_SUMMER } from "./groupConstants.js";

function validAnnualForm(overrides = {}) {
  return {
    ...createEmptyFormState(),
    type: GROUP_TYPE_ANNUAL,
    level: 3,
    targetAudience: "גילאי 6-8",
    gender: "mixed",
    instructorId: "inst-1",
    instructorName: "מדריך",
    schedule: [{ day: 1, startTime: "16:00", endTime: "16:30" }],
    ...overrides,
  };
}

describe("groupModel", () => {
  describe("normalizeScheduleSlots", () => {
    it("filters invalid slots and sorts by day and time", () => {
      const slots = normalizeScheduleSlots([
        { day: 3, startTime: "17:00:00", endTime: "17:30" },
        { day: 1, startTime: "16:00", endTime: "16:30" },
        { day: 99, startTime: "10:00", endTime: "11:00" },
      ]);
      expect(slots).toHaveLength(2);
      expect(slots[0].day).toBe(1);
      expect(slots[1].day).toBe(3);
      expect(slots[0].startTime).toBe("16:00");
    });

    it("returns empty array for invalid input", () => {
      expect(normalizeScheduleSlots([])).toEqual([]);
      expect(normalizeScheduleSlots(null)).toEqual([]);
    });
  });

  describe("formStateToProductPayload", () => {
    it("returns ok payload for valid annual form", () => {
      const result = formStateToProductPayload(validAnnualForm());
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.payload.instructor_id).toBe("inst-1");
        expect(result.payload.level).toBe(3);
        expect(result.templateCode).toBe("annual_section");
      }
    });

    it("returns scheduleRequired when schedule empty", () => {
      expect(formStateToProductPayload(validAnnualForm({ schedule: [] }))).toEqual({
        ok: false,
        errorKey: "scheduleRequired",
      });
    });

    it("returns invalidScheduleSlot when end before start", () => {
      expect(
        formStateToProductPayload(
          validAnnualForm({ schedule: [{ day: 1, startTime: "17:00", endTime: "16:00" }] }),
        ),
      ).toEqual({ ok: false, errorKey: "invalidScheduleSlot" });
    });

    it("returns levelRequired for annual without level", () => {
      expect(formStateToProductPayload(validAnnualForm({ level: null }))).toEqual({
        ok: false,
        errorKey: "levelRequired",
      });
    });

    it("returns fillAllFields when target audience missing", () => {
      expect(formStateToProductPayload(validAnnualForm({ targetAudience: "" }))).toEqual({
        ok: false,
        errorKey: "fillAllFields",
      });
    });

    it("returns fillAllFields when instructor missing", () => {
      expect(formStateToProductPayload(validAnnualForm({ instructorId: "" }))).toEqual({
        ok: false,
        errorKey: "fillAllFields",
      });
    });

    it("returns summerCourseDatesRequired for summer without dates", () => {
      const form = validAnnualForm({
        type: GROUP_TYPE_SUMMER,
        level: null,
        courseStart: "",
        courseEnd: "",
      });
      expect(formStateToProductPayload(form)).toEqual({
        ok: false,
        errorKey: "summerCourseDatesRequired",
      });
    });

    it("returns ok for valid summer form", () => {
      const result = formStateToProductPayload(
        validAnnualForm({
          type: GROUP_TYPE_SUMMER,
          level: null,
          courseStart: "2026-07-01",
          courseEnd: "2026-08-15",
        }),
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.templateCode).toBe("summer_course");
        expect(result.payload.schedule_pattern.type).toBe("course_series");
      }
    });
  });

  describe("computeFormGroupName", () => {
    it("includes level for annual groups", () => {
      const name = computeFormGroupName(validAnnualForm());
      expect(name).toContain("רמה 3");
    });
  });
});
