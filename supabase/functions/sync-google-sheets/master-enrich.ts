/** Deno port of scripts/lib/master-sheet-enrich.mjs (V2) */

export const NA_MARKER = "-";

const SYSTEM_FIELDS = new Set([
  "מזהה_שורה", "סוג_רשומה", "מקור_מקורי", "פעיל", "מוכן_לסנכרון", "סונכרן",
  "תאריך_סנכרון", "שגיאת_סנכרון", "שלמות_נתונים", "יש_קונפליקט", "פירוט_קונפליקט",
]);

const RECORD_TYPES = {
  LEAD: "ליד",
  ANNUAL_ONCE: "הרשמה_שנתית_פעם_בשבוע",
  ANNUAL_TWICE: "הרשמה_שנתית_פעמיים_בשבוע",
  SUMMER_COURSE: "קורס_קיץ",
};

export const MASTER_HEADERS = [
  "מזהה_שורה", "סוג_רשומה", "מקור_מקורי", "מס_לקוח", "טלפון_הורה", "שם_פרטי", "שם_משפחה",
  "שם_הורה", "אימייל", "מין", "תאריך_לידה", "גיל", "כיתה", "דרגת_לקוח", "עונה", "שם_קבוצה",
  "ימים", "שעת_התחלה", "שעת_סיום", "מדריך", "מתאריך", "עד_תאריך", "פעיל", "תאריך_ביטול",
  "סיבת_ביטול", "סטטוס_תשלום", "הערות", "תאריך_מבדק", "שעת_מבדק", "נוכחות_מבדק", "סטטוס_ליד",
  "מקור_ליד", "תוצאת_מבדק", "הערות_ליד", "שלמות_נתונים", "יש_קונפליקט", "פירוט_קונפליקט",
  "מוכן_לסנכרון", "סונכרן", "תאריך_סנכרון", "שגיאת_סנכרון",
];

const LEAD_FIELDS = [
  "תאריך_מבדק", "שעת_מבדק", "נוכחות_מבדק", "סטטוס_ליד", "מקור_ליד", "תוצאת_מבדק", "הערות_ליד",
];
const ENROLLMENT_FIELDS = [
  "עונה", "שם_קבוצה", "ימים", "שעת_התחלה", "שעת_סיום", "מדריך", "מתאריך", "עד_תאריך",
  "סטטוס_תשלום", "תאריך_ביטול", "סיבת_ביטול",
];
const PARTICIPANT_FIELDS = [
  "מס_לקוח", "טלפון_הורה", "שם_פרטי", "שם_משפחה", "שם_הורה", "אימייל", "מין",
  "תאריך_לידה", "גיל", "כיתה", "דרגת_לקוח", "הערות",
];
const SCHOOL_GRADES = ["גן", "א'", "ב'", "ג'", "ד'", "ה'", "ו'", "ז'", "ח'", "ט'", 'י\'-י"ב'];
const ALL_TYPED = new Set([...LEAD_FIELDS, ...ENROLLMENT_FIELDS]);

function naFieldsForType(type: string) {
  const na = new Set<string>();
  for (const field of MASTER_HEADERS) {
    if (SYSTEM_FIELDS.has(field) || PARTICIPANT_FIELDS.includes(field)) continue;
    if (!ALL_TYPED.has(field)) continue;
    na.add(field);
  }
  const enable = (fields: string[]) => { for (const f of fields) na.delete(f); };
  switch (type) {
    case RECORD_TYPES.LEAD: enable(LEAD_FIELDS); break;
    case RECORD_TYPES.ANNUAL_ONCE:
    case RECORD_TYPES.ANNUAL_TWICE:
    case RECORD_TYPES.SUMMER_COURSE:
      enable(ENROLLMENT_FIELDS);
      break;
  }
  return na;
}

export function isNaMarker(value: string) {
  const s = String(value ?? "").trim();
  return s === NA_MARKER || s === "—" || s === "–";
}

export function sheetCellValue(raw: string) {
  if (isNaMarker(raw)) return "";
  return String(raw ?? "").trim();
}

export function participantFullName(row: Record<string, string>) {
  const first = String(row["שם_פרטי"] ?? "").trim();
  const last = String(row["שם_משפחה"] ?? "").trim();
  if (first || last) return `${first} ${last}`.trim();
  return String(row["שם_ילד"] ?? "").trim();
}

export function splitFullName(fullName: string) {
  const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { first: "", last: "" };
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

function parseIsoDate(raw: string) {
  const s = sheetCellValue(raw);
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(`${s}T12:00:00`);
  const m = s.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/);
  if (m) {
    const year = m[3] ? Number(m[3]) : new Date().getFullYear();
    return new Date(Date.UTC(year, Number(m[2]) - 1, Number(m[1]), 12));
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function schoolYearStartDate(ref = new Date()) {
  const y = ref.getFullYear();
  return ref.getMonth() >= 8 ? new Date(Date.UTC(y, 8, 1, 12)) : new Date(Date.UTC(y - 1, 8, 1, 12));
}

function calcAgeFromBirthDate(birthDate: string, ref = new Date()) {
  const birth = parseIsoDate(birthDate);
  if (!birth) return null;
  let age = ref.getFullYear() - birth.getFullYear();
  const md = ref.getMonth() - birth.getMonth();
  if (md < 0 || (md === 0 && ref.getDate() < birth.getDate())) age -= 1;
  return age >= 0 && age < 120 ? age : null;
}

function calcGradeFromBirthDate(birthDate: string, ref = new Date()) {
  const birth = parseIsoDate(birthDate);
  if (!birth) return null;
  const age = calcAgeFromBirthDate(birthDate, ref);
  if (age != null && age >= 19) return "לא רלוונטי";
  const syStart = schoolYearStartDate(ref);
  let schoolAge = syStart.getUTCFullYear() - birth.getUTCFullYear();
  if (syStart.getUTCMonth() < birth.getUTCMonth() || (syStart.getUTCMonth() === birth.getUTCMonth() && syStart.getUTCDate() < birth.getUTCDate())) schoolAge -= 1;
  if (schoolAge < 5) return null;
  if (schoolAge >= 5 && schoolAge <= 14) return SCHOOL_GRADES[schoolAge - 5];
  if (schoolAge >= 15) return 'י\'-י"ב';
  return null;
}

function birthDateFromAge(age: string, ref = new Date()) {
  const n = Number(age);
  if (!Number.isFinite(n) || n <= 0 || n >= 120) return null;
  const d = new Date(ref);
  d.setFullYear(d.getFullYear() - Math.round(n));
  return d.toISOString().slice(0, 10);
}

function arrayToRow(cells: string[]) {
  const row: Record<string, string> = {};
  MASTER_HEADERS.forEach((h, i) => { row[h] = String(cells[i] ?? "").trim(); });
  return row;
}

function rowToArray(row: Record<string, string>) {
  return MASTER_HEADERS.map((h) => String(row[h] ?? ""));
}

function applyLeadAssessmentFields(row: Record<string, string>) {
  if (row["סוג_רשומה"] !== RECORD_TYPES.LEAD) return;
  if (row["נוכחות_מבדק"] === "לא") {
    row["תוצאת_מבדק"] = "לא הגיע";
    return;
  }
  const assessmentDate = parseIsoDate(row["תאריך_מבדק"]);
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  if (assessmentDate && assessmentDate > today && !sheetCellValue(row["תוצאת_מבדק"])) {
    row["תוצאת_מבדק"] = NA_MARKER;
  }
}

export function enrichMasterRow(row: Record<string, string>) {
  const birth = sheetCellValue(row["תאריך_לידה"]);
  const ageRaw = sheetCellValue(row["גיל"]);
  if (birth) {
    const age = calcAgeFromBirthDate(birth);
    if (age != null) row["גיל"] = String(age);
    const grade = calcGradeFromBirthDate(birth);
    if (grade) row["כיתה"] = grade;
  } else if (ageRaw) {
    const approxBirth = birthDateFromAge(ageRaw);
    if (approxBirth) {
      const grade = calcGradeFromBirthDate(approxBirth);
      if (grade) row["כיתה"] = grade;
    }
  }

  applyLeadAssessmentFields(row);

  const na = naFieldsForType(row["סוג_רשומה"]);
  if (row["פעיל"] !== "לא") {
    na.add("תאריך_ביטול");
    na.add("סיבת_ביטול");
  }
  for (const field of na) {
    if (!SYSTEM_FIELDS.has(field)) row[field] = NA_MARKER;
  }
  return row;
}

export function enrichMasterSheetData(sheetRows: string[][]) {
  if (!sheetRows?.length) return { rows: sheetRows, changed: false };
  const header = sheetRows[0].map((h) => String(h).trim());
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  const out = sheetRows.map((line) => [...line]);
  let changed = false;
  for (let i = 1; i < out.length; i++) {
    const line = out[i];
    if (!line?.length) continue;
    const cells = MASTER_HEADERS.map((h) => {
      const col = idx[h];
      return col != null ? String(line[col] ?? "").trim() : "";
    });
    if (!cells[0] && !cells[5]) continue;
    const before = cells.join("\t");
    const next = rowToArray(enrichMasterRow(arrayToRow(cells)));
    if (next.join("\t") !== before) changed = true;
    out[i] = next;
  }
  if (out[0]?.length) out[0] = MASTER_HEADERS;
  return { rows: out, changed };
}
