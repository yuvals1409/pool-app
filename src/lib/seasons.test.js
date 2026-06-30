import { describe, expect, it } from "vitest";
import {
  swimmingSeasonStartYear,
  swimmingSeasonBounds,
  swimmingSeasonName,
  isSummerSeasonName,
} from "./seasons.js";

describe("swimmingSeasonStartYear", () => {
  it("returns previous year before September", () => {
    expect(swimmingSeasonStartYear(new Date("2026-08-31"))).toBe(2025);
  });

  it("returns current year from September 1", () => {
    expect(swimmingSeasonStartYear(new Date("2026-09-01"))).toBe(2026);
    expect(swimmingSeasonStartYear(new Date("2027-03-15"))).toBe(2026);
  });
});

describe("swimmingSeasonBounds", () => {
  it("spans Sep 1 to next Sep 1", () => {
    expect(swimmingSeasonBounds(2026)).toEqual({
      start_date: "2026-09-01",
      end_date: "2027-09-01",
    });
  });
});

describe("swimmingSeasonName", () => {
  it("formats school year label", () => {
    expect(swimmingSeasonName(2026)).toBe("2026/27");
  });
});

describe("isSummerSeasonName", () => {
  it("detects Hebrew and English summer names", () => {
    expect(isSummerSeasonName("קיץ 2026")).toBe(true);
    expect(isSummerSeasonName("Summer 2026")).toBe(true);
    expect(isSummerSeasonName("2026/27")).toBe(false);
  });
});
