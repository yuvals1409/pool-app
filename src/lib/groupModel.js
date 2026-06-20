import { buildGroupName } from "./groupName.js";
import {
  emptyScheduleSlot,
  GROUP_TYPE_ANNUAL,
  GROUP_TYPE_SUMMER,
  TEMPLATE_CODE_BY_TYPE,
  TYPE_BY_TEMPLATE_CODE,
} from "./groupConstants.js";

function sliceTime(value) {
  if (!value) return "";
  return String(value).slice(0, 5);
}

function parseLevelFromLabel(levelLabel) {
  const match = String(levelLabel || "").match(/רמה\s*(\d+)/);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isInteger(n) && n >= 1 && n <= 10 ? n : null;
}

export function normalizeScheduleSlots(slots) {
  if (!Array.isArray(slots) || !slots.length) return [];
  return slots
    .map((slot) => ({
      day: Number(slot.day),
      startTime: sliceTime(slot.startTime),
      endTime: sliceTime(slot.endTime),
    }))
    .filter((slot) => Number.isInteger(slot.day) && slot.day >= 0 && slot.day <= 6 && slot.startTime && slot.endTime)
    .sort((a, b) => a.day - b.day || a.startTime.localeCompare(b.startTime));
}

function scheduleFromProduct(product) {
  const pattern = product.schedule_pattern || {};
  const schedule = pattern.schedule;
  if (Array.isArray(schedule) && schedule.length) {
    return normalizeScheduleSlots(schedule);
  }

  const templateCode = product.product_templates?.code || "annual_section";
  const startTime = sliceTime(product.start_time);
  const endTime = sliceTime(product.end_time);

  if (templateCode === "summer_course" || pattern.type === "course_series") {
    const weekdays = Array.isArray(pattern.weekdays) ? pattern.weekdays : [];
    if (weekdays.length && startTime && endTime) {
      return normalizeScheduleSlots(
        weekdays.map((day) => ({ day: Number(day), startTime, endTime })),
      );
    }
    return [];
  }

  if (product.day_of_week != null && startTime && endTime) {
    return normalizeScheduleSlots([{ day: product.day_of_week, startTime, endTime }]);
  }

  return [];
}

export function createEmptyFormState() {
  return {
    type: GROUP_TYPE_ANNUAL,
    level: null,
    targetAudience: "",
    gender: "mixed",
    schedule: [emptyScheduleSlot(1)],
    instructorId: "",
    instructorName: "",
    capacity: "",
    courseStart: "",
    courseEnd: "",
  };
}

/**
 * @param {object} product
 * @returns {ReturnType<typeof createEmptyFormState>}
 */
export function productToFormState(product) {
  const templateCode = product.product_templates?.code || "annual_section";
  const type = TYPE_BY_TEMPLATE_CODE[templateCode] || GROUP_TYPE_ANNUAL;
  const pattern = product.schedule_pattern || {};
  const schedule = scheduleFromProduct(product);

  return {
    type,
    level: product.level != null ? product.level : parseLevelFromLabel(product.level_label),
    targetAudience: product.target_audience || "",
    gender: product.gender || "mixed",
    schedule: schedule.length ? schedule : [emptyScheduleSlot(product.day_of_week ?? 1)],
    instructorId: product.instructor_id || "",
    instructorName: product.instructor_name || "",
    capacity: product.capacity != null ? String(product.capacity) : "",
    courseStart: pattern.course_start || "",
    courseEnd: pattern.course_end || "",
  };
}

function timeToMinutes(time) {
  const [h, m] = String(time).slice(0, 5).split(":").map(Number);
  return h * 60 + m;
}

/**
 * @param {ReturnType<typeof createEmptyFormState>} form
 * @param {{ days?: string[] }} [opts]
 * @returns {{ ok: true, payload: object, name: string } | { ok: false, errorKey: string }}
 */
export function formStateToProductPayload(form, opts = {}) {
  const schedule = normalizeScheduleSlots(form.schedule);
  if (!schedule.length) {
    return { ok: false, errorKey: "scheduleRequired" };
  }

  for (const slot of schedule) {
    if (timeToMinutes(slot.startTime) >= timeToMinutes(slot.endTime)) {
      return { ok: false, errorKey: "invalidScheduleSlot" };
    }
  }

  if (form.type === GROUP_TYPE_ANNUAL) {
    const level = Number(form.level);
    if (!Number.isInteger(level) || level < 1 || level > 10) {
      return { ok: false, errorKey: "levelRequired" };
    }
  }

  if (!String(form.targetAudience || "").trim()) {
    return { ok: false, errorKey: "fillAllFields" };
  }

  if (!form.gender) {
    return { ok: false, errorKey: "fillAllFields" };
  }

  if (!form.instructorId) {
    return { ok: false, errorKey: "fillAllFields" };
  }

  if (form.type === GROUP_TYPE_SUMMER) {
    if (!form.courseStart || !form.courseEnd) {
      return { ok: false, errorKey: "summerCourseDatesRequired" };
    }
  }

  const cap = String(form.capacity || "").trim() ? Number(form.capacity) : null;
  const first = schedule[0];
  const level = form.type === GROUP_TYPE_ANNUAL ? Number(form.level) : null;

  const name = buildGroupName({
    type: form.type,
    level,
    gender: form.gender,
    targetAudience: form.targetAudience,
    schedule,
    days: opts.days,
  });

  if (!name.trim()) {
    return { ok: false, errorKey: "fillAllFields" };
  }

  const schedulePattern = {
    schedule: schedule.map((slot) => ({
      day: slot.day,
      startTime: slot.startTime,
      endTime: slot.endTime,
    })),
  };

  if (form.type === GROUP_TYPE_SUMMER) {
    schedulePattern.type = "course_series";
    schedulePattern.weekdays = schedule.map((s) => s.day);
    schedulePattern.course_start = form.courseStart;
    schedulePattern.course_end = form.courseEnd;
  } else {
    schedulePattern.type = "weekly";
  }

  const payload = {
    name: name.trim(),
    instructor_id: form.instructorId,
    instructor_name: String(form.instructorName || "").trim(),
    capacity: Number.isInteger(cap) ? cap : null,
    level,
    level_label: level != null ? `רמה ${level}` : null,
    target_audience: String(form.targetAudience).trim(),
    gender: form.gender,
    day_of_week: form.type === GROUP_TYPE_SUMMER ? null : first.day,
    start_time: first.startTime,
    end_time: first.endTime,
    schedule_pattern: schedulePattern,
  };

  return { ok: true, payload, name: name.trim(), templateCode: TEMPLATE_CODE_BY_TYPE[form.type] };
}

export function computeFormGroupName(form, days) {
  const schedule = normalizeScheduleSlots(form.schedule);
  const level = form.type === GROUP_TYPE_ANNUAL ? Number(form.level) : null;
  return buildGroupName({
    type: form.type,
    level: Number.isInteger(level) ? level : null,
    gender: form.gender,
    targetAudience: form.targetAudience,
    schedule,
    days,
  });
}
