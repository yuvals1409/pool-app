import {
  isBlankSheetCell,
  isFieldApplicable,
  enrichMasterRow,
  enrichMasterRows,
  enrichMasterRowWithCatalog,
} from "./master-sheet-enrich.mjs";

export { GROUPS_TAB, GROUP_SLOTS_TAB } from "./groups-sheet-schema.mjs";
export { USERS_TAB, PAY_RATES_TAB } from "./users-sheet-schema.mjs";

export const MASTER_TAB = "מאסטר_סנכרון";
export const INCOMING_LEADS_TAB = "לידים_נכנסים";
export const INCOMING_LEADS_SOURCE_TAB = "מבדק שחיה 2026";
export const CONFLICTS_TAB = "קונפליקטים";
export const CONFIG_TAB = "הגדרות";
export const GUIDE_TAB = "מדריך";

export function buildIncomingLeadsImportFormula(leadsSpreadsheetId, sourceTab = INCOMING_LEADS_SOURCE_TAB) {
  const id = String(leadsSpreadsheetId || "").trim();
  if (!id) return "";
  const range = `'${sourceTab}'!A:Z`;
  return `=IMPORTRANGE("${id}","${range}")`;
}

export const RECORD_TYPES = {
  LEAD: "ליד",
  ANNUAL_ONCE: "הרשמה_שנתית_פעם_בשבוע",
  ANNUAL_TWICE: "הרשמה_שנתית_פעמיים_בשבוע",
  SUMMER_COURSE: "קורס_קיץ",
};

export const ENROLLMENT_RECORD_TYPES = [
  RECORD_TYPES.ANNUAL_ONCE,
  RECORD_TYPES.ANNUAL_TWICE,
  RECORD_TYPES.SUMMER_COURSE,
];

export const ORIGINAL_SOURCES = ["לידים", "שנתי", "קיץ", "tc_leads", "ידני", "מערכת"];

export const MEMBERSHIP_TIERS = ["חיצוני", "מנוי", "בעל_מניות"];
export const PAYMENT_STATUS_LABELS = ["שולם", "לא שולם", "פטור"];
export const GENDER_LABELS = ["זכר", "נקבה"];
export const ASSESSMENT_ATTENDANCE = ["כן", "לא"];
export const ASSESSMENT_RESULTS = ["עבר", "נכשל", "ממתין", "לא הגיע"];

export const LEAD_STATUSES = [
  "new",
  "call",
  "registered_assessment",
  "passed",
  "registered_class",
  "abandoned",
];

export const LEAD_SOURCES = ["tc_leads", "website", "facebook", "recommendation", "import"];

export const YES_NO = ["כן", "לא"];

export const MASTER_HEADERS = [
  "מזהה_שורה",
  "סוג_רשומה",
  "מקור_מקורי",
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
  "עונה",
  "שם_קבוצה",
  "ימים",
  "שעת_התחלה",
  "שעת_סיום",
  "מדריך",
  "מתאריך",
  "עד_תאריך",
  "פעיל",
  "תאריך_ביטול",
  "סיבת_ביטול",
  "סטטוס_תשלום",
  "הערות",
  "תאריך_מבדק",
  "שעת_מבדק",
  "נוכחות_מבדק",
  "סטטוס_ליד",
  "מקור_ליד",
  "תוצאת_מבדק",
  "הערות_ליד",
  "שלמות_נתונים",
  "יש_קונפליקט",
  "פירוט_קונפליקט",
  "מוכן_לסנכרון",
  "סונכרן",
  "תאריך_סנכרון",
  "שגיאת_סנכרון",
];

export const HEADER_INDEX = Object.fromEntries(MASTER_HEADERS.map((h, i) => [h, i]));

const REQUIRED_BY_TYPE = {
  [RECORD_TYPES.LEAD]: ["טלפון_הורה", "שם_פרטי", "תאריך_מבדק"],
  [RECORD_TYPES.ANNUAL_ONCE]: [
    "טלפון_הורה", "שם_פרטי", "מין", "עונה", "שם_קבוצה",
    "שעת_התחלה", "מדריך", "מתאריך", "עד_תאריך", "פעיל", "סטטוס_תשלום",
  ],
  [RECORD_TYPES.ANNUAL_TWICE]: [
    "טלפון_הורה", "שם_פרטי", "מין", "עונה", "שם_קבוצה",
    "שעת_התחלה", "מדריך", "מתאריך", "עד_תאריך", "פעיל", "סטטוס_תשלום",
  ],
  [RECORD_TYPES.SUMMER_COURSE]: [
    "טלפון_הורה", "שם_פרטי", "מין", "עונה", "שם_קבוצה",
    "ימים", "שעת_התחלה", "מדריך", "מתאריך", "עד_תאריך", "פעיל", "סטטוס_תשלום",
  ],
};

export function splitFullName(fullName) {
  const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { first: "", last: "" };
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

export function participantFullName(row) {
  const first = String(row["שם_פרטי"] ?? "").trim();
  const last = String(row["שם_משפחה"] ?? "").trim();
  if (first || last) return `${first} ${last}`.trim();
  return String(row["שם_ילד"] ?? "").trim();
}

export function emptyMasterRow(rowId) {
  const row = Object.fromEntries(MASTER_HEADERS.map((h) => [h, ""]));
  row["מזהה_שורה"] = rowId;
  row["פעיל"] = "כן";
  row["מוכן_לסנכרון"] = "לא";
  row["סונכרן"] = "לא";
  row["שלמות_נתונים"] = "לא";
  row["יש_קונפליקט"] = "לא";
  return row;
}

export function rowToArray(row) {
  return MASTER_HEADERS.map((h) => String(row[h] ?? ""));
}

export function arrayToRow(cells) {
  const row = {};
  MASTER_HEADERS.forEach((h, i) => {
    row[h] = String(cells[i] ?? "").trim();
  });
  return row;
}

export function genderToSheet(gender) {
  if (gender === "male") return "זכר";
  if (gender === "female") return "נקבה";
  if (gender === "ז" || gender === "זכר") return "זכר";
  if (gender === "נ" || gender === "נקבה") return "נקבה";
  return "";
}

export function genderFromSheet(label) {
  const s = String(label ?? "").trim();
  if (/זכר|^ז$/i.test(s)) return "male";
  if (/נקבה|^נ$/i.test(s)) return "female";
  return null;
}

export function membershipToSheet(tier, isShareholder) {
  if (isShareholder) return "בעל_מניות";
  if (tier === "subscriber") return "מנוי";
  return "חיצוני";
}

export function membershipFromSheet(label) {
  const s = String(label ?? "").trim();
  if (/בעל|מניות|shareholder/i.test(s)) return { tier: "external", isShareholder: true };
  if (/מנוי|subscriber/i.test(s)) return { tier: "subscriber", isShareholder: false };
  return { tier: "external", isShareholder: false };
}

export function paymentStatusToSheet(status) {
  if (status === "paid") return "שולם";
  if (status === "waived") return "פטור";
  return "לא שולם";
}

export function isEnrollmentType(type) {
  return ENROLLMENT_RECORD_TYPES.includes(type);
}

export function isRowComplete(row) {
  const type = row["סוג_רשומה"];
  const required = REQUIRED_BY_TYPE[type] || [];
  const hasAgeOrBirth = !isBlankSheetCell(row["גיל"]) || !isBlankSheetCell(row["תאריך_לידה"]);
  for (const field of required) {
    if (!isFieldApplicable(row, field)) continue;
    if (isBlankSheetCell(row[field])) return false;
  }
  if (type === RECORD_TYPES.LEAD && !hasAgeOrBirth) {
    // age optional for leads
  }
  if (isEnrollmentType(type) && !hasAgeOrBirth && isBlankSheetCell(row["מין"])) return false;
  return true;
}

export function computeCompleteness(row) {
  return isRowComplete(row) ? "כן" : "לא";
}

export function leadDedupKey(row) {
  return `${row["טלפון_הורה"]}|${row["תאריך_מבדק"]}|${participantFullName(row)}`.toLowerCase();
}

export function participantDedupKey(row) {
  const clientId = String(row["מס_לקוח"] ?? "").trim().replace(/^'/, "");
  if (clientId) return `client:${clientId}`;
  return `phone:${row["טלפון_הורה"]}|${participantFullName(row)}`.toLowerCase();
}

export function detectConflicts(rows) {
  const byKey = new Map();
  const conflicts = new Map();
  const compareFields = ["מס_לקוח", "טלפון_הורה", "שם_פרטי", "שם_משפחה", "שם_הורה", "מין"];

  for (const row of rows) {
    const key = participantDedupKey(row);
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(row);
  }

  for (const [, group] of byKey) {
    if (group.length < 2) continue;
    const issues = [];
    for (const field of compareFields) {
      const values = [...new Set(group.map((r) => String(r[field] ?? "").trim()).filter(Boolean))];
      if (values.length > 1) issues.push(`${field}: ${values.join(" / ")}`);
    }
    if (issues.length) conflicts.set(participantDedupKey(group[0]), issues);
  }

  return conflicts;
}

export function applyConflictFlags(rows, groupCatalog = null) {
  const enriched = enrichMasterRows(rows, groupCatalog);
  const conflicts = detectConflicts(enriched);
  for (const row of enriched) {
    const key = participantDedupKey(row);
    const issues = conflicts.get(key);
    if (issues?.length) {
      row["יש_קונפליקט"] = "כן";
      row["פירוט_קונפליקט"] = issues.join("; ");
    } else {
      row["יש_קונפליקט"] = "לא";
      row["פירוט_קונפליקט"] = "";
    }
    row["שלמות_נתונים"] = computeCompleteness(row);
  }
  return enriched;
}

export const GUIDE_CONTENT = [
  ["מדריך — מאסטר V2 Stream Line"],
  [""],
  ["לפני מאסטר: ערכו קבוצות ומשתמשים. לו״ז שבועי ומשבצות מתעדכנים אוטומטית."],
  ["טאב «לו״ז קבוצות שבועי» — תצוגה ויזואלית לפי יום ושעה; קבוצות מקבילות בשורות נפרדות, צבע לפי מדריך (לא לעריכה)."],
  ["במאסטר: בוחרים שם_קבוצה מהרשימה — ימים, שעות ומדריך מתמלאים אוטומטית."],
  ['תא עם "-" = לא רלוונטי — אין למלא.'],
  ["גיל וכיתה מתמלאים מתאריך לידה; מגיל 19 כיתה = לא רלוונטי."],
  ["תאריכים: לחיצה כפולה על התא → נפתח לוח שנה (לא הקלדה חופשית)."],
  ["נוכחות_מבדק=לא → תוצאת_מבדק=לא הגיע (אוטומטי)."],
  ["תאריך מבדק עתידי → תוצאת_מבדק=\"-\" עד אחרי המבדק."],
  ["מס_לקוח — תמיד טקסט (מניעת scientific notation)."],
  [""],
  ["צ'קליסט לפני מוכן_לסנכרון_כללי (טאב הגדרות):"],
  ["□ קבוצות תקינות (יום_1, שעות, מדריך)"],
  ["□ קונפליקטים נפתרו"],
  ["□ טלפונים 05XXXXXXXX"],
  ["□ ביטולים: פעיל=לא"],
  ["□ שורות רלוונטיות מוכן_לסנכרון=כן"],
];
