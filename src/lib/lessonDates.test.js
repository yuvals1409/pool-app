import { describe, expect, it } from "vitest";
import {
  dateToDayOfWeek,
  getWeekBounds,
  isSameDay,
  parseLessonDateTime,
  toLocalDateStr,
} from "./lessonDates.js";

describe("lessonDates", () => {
  it("formats local date as YYYY-MM-DD", () => {
    const date = new Date(2026, 5, 30);
    expect(toLocalDateStr(date)).toBe("2026-06-30");
  });

  it("maps lesson date string to day of week", () => {
    expect(dateToDayOfWeek("2026-06-30")).toBe(2);
  });

  it("returns Sunday-Saturday week bounds", () => {
    const wednesday = new Date(2026, 5, 30);
    const { start, end } = getWeekBounds(wednesday);
    expect(start.getDay()).toBe(0);
    expect(end.getDay()).toBe(6);
    expect(toLocalDateStr(start)).toBe("2026-06-28");
    expect(toLocalDateStr(end)).toBe("2026-07-04");
  });

  it("parses lesson date and start time", () => {
    const dt = parseLessonDateTime("2026-06-30", "14:30:00");
    expect(dt.getFullYear()).toBe(2026);
    expect(dt.getMonth()).toBe(5);
    expect(dt.getDate()).toBe(30);
    expect(dt.getHours()).toBe(14);
    expect(dt.getMinutes()).toBe(30);
  });

  it("compares calendar days", () => {
    const a = new Date(2026, 5, 30, 8, 0);
    const b = new Date(2026, 5, 30, 20, 0);
    const c = new Date(2026, 6, 1, 8, 0);
    expect(isSameDay(a, b)).toBe(true);
    expect(isSameDay(a, c)).toBe(false);
  });
});
