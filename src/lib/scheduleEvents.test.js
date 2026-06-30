import { describe, expect, it, vi } from "vitest";

vi.mock("./supabase.js", () => ({
  supabase: {},
  ensureWeeklyLessonsGenerated: vi.fn(),
}));

vi.mock("./config.js", () => ({
  LESSON_DURATION_MINUTES: 30,
}));

import {
  normalizeGroupSession,
  eventDurationMinutes,
  buildAttendanceFocusFromEvent,
  isGroupScheduleEvent,
} from "./scheduleEvents.js";

describe("normalizeGroupSession", () => {
  it("maps session fields to schedule event shape", () => {
    const event = normalizeGroupSession({
      id: "sess-1",
      session_date: "2026-06-01",
      start_time: "16:00:00",
      end_time: "16:45:00",
      status: "scheduled",
      products: {
        name: "חוג א",
        instructor_id: "inst-1",
        instructor_name: "מדריך",
        product_templates: { code: "annual_section" },
      },
    });

    expect(event.id).toBe("group-sess-1");
    expect(event.schedule_kind).toBe("group");
    expect(event.display_title).toBe("חוג א");
    expect(event.cancelled).toBe(false);
    expect(event.instructor_id).toBe("inst-1");
  });

  it("marks cancelled sessions", () => {
    const event = normalizeGroupSession({
      id: "sess-2",
      session_date: "2026-06-02",
      start_time: "10:00:00",
      end_time: "10:30:00",
      status: "cancelled",
      products: { name: "X", product_templates: { code: "annual_section" } },
    });
    expect(event.cancelled).toBe(true);
  });
});

describe("eventDurationMinutes", () => {
  it("uses 30 minutes for swim assessment", () => {
    expect(eventDurationMinutes({ template_code: "swim_assessment", start_time: "10:00" })).toBe(30);
  });

  it("derives duration from start and end times", () => {
    expect(
      eventDurationMinutes({ start_time: "10:00:00", end_time: "11:00:00" }),
    ).toBe(60);
  });

  it("falls back to default lesson duration", () => {
    expect(eventDurationMinutes({ start_time: "10:00:00" })).toBe(30);
  });
});

describe("buildAttendanceFocusFromEvent", () => {
  it("returns lesson id for private events", () => {
    expect(
      buildAttendanceFocusFromEvent({
        schedule_kind: "private",
        id: "lesson-1",
        lesson_date: "2026-06-01",
      }),
    ).toEqual({ date: "2026-06-01", lessonId: "lesson-1" });
  });

  it("returns session id for group events", () => {
    expect(
      buildAttendanceFocusFromEvent({
        schedule_kind: "group",
        session_id: "sess-1",
        scheduled_session_id: "sess-1",
        lesson_date: "2026-06-01",
      }),
    ).toEqual({
      date: "2026-06-01",
      scheduledSessionId: "sess-1",
      sessionId: "sess-1",
    });
  });

  it("returns null for missing event", () => {
    expect(buildAttendanceFocusFromEvent(null)).toBeNull();
  });
});

describe("isGroupScheduleEvent", () => {
  it("detects group events", () => {
    expect(isGroupScheduleEvent({ schedule_kind: "group" })).toBe(true);
    expect(isGroupScheduleEvent({ schedule_kind: "private" })).toBe(false);
  });
});
