/**
 * Per-row formulas (auto-filled down) for mixed editable / auto fields.
 * he_IL locale — semicolons in formula bodies.
 */

import { MASTER_HEADERS, MASTER_TAB } from "./master-sheet-schema.mjs";
import { colIdx } from "./sheet-data-validation-helpers.mjs";
import { sheetIdByTitle } from "./google-sheets-client.mjs";

/** Cleared on data upload — values come from the row formula after apply. */
export const MASTER_ROW_FORMULA_FIELDS = ["תוצאת_מבדק"];

export const MASTER_ROW_FORMULAS = {
  תוצאת_מבדק:
    "=IF($B2<>\"ליד\";\"-\";IF($AD2=\"לא\";\"לא הגיע\";IF(AND($AB2<>\"\";$AB2>TODAY());\"-\";\"\")))",
};

const DEFAULT_FILL_ROWS = 1999;

function rowFormulaSeedRequest(sheetId, colIndex, formula) {
  return {
    updateCells: {
      range: {
        sheetId,
        startRowIndex: 1,
        endRowIndex: 2,
        startColumnIndex: colIndex,
        endColumnIndex: colIndex + 1,
      },
      rows: [{ values: [{ userEnteredValue: { formulaValue: formula } }] }],
      fields: "userEnteredValue",
    },
  };
}

function rowFormulaAutoFillRequest(sheetId, colIndex, fillLength = DEFAULT_FILL_ROWS) {
  return {
    autoFill: {
      sourceAndDestination: {
        source: {
          sheetId,
          startRowIndex: 1,
          endRowIndex: 2,
          startColumnIndex: colIndex,
          endColumnIndex: colIndex + 1,
        },
        dimension: "ROWS",
        fillLength,
      },
      useAlternateSeries: false,
    },
  };
}

export function buildMasterRowFormulaRequests(meta, { fillRows = DEFAULT_FILL_ROWS } = {}) {
  const sheetId = sheetIdByTitle(meta, MASTER_TAB);
  const requests = [];
  for (const [field, formula] of Object.entries(MASTER_ROW_FORMULAS)) {
    const col = colIdx(MASTER_HEADERS, field);
    if (col == null || sheetId == null) continue;
    requests.push(rowFormulaSeedRequest(sheetId, col, formula));
    requests.push(rowFormulaAutoFillRequest(sheetId, col, fillRows));
  }
  return requests;
}
