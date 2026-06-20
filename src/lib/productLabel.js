import { fmt_time } from "./lessonDates.js";
import { hasStructuredGroupFields } from "./groupName.js";

const DAY_NAMES = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

export function formatWeekdays(pattern, days) {
  const schedule = pattern?.schedule;
  if (Array.isArray(schedule) && schedule.length) {
    return schedule
      .map((slot) => days?.[slot.day] ?? DAY_NAMES[slot.day] ?? String(slot.day))
      .join(" + ");
  }
  const weekdays = pattern?.weekdays;
  if (!Array.isArray(weekdays) || !weekdays.length) return "";
  return weekdays.map((d) => days?.[d] ?? DAY_NAMES[d] ?? String(d)).join(" + ");
}

export function formatProductLabel(product, days, templateCode) {
  if (!product) return "";
  if (hasStructuredGroupFields(product) && product.name) {
    return product.name;
  }
  const pattern = product.schedule_pattern || {};
  const isSummer = templateCode === "summer_course" || pattern.type === "course_series";
  if (isSummer) {
    const wd = formatWeekdays(pattern, days);
    const range = pattern.course_start && pattern.course_end
      ? ` ${pattern.course_start}–${pattern.course_end}`
      : "";
    return `${product.name}${wd ? ` · ${wd}` : ""}${range} · ${fmt_time(product.start_time)}`;
  }
  const day = product.day_of_week != null ? (days?.[product.day_of_week] ?? DAY_NAMES[product.day_of_week]) : "";
  return `${day} ${fmt_time(product.start_time)} · ${product.name}`;
}
