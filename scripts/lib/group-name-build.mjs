/** Node port of src/lib/groupName.js for sheet bootstrap scripts. */

export const GROUP_TYPE_ANNUAL = "annual";
export const GROUP_TYPE_SUMMER = "summer";

const DAY_ABBREVIATIONS = ["א'", "ב'", "ג'", "ד'", "ה'", "ו'", "ש'"];
const DAY_NAMES = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

const GENDER_LABELS = { male: "בנים", female: "בנות", mixed: "מעורב" };
const ACTIVITY_TYPE_LABELS = { annual: "חוג שנתי", summer: "קורס קיץ" };

function fmtTimeShort(time) {
  if (!time) return "";
  return String(time).slice(0, 5);
}

/** Short label from excel product name for disambiguation. */
export function shortExcelLabel(excelSourceName) {
  const text = String(excelSourceName || "").trim();
  if (!text) return "";
  const swim = text.match(/שחייה\s*(\d+)/i);
  if (swim) return `שחייה ${swim[1]}`;
  if (text.length <= 28) return text;
  return `${text.slice(0, 25)}…`;
}

function buildScheduleString(type, schedule) {
  const slots = (schedule || []).filter((s) => s?.startTime);
  if (!slots.length) return "";
  const useAbbrev = type === GROUP_TYPE_SUMMER || slots.length > 1;
  return slots
    .map((slot) => {
      const dayNum = Number(slot.day);
      const dayLabel = useAbbrev
        ? (DAY_ABBREVIATIONS[dayNum] ?? String(dayNum))
        : (DAY_NAMES[dayNum] ?? String(dayNum));
      return `${dayLabel} ${fmtTimeShort(slot.startTime)}`;
    })
    .join(" & ");
}

export function buildGroupName({ type, level, gender, targetAudience, schedule, excelSourceName, forceExcelLabel = false }) {
  const parts = [];
  const activity = ACTIVITY_TYPE_LABELS[type];
  if (activity) parts.push(activity);
  if (type === GROUP_TYPE_SUMMER || forceExcelLabel) {
    const label = shortExcelLabel(excelSourceName);
    if (label) parts.push(label);
  }
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
  const scheduleStr = buildScheduleString(type, schedule);
  if (scheduleStr) parts.push(scheduleStr);
  return parts.join(" | ");
}

export function dayNameToNumber(dayHeb) {
  const map = { ראשון: 0, שני: 1, שלישי: 2, רביעי: 3, חמישי: 4, שישי: 5, שבת: 6 };
  return map[String(dayHeb || "").trim()] ?? null;
}

export function dayNumberToAbbrev(dayNum) {
  return DAY_ABBREVIATIONS[Number(dayNum)]?.replace("'", "") || String(dayNum);
}

export function weekdaysToSheetDays(weekdays) {
  return (weekdays || [])
    .map((d) => dayNumberToAbbrev(d))
    .filter(Boolean)
    .join("+");
}
