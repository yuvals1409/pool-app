/**
 * Google Sheets data validation rules for Master V2 workbook.
 */

import {
  MASTER_HEADERS,
  MASTER_TAB,
} from "./master-sheet-schema.mjs";
import {
  GROUP_HEADERS,
  GROUPS_TAB,
} from "./groups-sheet-schema.mjs";
import {
  USER_HEADERS,
  PAY_RATE_HEADERS,
  USERS_TAB,
  PAY_RATES_TAB,
} from "./users-sheet-schema.mjs";
import {
  LISTS_TAB,
  buildListsTabData,
  listColumnRef,
  headerColLetter,
} from "./sheet-lists-tab.mjs";
import { sheetIdByTitle } from "./google-sheets-client.mjs";
import { colIdx, gridRange } from "./sheet-data-validation-helpers.mjs";
import { MASTER_FORMULA_FIELDS } from "./sheet-master-formulas.mjs";
import { MASTER_EDITABLE_DATE_FIELDS } from "./sheet-date-cells.mjs";

const MAX_ROWS = 2000;

function setValidation(range, rule) {
  if (!range) return null;
  return { setDataValidation: { range, rule } };
}

function listRule(values, strict = true) {
  return {
    condition: {
      type: "ONE_OF_LIST",
      values: values.map((v) => ({ userEnteredValue: String(v) })),
    },
    showCustomUi: true,
    strict,
  };
}

function rangeRule(formula, strict = false) {
  return {
    condition: {
      type: "ONE_OF_RANGE",
      values: [{ userEnteredValue: formula }],
    },
    showCustomUi: true,
    strict,
  };
}

function dateBetweenRule({ strict = true, message } = {}) {
  return {
    condition: {
      type: "DATE_BETWEEN",
      values: [
        { userEnteredValue: "01/01/1900" },
        { userEnteredValue: "31/12/2100" },
      ],
    },
    showCustomUi: true,
    strict,
    inputMessage: message || "לחיצה כפולה על התא → לוח שנה. לא להקליד ידנית.",
  };
}

function customRule(formula, message) {
  return {
    condition: {
      type: "CUSTOM_FORMULA",
      values: [{ userEnteredValue: formula }],
    },
    showCustomUi: true,
    strict: true,
    inputMessage: message,
  };
}

const ENROLL_TYPES = `OR($B2="הרשמה_שנתית_פעם_בשבוע",$B2="הרשמה_שנתית_פעמיים_בשבוע",$B2="קורס_קיץ")`;

function applyTimeCols(requests, sheetId, headers, listsHeaders, colNames) {
  const ref = listRef(listsHeaders, "שעות");
  if (!ref) return;
  for (const name of colNames) {
    const idx = colIdx(headers, name);
    const v = setValidation(gridRange(sheetId, idx), rangeRule(ref, false));
    if (v) requests.push(v);
  }
}

function numberRule(min, max) {
  return {
    condition: {
      type: "NUMBER_BETWEEN",
      values: [{ userEnteredValue: String(min) }, { userEnteredValue: String(max) }],
    },
    showCustomUi: true,
    strict: false,
  };
}

function textFormat(sheetId, colIndex) {
  const range = gridRange(sheetId, colIndex);
  if (!range) return null;
  return {
    repeatCell: {
      range,
      cell: { userEnteredFormat: { numberFormat: { type: "TEXT" } } },
      fields: "userEnteredFormat.numberFormat",
    },
  };
}

function listRef(listsHeaders, listName) {
  const col = headerColLetter(listsHeaders, listName);
  if (!col) return null;
  return listColumnRef(LISTS_TAB, col);
}

function applyListCol(requests, sheetId, headers, listsHeaders, colName, listName, strict = true) {
  const ref = listRef(listsHeaders, listName);
  const idx = colIdx(headers, colName);
  if (ref && idx != null) {
    requests.push(setValidation(gridRange(sheetId, idx), rangeRule(ref, strict)));
  }
}

function applyDateCols(requests, sheetId, headers, colNames) {
  for (const name of colNames) {
    const idx = colIdx(headers, name);
    const v = setValidation(gridRange(sheetId, idx), dateBetweenRule());
    if (v) requests.push(v);
  }
}

function applyMasterTypedDateValidations(requests, masterId) {
  const birthIdx = colIdx(MASTER_HEADERS, "תאריך_לידה");
  const cancelIdx = colIdx(MASTER_HEADERS, "תאריך_ביטול");
  const assessIdx = colIdx(MASTER_HEADERS, "תאריך_מבדק");

  const birthV = setValidation(
    gridRange(masterId, birthIdx),
    dateBetweenRule({ strict: true, message: "לחיצה כפולה → לוח שנה לתאריך לידה." }),
  );
  if (birthV) requests.push(birthV);

  const cancelV = setValidation(
    gridRange(masterId, cancelIdx),
    dateBetweenRule({
      strict: false,
      message: "פעיל=כן → '-'. פעיל=לא → לחיצה כפולה לתאריך ביטול.",
    }),
  );
  if (cancelV) requests.push(cancelV);

  const assessV = setValidation(
    gridRange(masterId, assessIdx),
    dateBetweenRule({
      strict: false,
      message: "ליד → לחיצה כפולה לתאריך מבדק. הרשמה → '-'.",
    }),
  );
  if (assessV) requests.push(assessV);
}

function applyMasterNaValidations(requests, masterId) {
  const notesIdx = colIdx(MASTER_HEADERS, "הערות_ליד");
  const notesV = setValidation(
    gridRange(masterId, notesIdx),
    customRule(`=IF(${ENROLL_TYPES};$AH2="-";TRUE)`, "הרשמה → '-'. ליד → הערות חופשיות."),
  );
  if (notesV) requests.push(notesV);

  const attendanceIdx = colIdx(MASTER_HEADERS, "נוכחות_מבדק");
  const attendanceV = setValidation(
    gridRange(masterId, attendanceIdx),
    customRule(
      `=IF(${ENROLL_TYPES};$AD2="-";OR($AD2="כן";$AD2="לא";$AD2=""))`,
      "הרשמה → '-'. ליד → כן / לא.",
    ),
  );
  if (attendanceV) requests.push(attendanceV);
}

/**
 * @param {object} meta - spreadsheet metadata from getSpreadsheetMetadata
 * @param {{ listsHeaders: string[], groupNames?: string[] }} options
 */
export function buildSheetValidationRequests(meta, { listsHeaders }) {
  const requests = [];
  const lists = { headers: listsHeaders };

  const masterId = sheetIdByTitle(meta, MASTER_TAB);
  const groupsId = sheetIdByTitle(meta, GROUPS_TAB);
  const usersId = sheetIdByTitle(meta, USERS_TAB);
  const payId = sheetIdByTitle(meta, PAY_RATES_TAB);

  // ── מאסטר_סנכרון ─────────────────────────────────────────
  if (masterId != null) {
    applyListCol(requests, masterId, MASTER_HEADERS, lists.headers, "סוג_רשומה", "סוג_רשומה");
    applyListCol(requests, masterId, MASTER_HEADERS, lists.headers, "מקור_מקורי", "מקור_מקורי");
    applyListCol(requests, masterId, MASTER_HEADERS, lists.headers, "מין", "מין");
    applyListCol(requests, masterId, MASTER_HEADERS, lists.headers, "דרגת_לקוח", "דרגת_לקוח");
    applyListCol(requests, masterId, MASTER_HEADERS, lists.headers, "פעיל", "כן_לא");
    applyListCol(requests, masterId, MASTER_HEADERS, lists.headers, "סטטוס_תשלום", "סטטוס_תשלום");
    applyListCol(requests, masterId, MASTER_HEADERS, lists.headers, "סטטוס_ליד", "סטטוס_ליד");
    applyListCol(requests, masterId, MASTER_HEADERS, lists.headers, "מקור_ליד", "מקור_ליד");
    // תוצאת_מבדק — row formula (see sheet-row-formulas.mjs)
    applyListCol(requests, masterId, MASTER_HEADERS, lists.headers, "שלמות_נתונים", "כן_לא");
    applyListCol(requests, masterId, MASTER_HEADERS, lists.headers, "יש_קונפליקט", "כן_לא");
    applyListCol(requests, masterId, MASTER_HEADERS, lists.headers, "מוכן_לסנכרון", "כן_לא");
    applyListCol(requests, masterId, MASTER_HEADERS, lists.headers, "סונכרן", "כן_לא");

    const formulaSkip = new Set(MASTER_FORMULA_FIELDS);

    const groupNameIdx = colIdx(MASTER_HEADERS, "שם_קבוצה");
    if (groupNameIdx != null && groupsId != null) {
      requests.push(setValidation(
        gridRange(masterId, groupNameIdx),
        rangeRule(`='${GROUPS_TAB}'!$B$2:$B$${MAX_ROWS}`),
      ));
    }

    const instructorIdx = colIdx(MASTER_HEADERS, "מדריך");
    const instrRef = listRef(lists.headers, "מדריכים");
    if (instructorIdx != null && instrRef && !formulaSkip.has("מדריך")) {
      requests.push(setValidation(gridRange(masterId, instructorIdx), rangeRule(instrRef, false)));
    }

    applyTimeCols(requests, masterId, MASTER_HEADERS, lists.headers, ["שעת_מבדק"]);
    applyMasterNaValidations(requests, masterId);

    const textCols = ["מזהה_שורה", "מס_לקוח"];
    for (const name of textCols) {
      const fmt = textFormat(masterId, colIdx(MASTER_HEADERS, name));
      if (fmt) requests.push(fmt);
    }
  }

  // ── קבוצות ───────────────────────────────────────────────
  if (groupsId != null) {
    applyListCol(requests, groupsId, GROUP_HEADERS, lists.headers, "סוג", "סוג_קבוצה");
    applyListCol(requests, groupsId, GROUP_HEADERS, lists.headers, "רמה", "רמות", false);
    applyListCol(requests, groupsId, GROUP_HEADERS, lists.headers, "קהל_יעד", "קהל_יעד", false);
    applyListCol(requests, groupsId, GROUP_HEADERS, lists.headers, "מין_קבוצה", "מין_קבוצה");
    applyListCol(requests, groupsId, GROUP_HEADERS, lists.headers, "עונה", "עונות");
    applyListCol(requests, groupsId, GROUP_HEADERS, lists.headers, "סוג_רשומה_ברירת_מחדל", "סוג_רשומה");

    for (const dayCol of ["יום_1", "יום_2"]) {
      applyListCol(requests, groupsId, GROUP_HEADERS, lists.headers, dayCol, "ימים", false);
    }
    for (const instrCol of ["מדריך_1", "מדריך_2"]) {
      const idx = colIdx(GROUP_HEADERS, instrCol);
      const ref = listRef(lists.headers, "מדריכים");
      if (idx != null && ref) {
        requests.push(setValidation(gridRange(groupsId, idx), rangeRule(ref, false)));
      }
    }

    applyTimeCols(requests, groupsId, GROUP_HEADERS, lists.headers, [
      "שעת_התחלה_1", "שעת_סיום_1", "שעת_התחלה_2", "שעת_סיום_2",
    ]);

    const capIdx = colIdx(GROUP_HEADERS, "קיבולת");
    const capV = setValidation(gridRange(groupsId, capIdx), numberRule(0, 200));
    if (capV) requests.push(capV);

    const gidFmt = textFormat(groupsId, colIdx(GROUP_HEADERS, "מזהה_קבוצה"));
    if (gidFmt) requests.push(gidFmt);
  }

  // ── משתמשים ──────────────────────────────────────────────
  if (usersId != null) {
    applyListCol(requests, usersId, USER_HEADERS, lists.headers, "תפקיד", "תפקיד");

    const uidFmt = textFormat(usersId, colIdx(USER_HEADERS, "מזהה_משתמש"));
    if (uidFmt) requests.push(uidFmt);

    const nameIdx = colIdx(USER_HEADERS, "שם_מלא");
    const nameRef = listRef(lists.headers, "מדריכים");
    if (nameIdx != null && nameRef) {
      // allow free text; instructors list is suggestive via same pool
    }
  }

  // ── שכר_מדריכים ──────────────────────────────────────────
  if (payId != null) {
    const userIdIdx = colIdx(PAY_RATE_HEADERS, "מזהה_משתמש");
    if (userIdIdx != null && usersId != null) {
      requests.push(setValidation(
        gridRange(payId, userIdIdx),
        rangeRule(`='${USERS_TAB}'!$A$2:$A$${MAX_ROWS}`, true),
      ));
    }
    applyListCol(requests, payId, PAY_RATE_HEADERS, lists.headers, "סוג_שיעור", "סוג_שיעור");

    const payIdx = colIdx(PAY_RATE_HEADERS, "שכר_לשעה");
    const payV = setValidation(gridRange(payId, payIdx), numberRule(0, 9999));
    if (payV) requests.push(payV);
  }

  return requests.filter(Boolean);
}

/** Date validations applied last so nothing overwrites the calendar picker. */
export function buildDateValidationRequests(meta) {
  const requests = [];
  const masterId = sheetIdByTitle(meta, MASTER_TAB);
  const groupsId = sheetIdByTitle(meta, GROUPS_TAB);
  const usersId = sheetIdByTitle(meta, USERS_TAB);

  if (masterId != null) {
    applyMasterTypedDateValidations(requests, masterId);
  }
  if (groupsId != null) {
    applyDateCols(requests, groupsId, GROUP_HEADERS, ["מתאריך", "עד_תאריך"]);
  }
  if (usersId != null) {
    applyDateCols(requests, usersId, USER_HEADERS, ["תאריך_לידה", "תאריך_תחילת_העסקה"]);
  }
  return requests.filter(Boolean);
}

export function collectInstructorsFromCatalog(catalog) {
  const names = new Set();
  for (const slot of catalog.slots || []) {
    if (slot.instructor) names.add(slot.instructor);
  }
  for (const g of catalog.groups || []) {
    if (g.instructor) names.add(g.instructor);
    for (const s of g.slots || []) {
      if (s.instructor) names.add(s.instructor);
    }
  }
  return [...names];
}

export function collectTimesFromCatalog(catalog) {
  const times = new Set();
  for (const slot of catalog.slots || []) {
    const st = String(slot.startTime || "").slice(0, 5);
    const en = String(slot.endTime || "").slice(0, 5);
    if (st) times.add(st);
    if (en) times.add(en);
  }
  for (const g of catalog.groups || []) {
    for (const s of g.slots || []) {
      const st = String(s.startTime || "").slice(0, 5);
      const en = String(s.endTime || "").slice(0, 5);
      if (st) times.add(st);
      if (en) times.add(en);
    }
  }
  return [...times].sort();
}

export { LISTS_TAB, buildListsTabData };
