/**
 * In-sheet ARRAYFORMULA automation for Master V2 (he_IL locale — semicolons).
 */

import { MASTER_HEADERS, MASTER_TAB } from "./master-sheet-schema.mjs";
import { GROUP_HEADERS, GROUPS_TAB } from "./groups-sheet-schema.mjs";
import { colIdx } from "./sheet-data-validation-helpers.mjs";
import { sheetIdByTitle } from "./google-sheets-client.mjs";

/** Columns auto-filled by formulas — cleared before data upload. */
export const MASTER_FORMULA_FIELDS = [
  "גיל",
  "כיתה",
  "עונה",
  "ימים",
  "שעת_התחלה",
  "שעת_סיום",
  "מדריך",
  "מתאריך",
  "עד_תאריך",
  "תוצאת_מבדק",
];

export const GROUP_FORMULA_FIELDS = ["ימים"];

const G = `'${GROUPS_TAB}'`;

/** VLOOKUP index from column B (שם_קבוצה) in קבוצות!B:R */
const GROUP_VLOOKUP = {
  שעת_התחלה_1: 7,
  שעת_סיום_1: 8,
  מדריך_1: 9,
  ימים: 14,
  עונה: 15,
  מתאריך: 16,
  עד_תאריך: 17,
};

function vlookupGroup(colIndex) {
  return `IF(LEN(P2:P)=0;"-";IFERROR(VLOOKUP(P2:P;${G}!$B:$R;${colIndex};FALSE);"-"))`;
}

function enrollmentOnly(formulaBody) {
  return `IF(B2:B="ליד";"-";${formulaBody})`;
}

const GRADE_BY_AGE = ["גן", "א'", "ב'", "ג'", "ד'", "ה'", "ו'", "ז'", "ח'", "ט'"];

function gradeFormula() {
  const age = "L2:L";
  let inner = '"י\'-י""ב"';
  for (let a = 14; a >= 5; a--) {
    inner = `IF(${age}=${a};"${GRADE_BY_AGE[a - 5]}";${inner})`;
  }
  return `IF(LEN(${age})=0;"";IF(${age}>=19;"לא רלוונטי";IF(${age}<5;"";${inner})))`;
}

export const MASTER_FORMULAS = {
  גיל: `ARRAYFORMULA(IF(LEN(K2:K)=0;"-";DATEDIF(K2:K;TODAY();"Y")))`,
  כיתה: `ARRAYFORMULA(IF(LEN(K2:K)=0;"-";${gradeFormula()}))`,
  עונה: `ARRAYFORMULA(IF(LEN(P2:P)>0;IFERROR(VLOOKUP(P2:P;${G}!$B:$R;${GROUP_VLOOKUP.עונה};FALSE);"-");IF(B2:B="ליד";"קיץ 2026";"-")))`,
  ימים: `ARRAYFORMULA(${enrollmentOnly(vlookupGroup(GROUP_VLOOKUP.ימים))})`,
  שעת_התחלה: `ARRAYFORMULA(${enrollmentOnly(vlookupGroup(GROUP_VLOOKUP.שעת_התחלה_1))})`,
  שעת_סיום: `ARRAYFORMULA(${enrollmentOnly(vlookupGroup(GROUP_VLOOKUP.שעת_סיום_1))})`,
  מדריך: `ARRAYFORMULA(${enrollmentOnly(vlookupGroup(GROUP_VLOOKUP.מדריך_1))})`,
  מתאריך: `ARRAYFORMULA(${enrollmentOnly(vlookupGroup(GROUP_VLOOKUP.מתאריך))})`,
  עד_תאריך: `ARRAYFORMULA(${enrollmentOnly(vlookupGroup(GROUP_VLOOKUP.עד_תאריך))})`,
  תוצאת_מבדק: `ARRAYFORMULA(IF(B2:B<>"ליד";"-";IF(AD2:AD="לא";"לא הגיע";IF(AND(AB2:AB<>"";AB2:AB>TODAY());"-";""))))`,
};

export const GROUPS_FORMULAS = {
  ימים: `ARRAYFORMULA(IF(LEN(G2:G)=0;"";G2:G&IF(LEN(K2:K)=0;"";"+"&K2:K)))`,
};

function formulaCellRequest(sheetId, colIndex, formula) {
  if (sheetId == null || colIndex == null || !formula) return null;
  return {
    updateCells: {
      range: {
        sheetId,
        startRowIndex: 1,
        endRowIndex: 2,
        startColumnIndex: colIndex,
        endColumnIndex: colIndex + 1,
      },
      rows: [{ values: [{ userEnteredValue: { formulaValue: `=${formula}` } }] }],
      fields: "userEnteredValue",
    },
  };
}

export function buildMasterFormulaRequests(meta) {
  const masterId = sheetIdByTitle(meta, MASTER_TAB);
  const requests = [];
  for (const [field, formula] of Object.entries(MASTER_FORMULAS)) {
    const idx = colIdx(MASTER_HEADERS, field);
    const req = formulaCellRequest(masterId, idx, formula);
    if (req) requests.push(req);
  }
  return requests;
}

export function buildGroupsFormulaRequests(meta) {
  const groupsId = sheetIdByTitle(meta, GROUPS_TAB);
  const requests = [];
  for (const [field, formula] of Object.entries(GROUPS_FORMULAS)) {
    const idx = colIdx(GROUP_HEADERS, field);
    const req = formulaCellRequest(groupsId, idx, formula);
    if (req) requests.push(req);
  }
  return requests;
}

export function buildAllFormulaRequests(meta) {
  return [
    ...buildMasterFormulaRequests(meta),
    ...buildGroupsFormulaRequests(meta),
  ];
}
