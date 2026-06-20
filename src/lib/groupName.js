import {
  ACTIVITY_TYPE_LABELS,
  DAY_ABBREVIATIONS,
  DAY_NAMES,
  GENDER_LABELS,
  GROUP_TYPE_ANNUAL,
  GROUP_TYPE_SUMMER,
} from "./groupConstants.js";

function fmtTimeShort(time) {
  if (!time) return "";
  return String(time).slice(0, 5);
}

function buildScheduleString(type, schedule, days) {
  const slots = (schedule || []).filter((s) => s && s.startTime);
  if (!slots.length) return "";

  const useAbbrev = type === GROUP_TYPE_SUMMER || slots.length > 1;

  return slots
    .map((slot) => {
      const dayNum = Number(slot.day);
      const dayLabel = useAbbrev
        ? (DAY_ABBREVIATIONS[dayNum] ?? String(dayNum))
        : (days?.[dayNum] ?? DAY_NAMES[dayNum] ?? String(dayNum));
      return `${dayLabel} ${fmtTimeShort(slot.startTime)}`;
    })
    .join(" & ");
}

/**
 * @param {{
 *   type: 'annual'|'summer',
 *   level?: number|null,
 *   gender?: 'male'|'female'|'mixed',
 *   targetAudience?: string,
 *   schedule?: Array<{ day: number, startTime: string, endTime?: string }>,
 *   days?: string[],
 * }} params
 */
export function buildGroupName({ type, level, gender, targetAudience, schedule, days }) {
  const parts = [];

  const activity = ACTIVITY_TYPE_LABELS[type];
  if (activity) parts.push(activity);

  if (type === GROUP_TYPE_ANNUAL && level != null && level >= 1 && level <= 10) {
    parts.push(`רמה ${level}`);
  }

  const audience = String(targetAudience || "").trim();
  if (audience) {
    if (gender && gender !== "mixed") {
      parts.push(`${GENDER_LABELS[gender]} ${audience}`);
    } else {
      parts.push(audience);
    }
  }

  const scheduleStr = buildScheduleString(type, schedule, days);
  if (scheduleStr) parts.push(scheduleStr);

  return parts.join(" | ");
}

export function hasStructuredGroupFields(product) {
  if (!product) return false;
  return Boolean(
    product.target_audience
    || product.gender
    || product.level != null
    || (Array.isArray(product.schedule_pattern?.schedule) && product.schedule_pattern.schedule.length > 0),
  );
}
