import { SCHEDULE_HOURS, getWeekBounds, isToday, toLocalDateStr } from "./lessonDates.js";

export const SCHEDULE_SLOT_H = 27;
const SCHEDULE_AXIS_W = 56;

const SCHEDULE_START_MIN = SCHEDULE_HOURS[0] * 60;
const SCHEDULE_END_MIN = (SCHEDULE_HOURS[SCHEDULE_HOURS.length - 1] + 1) * 60;

export function getNowLineTop(date = new Date()) {
  const currentMin = date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
  if (currentMin < SCHEDULE_START_MIN || currentMin >= SCHEDULE_END_MIN) return null;
  return ((currentMin - SCHEDULE_START_MIN) / 30) * SCHEDULE_SLOT_H;
}

export function isTodayInWeek(anchorDate, now = new Date()) {
  const { start, end } = getWeekBounds(anchorDate);
  const today = toLocalDateStr(now);
  return today >= toLocalDateStr(start) && today <= toLocalDateStr(end);
}

export function shouldShowNowLine(anchorDate, variant, now = new Date()) {
  if (getNowLineTop(now) == null) return false;
  if (variant === "day") return isToday(anchorDate);
  if (variant === "week") return isTodayInWeek(anchorDate, now);
  return false;
}

export { SCHEDULE_AXIS_W };
