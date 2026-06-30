import { describe, expect, it, vi } from "vitest";

vi.mock("./supabase.js", () => ({
  supabase: {},
  ensureWeeklyLessonsGenerated: vi.fn(),
}));

vi.mock("./config.js", () => ({
  LESSON_DURATION_MINUTES: 30,
}));

import { eventsOverlap, assignEventColumns } from "./scheduleLayout.js";

describe("eventsOverlap", () => {
  it("detects overlapping time ranges", () => {
    const a = { id: "a", start_time: "10:00:00", end_time: "10:30:00" };
    const b = { id: "b", start_time: "10:15:00", end_time: "10:45:00" };
    const c = { id: "c", start_time: "11:00:00", end_time: "11:30:00" };
    expect(eventsOverlap(a, b)).toBe(true);
    expect(eventsOverlap(a, c)).toBe(false);
  });
});

describe("assignEventColumns", () => {
  it("assigns single column for non-overlapping events", () => {
    const events = [
      { id: "a", start_time: "10:00:00", end_time: "10:30:00" },
      { id: "b", start_time: "11:00:00", end_time: "11:30:00" },
    ];
    const layout = assignEventColumns(events);
    expect(layout.get("a")).toEqual({ column: 0, totalColumns: 1 });
    expect(layout.get("b")).toEqual({ column: 0, totalColumns: 1 });
  });

  it("splits overlapping events into columns", () => {
    const events = [
      { id: "a", start_time: "10:00:00", end_time: "10:45:00" },
      { id: "b", start_time: "10:15:00", end_time: "11:00:00" },
      { id: "c", start_time: "10:30:00", end_time: "11:15:00" },
    ];
    const layout = assignEventColumns(events);
    expect(layout.get("a").totalColumns).toBeGreaterThanOrEqual(2);
    expect(layout.get("b").column).not.toBe(layout.get("a").column);
  });

  it("returns empty map for no events", () => {
    expect(assignEventColumns([]).size).toBe(0);
  });
});
