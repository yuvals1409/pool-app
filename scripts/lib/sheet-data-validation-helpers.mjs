export const MAX_SHEET_ROWS = 2000;

export function colIdx(headers, name) {
  const i = headers.indexOf(name);
  return i >= 0 ? i : null;
}

export function gridRange(sheetId, colIndex, startRow = 1, endRow = MAX_SHEET_ROWS) {
  if (sheetId == null || colIndex == null) return null;
  return {
    sheetId,
    startRowIndex: startRow,
    endRowIndex: endRow,
    startColumnIndex: colIndex,
    endColumnIndex: colIndex + 1,
  };
}
