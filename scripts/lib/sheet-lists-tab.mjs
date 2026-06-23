import {
  ORIGINAL_SOURCES,
  MEMBERSHIP_TIERS,
  PAYMENT_STATUS_LABELS,
  GENDER_LABELS,
  ASSESSMENT_ATTENDANCE,
  ASSESSMENT_RESULTS,
  LEAD_STATUSES,
  LEAD_SOURCES,
  YES_NO,
  RECORD_TYPES,
} from "./master-sheet-schema.mjs";
import { GROUP_TYPES, GROUP_GENDERS } from "./groups-sheet-schema.mjs";
import { USER_ROLES, PAY_TEMPLATE_CODES } from "./users-sheet-schema.mjs";

export const LISTS_TAB = "רשימות";

export const DAY_NAMES_HE = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
export const SEASONS = ["2025/26", "קיץ 2026"];
export const TARGET_AUDIENCES = ["קטנים", "גדולים", "מתקדמים", "שיפור סגנון", "מבוגרים", "קיץ"];
export const LEVELS = Array.from({ length: 10 }, (_, i) => String(i + 1));
export const SCHOOL_GRADES = ["גן", "א'", "ב'", "ג'", "ד'", "ה'", "ו'", "ז'", "ח'", "ט'", 'י\'-י"ב', "לא רלוונטי"];

export const RECORD_TYPE_LIST = [
  RECORD_TYPES.LEAD,
  RECORD_TYPES.ANNUAL_ONCE,
  RECORD_TYPES.ANNUAL_TWICE,
  RECORD_TYPES.SUMMER_COURSE,
];

/** Build hidden helper tab: each column is a named list (row 1 = header). */
export function buildListsTabData({ instructors = [], times = [] } = {}) {
  const cols = {
    עונות: SEASONS,
    ימים: DAY_NAMES_HE,
    סוג_קבוצה: GROUP_TYPES,
    מין_קבוצה: GROUP_GENDERS,
    קהל_יעד: TARGET_AUDIENCES,
    רמות: LEVELS,
    סוג_רשומה: RECORD_TYPE_LIST,
    מקור_מקורי: ORIGINAL_SOURCES,
    מין: GENDER_LABELS,
    דרגת_לקוח: MEMBERSHIP_TIERS,
    סטטוס_תשלום: PAYMENT_STATUS_LABELS,
    כן_לא: YES_NO,
    נוכחות_מבדק: ASSESSMENT_ATTENDANCE,
    תוצאת_מבדק: ASSESSMENT_RESULTS,
    סטטוס_ליד: LEAD_STATUSES,
    מקור_ליד: LEAD_SOURCES,
    תפקיד: USER_ROLES,
    סוג_שיעור: PAY_TEMPLATE_CODES,
    כיתה: SCHOOL_GRADES,
    מדריכים: [...new Set(instructors.filter(Boolean))].sort(),
    שעות: [...new Set(times.filter(Boolean))].sort(),
  };

  const headers = Object.keys(cols);
  const maxLen = Math.max(...Object.values(cols).map((c) => c.length), 1);
  const rows = [headers];
  for (let i = 0; i < maxLen; i++) {
    rows.push(headers.map((h) => cols[h][i] ?? ""));
  }
  return { rows, cols };
}

export function listColumnRef(tab, colLetter, lastRow = 500) {
  return `='${tab}'!$${colLetter}$2:$${colLetter}$${lastRow}`;
}

export function headerColLetter(headers, name) {
  const idx = headers.indexOf(name);
  if (idx < 0) return null;
  let n = idx;
  let s = "";
  while (n >= 0) {
    s = String.fromCharCode((n % 26) + 65) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}
