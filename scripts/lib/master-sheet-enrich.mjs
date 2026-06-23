/**
 * Auto-fill derived fields, group catalog enrichment, N/A markers.
 */

import {
  MASTER_HEADERS,
  RECORD_TYPES,
  arrayToRow,
  rowToArray,
  participantFullName,
} from "./master-sheet-schema.mjs";
import { birthDateFromAge } from "./sheet-normalize.mjs";

export const NA_MARKER = "-";

const SYSTEM_FIELDS = new Set([
  "מזהה_שורה",
  "סוג_רשומה",
  "מקור_מקורי",
  "פעיל",
  "מוכן_לסנכרון",
  "סונכרן",
  "תאריך_סנכרון",
  "שגיאת_סנכרון",
  "שלמות_נתונים",
  "יש_קונפליקט",
  "פירוט_קונפליקט",
]);

const LEAD_FIELDS = [
  "תאריך_מבדק",
  "שעת_מבדק",
  "נוכחות_מבדק",
  "סטטוס_ליד",
  "מקור_ליד",
  "תוצאת_מבדק",
  "הערות_ליד",
];

const ENROLLMENT_FIELDS = [
  "עונה",
  "שם_קבוצה",
  "ימים",
  "שעת_התחלה",
  "שעת_סיום",
  "מדריך",
  "מתאריך",
  "עד_תאריך",
  "סטטוס_תשלום",
  "תאריך_ביטול",
  "סיבת_ביטול",
];

const PARTICIPANT_FIELDS = [
  "מס_לקוח",
  "טלפון_הורה",
  "שם_פרטי",
  "שם_משפחה",
  "שם_הורה",
  "אימייל",
  "מין",
  "תאריך_לידה",
  "גיל",
  "כיתה",
  "דרגת_לקוח",
  "הערות",
];

const SCHOOL_GRADES = ["גן", "א'", "ב'", "ג'", "ד'", "ה'", "ו'", "ז'", "ח'", "ט'", 'י\'-י"ב'];

const ALL_TYPED = new Set([...LEAD_FIELDS, ...ENROLLMENT_FIELDS]);

function naFieldsForType(type) {
  const na = new Set();
  for (const field of MASTER_HEADERS) {
    if (SYSTEM_FIELDS.has(field) || PARTICIPANT_FIELDS.includes(field)) continue;
    if (!ALL_TYPED.has(field)) continue;
    na.add(field);
  }

  const enable = (fields) => {
    for (const field of fields) na.delete(field);
  };

  switch (type) {
    case RECORD_TYPES.LEAD:
      enable(LEAD_FIELDS);
      break;
    case RECORD_TYPES.ANNUAL_ONCE:
    case RECORD_TYPES.ANNUAL_TWICE:
      enable(ENROLLMENT_FIELDS);
      break;
    case RECORD_TYPES.SUMMER_COURSE:
      enable(ENROLLMENT_FIELDS);
      break;
    default:
      break;
  }

  return na;
}

export function isNaMarker(value) {
  const s = String(value ?? "").trim();
  return s === NA_MARKER || s === "—" || s === "–";
}

export function isBlankSheetCell(value) {
  return !String(value ?? "").trim() || isNaMarker(value);
}

export function sheetCellValue(raw) {
  if (isNaMarker(raw)) return "";
  return String(raw ?? "").trim();
}

function parseIsoDate(raw) {
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
  const month = ref.getMonth();
  if (month >= 8) return new Date(Date.UTC(y, 8, 1, 12));
  return new Date(Date.UTC(y - 1, 8, 1, 12));
}

export function calcAgeFromBirthDate(birthDate, ref = new Date()) {
  const birth = parseIsoDate(birthDate);
  if (!birth) return null;
  const on = ref instanceof Date ? ref : new Date(ref);
  let age = on.getFullYear() - birth.getFullYear();
  const monthDiff = on.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && on.getDate() < birth.getDate())) age -= 1;
  return age >= 0 && age < 120 ? age : null;
}

export function calcGradeFromBirthDate(birthDate, ref = new Date()) {
  const birth = parseIsoDate(birthDate);
  if (!birth) return null;
  const age = calcAgeFromBirthDate(birthDate, ref);
  if (age != null && age >= 19) return "לא רלוונטי";
  const syStart = schoolYearStartDate(ref);
  let schoolAge = syStart.getUTCFullYear() - birth.getUTCFullYear();
  const birthMonth = birth.getUTCMonth();
  const birthDay = birth.getUTCDate();
  if (syStart.getUTCMonth() < birthMonth || (syStart.getUTCMonth() === birthMonth && syStart.getUTCDate() < birthDay)) {
    schoolAge -= 1;
  }
  if (schoolAge < 5) return null;
  if (schoolAge >= 5 && schoolAge <= 14) return SCHOOL_GRADES[schoolAge - 5];
  if (schoolAge >= 15) return 'י\'-י"ב';
  return null;
}

function calcGradeFromAge(age, ref = new Date()) {
  const n = Number(age);
  if (Number.isFinite(n) && n >= 19) return "לא רלוונטי";
  const birth = birthDateFromAge(age, ref);
  return birth ? calcGradeFromBirthDate(birth, ref) : null;
}

function applyDerivedParticipantFields(row) {
  const birth = sheetCellValue(row["תאריך_לידה"]);
  const ageRaw = sheetCellValue(row["גיל"]);

  if (birth) {
    const age = calcAgeFromBirthDate(birth);
    if (age != null) row["גיל"] = String(age);
    const grade = calcGradeFromBirthDate(birth);
    if (grade) row["כיתה"] = grade;
  } else if (ageRaw) {
    const grade = calcGradeFromAge(ageRaw);
    if (grade) row["כיתה"] = grade;
  }
}

function applyLeadAssessmentFields(row) {
  if (row["סוג_רשומה"] !== RECORD_TYPES.LEAD) return;

  const attendance = sheetCellValue(row["נוכחות_מבדק"]);
  const result = sheetCellValue(row["תוצאת_מבדק"]);
  const assessmentDate = parseIsoDate(row["תאריך_מבדק"]);
  const today = new Date();
  today.setHours(12, 0, 0, 0);

  if (attendance === "לא") {
    row["תוצאת_מבדק"] = "לא הגיע";
    return;
  }

  if (assessmentDate && assessmentDate > today && !result) {
    row["תוצאת_מבדק"] = NA_MARKER;
  }
}

function fmtTime(t) {
  if (!t) return "";
  return String(t).slice(0, 5);
}

/**
 * @param {object} row
 * @param {{ byName?: Map, byId?: Map } | null} catalog
 */
export function enrichFromGroupCatalog(row, catalog) {
  if (!catalog?.byName) return row;
  const groupName = sheetCellValue(row["שם_קבוצה"]);
  if (!groupName) return row;

  const group = catalog.byName.get(groupName);
  if (!group) return row;

  if (group.season && isBlankSheetCell(row["עונה"])) row["עונה"] = group.season;
  if (group.daysLabel) row["ימים"] = group.daysLabel;
  if (group.startTime) row["שעת_התחלה"] = fmtTime(group.startTime);
  if (group.endTime) row["שעת_סיום"] = fmtTime(group.endTime);
  if (group.instructor) row["מדריך"] = group.instructor;
  if (group.validFrom && isBlankSheetCell(row["מתאריך"])) row["מתאריך"] = group.validFrom;
  if (group.validUntil && isBlankSheetCell(row["עד_תאריך"])) row["עד_תאריך"] = group.validUntil;

  if (!row["סוג_רשומה"] && group.defaultRecordType) {
    row["סוג_רשומה"] = group.defaultRecordType;
  }

  return row;
}

function applyNaMarkers(row) {
  const type = row["סוג_רשומה"];
  const na = naFieldsForType(type);

  if (row["פעיל"] !== "לא") {
    na.add("תאריך_ביטול");
    na.add("סיבת_ביטול");
  } else {
    na.delete("תאריך_ביטול");
    na.delete("סיבת_ביטול");
  }

  for (const field of na) {
    if (SYSTEM_FIELDS.has(field)) continue;
    row[field] = NA_MARKER;
  }
}

export function enrichMasterRow(row, groupCatalog = null) {
  applyDerivedParticipantFields(row);
  enrichFromGroupCatalog(row, groupCatalog);
  applyLeadAssessmentFields(row);
  applyNaMarkers(row);
  return row;
}

export function enrichMasterRowWithCatalog(row, catalog) {
  return enrichMasterRow(row, catalog);
}

export function enrichMasterRows(rows, groupCatalog = null) {
  return rows.map((row) => enrichMasterRow({ ...row }, groupCatalog));
}

export function buildGroupCatalog(groups, slots = []) {
  const byName = new Map();
  const byId = new Map();
  const slotsByGroup = new Map();

  for (const slot of slots) {
    const gid = slot.groupId || slot["מזהה_קבוצה"];
    if (!gid) continue;
    if (!slotsByGroup.has(gid)) slotsByGroup.set(gid, []);
    slotsByGroup.get(gid).push(slot);
  }

  for (const g of groups) {
    const id = g.id || g["מזהה_קבוצה"];
    const name = g.name || g["שם_קבוצה"];
    const groupSlots = slotsByGroup.get(id) || g.slots || [];
    const daysLabel = groupSlots
      .map((s) => s.day || s["יום"])
      .filter(Boolean)
      .join("+");
    const first = groupSlots[0] || {};
    const enriched = {
      ...g,
      id,
      name,
      daysLabel: g.daysLabel || daysLabel,
      startTime: g.startTime || first.startTime || first["שעת_התחלה"],
      endTime: g.endTime || first.endTime || first["שעת_סיום"],
      instructor: g.instructor || first.instructor || first["מדריך"],
      slotCount: groupSlots.length,
      defaultRecordType: g.defaultRecordType || g["סוג_רשומה_ברירת_מחדל"],
      season: g.season || g["עונה"],
      validFrom: g.validFrom || g["מתאריך"],
      validUntil: g.validUntil || g["עד_תאריך"],
    };
    if (name) byName.set(name, enriched);
    if (id) byId.set(id, enriched);
  }

  return { byName, byId, groups };
}

export function enrichMasterSheetData(sheetRows, groupCatalog = null) {
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
    if (!cells[MASTER_HEADERS.indexOf("מזהה_שורה")] && !cells[MASTER_HEADERS.indexOf("שם_פרטי")]) continue;

    const before = cells.join("\t");
    const row = enrichMasterRow(arrayToRow(cells), groupCatalog);
    const next = rowToArray(row);
    if (next.join("\t") !== before) changed = true;
    out[i] = next;
  }

  if (out[0]?.length) out[0] = MASTER_HEADERS;
  return { rows: out, changed };
}

export function isFieldApplicable(row, field) {
  if (SYSTEM_FIELDS.has(field)) return true;
  const na = naFieldsForType(row["סוג_רשומה"]);
  if (row["פעיל"] !== "לא" && (field === "תאריך_ביטול" || field === "סיבת_ביטול")) {
    return false;
  }
  return !na.has(field);
}

export { participantFullName };
