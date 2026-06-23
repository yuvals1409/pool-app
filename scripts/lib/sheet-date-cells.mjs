import { MASTER_HEADERS, MASTER_TAB } from "./master-sheet-schema.mjs";
import { GROUP_HEADERS, GROUPS_TAB } from "./groups-sheet-schema.mjs";
import { USER_HEADERS, USERS_TAB } from "./users-sheet-schema.mjs";
import { colIdx } from "./sheet-data-validation-helpers.mjs";
import { sheetIdByTitle } from "./google-sheets-client.mjs";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Convert ISO date to dd/mm/yyyy for Google Sheets (he_IL). */
export function isoToSheetDate(iso) {
  const s = String(iso ?? "").trim();
  if (!ISO_DATE.test(s)) return s;
  const [, y, m, d] = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return `${d}/${m}/${y}`;
}

export const MASTER_DATE_FIELDS = new Set([
  "תאריך_לידה", "מתאריך", "עד_תאריך", "תאריך_ביטול", "תאריך_מבדק", "תאריך_סנכרון",
]);

/** Editable — calendar picker via DATE_BETWEEN validation. */
export const MASTER_EDITABLE_DATE_FIELDS = [
  "תאריך_לידה",
  "תאריך_ביטול",
  "תאריך_מבדק",
];

/** Filled by ARRAYFORMULA from קבוצות — date format only. */
export const MASTER_FORMULA_DATE_FIELDS = new Set(["מתאריך", "עד_תאריך"]);

export const GROUP_DATE_FIELDS = new Set(["מתאריך", "עד_תאריך"]);
export const USER_DATE_FIELDS = new Set(["תאריך_לידה", "תאריך_תחילת_העסקה"]);

export function formatRowDates(row, dateFields) {
  const out = { ...row };
  for (const field of dateFields) {
    if (out[field]) out[field] = isoToSheetDate(out[field]);
  }
  return out;
}

export function formatMasterRowsForSheet(rows, { clearFormulaFields = [] } = {}) {
  const clear = new Set(clearFormulaFields);
  return rows.map((row) => {
    let r = formatRowDates(row, MASTER_DATE_FIELDS);
    for (const field of clear) r[field] = "";
    return r;
  });
}

export function formatGroupsRowsForSheet(groupRows) {
  if (!groupRows?.length) return groupRows;
  const header = groupRows[0];
  const daysIdx = header.indexOf("ימים");
  return groupRows.map((line, i) => {
    if (i === 0) return line;
    const row = [...line];
    if (daysIdx >= 0) row[daysIdx] = "";
    for (const field of GROUP_DATE_FIELDS) {
      const idx = header.indexOf(field);
      if (idx >= 0 && row[idx]) row[idx] = isoToSheetDate(row[idx]);
    }
    return row;
  });
}

export function dateFormatRequest(sheetId, headers, fieldNames, startRow = 1, endRow = 2000) {
  const requests = [];
  for (const name of fieldNames) {
    const idx = colIdx(headers, name);
    if (idx == null || sheetId == null) continue;
    requests.push({
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: startRow,
          endRowIndex: endRow,
          startColumnIndex: idx,
          endColumnIndex: idx + 1,
        },
        cell: {
          userEnteredFormat: {
            numberFormat: { type: "DATE", pattern: "dd/mm/yyyy" },
          },
        },
        fields: "userEnteredFormat.numberFormat",
      },
    });
  }
  return requests;
}

export function buildDateFormatRequests(meta) {
  const masterId = sheetIdByTitle(meta, MASTER_TAB);
  const groupsId = sheetIdByTitle(meta, GROUPS_TAB);
  const usersId = sheetIdByTitle(meta, USERS_TAB);

  const masterDateCols = [
    ...MASTER_EDITABLE_DATE_FIELDS,
    ...MASTER_FORMULA_DATE_FIELDS,
    "תאריך_סנכרון",
  ];

  return [
    ...dateFormatRequest(masterId, MASTER_HEADERS, masterDateCols),
    ...dateFormatRequest(groupsId, GROUP_HEADERS, [...GROUP_DATE_FIELDS]),
    ...dateFormatRequest(usersId, USER_HEADERS, [...USER_DATE_FIELDS]),
  ];
}
