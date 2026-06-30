/** @typedef {'annual'|'summer'} GroupType */
/** @typedef {'male'|'female'|'mixed'} GroupGender */
/** @typedef {'age'|'grade'} TargetAudienceKind */

export const GROUP_TYPE_ANNUAL = "annual";
export const GROUP_TYPE_SUMMER = "summer";

export const TEMPLATE_CODE_BY_TYPE = {
  annual: "annual_section",
  summer: "summer_course",
};

export const TYPE_BY_TEMPLATE_CODE = {
  annual_section: GROUP_TYPE_ANNUAL,
  summer_course: GROUP_TYPE_SUMMER,
};

export const DEFAULT_AGE_AUDIENCES = [
  "גילאי 4-5",
  "גילאי 5.5-7",
  "גילאי 6-8",
];

export const DEFAULT_GRADE_AUDIENCES = [
  "כיתות א'-ב'",
  "כיתות ב'-ד'",
  "כיתות ג'-ה'",
  "כיתות ה'+",
];

export const DAY_ABBREVIATIONS = ["א'", "ב'", "ג'", "ד'", "ה'", "ו'", "ש'"];

export const DAY_NAMES = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

export const GENDER_LABELS = {
  male: "בנים",
  female: "בנות",
  mixed: "מעורב",
};

export const ACTIVITY_TYPE_LABELS = {
  annual: "חוג שנתי",
  summer: "קורס קיץ",
};

export const AGE_AUDIENCE_RE = /^גילאי?\s*\d+(?:\.\d+)?\s*[-–]\s*\d+/;
export const GRADE_AUDIENCE_RE = /^כיתות/;

export function isAgeAudience(label) {
  return AGE_AUDIENCE_RE.test(String(label || "").trim());
}

export function isGradeAudience(label) {
  return GRADE_AUDIENCE_RE.test(String(label || "").trim());
}

export function classifyAudienceKind(label) {
  if (isGradeAudience(label)) return "grade";
  if (isAgeAudience(label)) return "age";
  return null;
}

export function defaultAudienceOptionsForType(type) {
  if (type === GROUP_TYPE_SUMMER) return [...DEFAULT_AGE_AUDIENCES];
  return [...DEFAULT_AGE_AUDIENCES, ...DEFAULT_GRADE_AUDIENCES];
}

export function mergeAudienceOptions(type, dbOptions = []) {
  const defaults = defaultAudienceOptionsForType(type);
  const merged = new Set(defaults);
  for (const row of dbOptions) {
    const label = typeof row === "string" ? row : row?.label;
    if (!label) continue;
    if (type === GROUP_TYPE_SUMMER && !isAgeAudience(label)) continue;
    merged.add(label);
  }
  return [...merged].sort((a, b) => a.localeCompare(b, "he"));
}

export function validateCustomAudience(type, label) {
  const trimmed = String(label || "").trim();
  if (!trimmed) return "empty";
  if (type === GROUP_TYPE_SUMMER && !isAgeAudience(trimmed)) return "summerAgeOnly";
  if (type === GROUP_TYPE_ANNUAL && !isAgeAudience(trimmed) && !isGradeAudience(trimmed)) {
    return "invalidAudience";
  }
  return null;
}

export function emptyScheduleSlot(day = 1) {
  return { day, startTime: "16:00", endTime: "16:45" };
}
