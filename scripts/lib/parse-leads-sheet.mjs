import { normalizeName, normalizePhone } from "./sheet-normalize.mjs";
import { INCOMING_LEADS_SOURCE_TAB } from "./master-sheet-schema.mjs";

const EXCEL_EPOCH = new Date(Date.UTC(1899, 11, 30));
const DEFAULT_SLOT_TIME = "16:00:00";
const DEFAULT_LEAD_YEAR = 2026;

/** Parse assessment slot date from Excel serial, ISO, or Israeli d/m[/y]. */
export function parseLeadSlotDate(raw, defaultYear = DEFAULT_LEAD_YEAR) {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(raw);
  if (Number.isFinite(n) && n > 0 && n < 100000) {
    const d = new Date(EXCEL_EPOCH.getTime() + n * 86400000);
    return d.toISOString().slice(0, 10);
  }
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (m) return `${defaultYear}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

function parseAge(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0 || n >= 120) return null;
  return Math.round(n);
}

/**
 * Parse leads from workbook — prefers tab "מבדק שחיה 2026" (columns A–F).
 * @param {Record<string, Map<number, Record<number, string>>>} sheets
 */
function resolveLeadsSourceSheetName(sheets) {
  if (sheets[INCOMING_LEADS_SOURCE_TAB]) return INCOMING_LEADS_SOURCE_TAB;
  const match = Object.keys(sheets).find((name) => name.includes(INCOMING_LEADS_SOURCE_TAB));
  return match || Object.keys(sheets)[0];
}

export function parseLeadsFromWorkbook(sheets) {
  const sheetName = resolveLeadsSourceSheetName(sheets);
  const rows = sheets[sheetName];
  if (!rows) return [];

  const leads = [];
  const maxRow = Math.max(...rows.keys(), 0);

  for (let r = 2; r <= maxRow; r++) {
    const cells = rows.get(r) || {};
    const slotDate = parseLeadSlotDate(cells[0]);
    const phone = normalizePhone(cells[5]);
    if (!slotDate || !phone) continue;

    const childName = normalizeName(cells[1]);
    const parentName = normalizeName(cells[4]);
    const age = parseAge(cells[2]);

    leads.push({
      slotDate,
      slotTime: DEFAULT_SLOT_TIME,
      childName: childName || (parentName ? `${parentName} (מבדק)` : `מבדק שורה ${r}`),
      parentName: parentName || null,
      phone,
      age,
      sourceRow: r,
    });
  }

  return leads;
}

/**
 * Parse rows from IMPORTRANGE / incoming leads tab (array of arrays).
 */
export function parseIncomingLeadRows(rows) {
  if (!rows?.length) return [];
  const header = rows[0].map((h) => String(h).trim().toLowerCase());
  const dateIdx = header.findIndex((h) => h.includes("תאריך") || h === "a" || h.includes("date"));
  const childIdx = header.findIndex((h) => h.includes("ילד") || (h.includes("שם") && !h.includes("הורה")));
  const ageIdx = header.findIndex((h) => h.includes("גיל") || h.includes("age"));
  const parentIdx = header.findIndex((h) => h.includes("הורה") || h.includes("parent"));
  const phoneIdx = header.findIndex((h) => h.includes("טלפון") || h.includes("phone"));

  const leads = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row?.length) continue;
    const get = (idx, fallback) => (idx >= 0 ? row[idx] : row[fallback]);
    const slotDate = parseLeadSlotDate(get(dateIdx, 0));
    const phone = normalizePhone(get(phoneIdx, 5));
    if (!slotDate || !phone) continue;
    const childName = normalizeName(get(childIdx, 1));
    const parentName = normalizeName(get(parentIdx, 4));
    const age = parseAge(get(ageIdx, 2));
    leads.push({
      slotDate,
      slotTime: DEFAULT_SLOT_TIME,
      childName: childName || (parentName ? `${parentName} (מבדק)` : `מבדק שורה ${i + 1}`),
      parentName,
      phone,
      age,
      sourceRow: i + 1,
    });
  }
  return leads;
}
