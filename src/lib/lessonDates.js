export const fmt_time = (t) => (t ? t.slice(0, 5) : "");

export function toLocalDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function dateToDayOfWeek(lessonDate) {
  const [y, m, d] = lessonDate.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
}

export function getWeekBounds(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const sunday = new Date(d);
  sunday.setDate(d.getDate() - d.getDay());
  const saturday = new Date(sunday);
  saturday.setDate(sunday.getDate() + 6);
  return { start: sunday, end: saturday };
}

export function parseLessonDateTime(lessonDate, startTime) {
  const [y, m, d] = lessonDate.split("-").map(Number);
  const [h, min] = startTime.slice(0, 5).split(":").map(Number);
  return new Date(y, m - 1, d, h, min, 0);
}

export function addMinutes(date, mins) {
  return new Date(date.getTime() + mins * 60_000);
}

export function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function parseDateStr(str) {
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

export function isToday(date) {
  return isSameDay(date, new Date());
}

export function getMonthGridDays(anchorDate) {
  const year = anchorDate.getFullYear();
  const month = anchorDate.getMonth();
  const first = new Date(year, month, 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  const days = [];
  for (let i = 0; i < 42; i++) {
    days.push(addDays(start, i));
  }
  return days;
}

const VIEW_BUFFER_DAYS = 7;

export function getViewDateRange(view, anchorDate) {
  const d = new Date(anchorDate);
  d.setHours(0, 0, 0, 0);

  if (view === "day") {
    return {
      start: addDays(d, -VIEW_BUFFER_DAYS),
      end: addDays(d, VIEW_BUFFER_DAYS),
    };
  }

  if (view === "week") {
    const { start: weekStart, end: weekEnd } = getWeekBounds(d);
    return {
      start: addDays(weekStart, -VIEW_BUFFER_DAYS),
      end: addDays(weekEnd, VIEW_BUFFER_DAYS),
    };
  }

  const monthStart = new Date(d.getFullYear(), d.getMonth(), 1);
  const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const gridStart = new Date(monthStart);
  gridStart.setDate(monthStart.getDate() - monthStart.getDay());
  const gridEnd = new Date(monthEnd);
  gridEnd.setDate(monthEnd.getDate() + (6 - monthEnd.getDay()));
  return {
    start: addDays(gridStart, -VIEW_BUFFER_DAYS),
    end: addDays(gridEnd, VIEW_BUFFER_DAYS),
  };
}

export function lessonStatus(lesson) {
  if (lesson.cancelled) return "cancelled";
  if (lesson.used) return "used";
  return "waiting";
}

export function canManageLesson(lesson) {
  return !lesson.used && !lesson.cancelled;
}

export function isPastLesson(lesson) {
  return parseLessonDateTime(lesson.lesson_date, lesson.start_time) < new Date();
}

export const SCHEDULE_HOURS = Array.from({ length: 19 }, (_, i) => i + 5);

export function timeToMinutes(time) {
  const [h, m] = time.slice(0, 5).split(":").map(Number);
  return h * 60 + m;
}

export function minutesToTime(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export const MIN_START_MINS = 5 * 60;
export const MAX_START_MINS = 23 * 60;

export function isValidStartTime(time) {
  if (!time) return false;
  const total = timeToMinutes(time);
  return total >= MIN_START_MINS && total <= MAX_START_MINS;
}

export function snapTimeToGrid(mins) {
  const snapped = Math.round(mins / 30) * 30;
  return Math.max(MIN_START_MINS, Math.min(MAX_START_MINS, snapped));
}
