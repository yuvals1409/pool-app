/**
 * Weekly visual schedule tab — auto-updates from קבוצות via formulas.
 * Parallel groups get separate sub-rows; colors follow instructor (conditional format).
 */

import { GROUPS_TAB } from "./groups-sheet-schema.mjs";
import { colLetter } from "./sheet-column-letters.mjs";
import { sheetIdByTitle } from "./google-sheets-client.mjs";
import {
  instructorColorForName,
  instructorTextColorForName,
  noInstructorColors,
} from "./instructor-colors.mjs";

export const WEEKLY_SCHEDULE_TAB = "לו״ז קבוצות שבועי";

export const SCHEDULE_DAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

/** Max simultaneous groups shown per day/time block. */
export const PARALLEL_ROWS = 4;

const G = `'${GROUPS_TAB}'`;
const DATA_START = 2;
const DATA_END = 500;
const ROW_TITLE = 1;
const ROW_LEGEND = 2;
const ROW_HEADER = 3;
const FIRST_TIME_ROW = 4;

/** @deprecated use instructorColorForName */
export function instructorColor(index) {
  return instructorColorForName(String(index));
}

export function collectInstructorsFromGroupsSheet(rows) {
  if (!rows?.length) return [];
  const hdr = rows[0];
  const i1 = hdr.indexOf("מדריך_1");
  const i2 = hdr.indexOf("מדריך_2");
  const names = new Set();
  for (const r of rows.slice(1)) {
    if (i1 >= 0 && r[i1]?.trim()) names.add(r[i1].trim());
    if (i2 >= 0 && r[i2]?.trim()) names.add(r[i2].trim());
  }
  return [...names].sort((a, b) => a.localeCompare(b, "he"));
}

function escapeSheetString(value) {
  return String(value).replace(/"/g, '""');
}

/** Generate HH:MM slots every `stepMin` minutes. */
export function generateTimeSlots(from = "07:00", to = "21:00", stepMin = 15) {
  const parse = (s) => {
    const [h, m] = s.split(":").map(Number);
    return h * 60 + m;
  };
  const fmt = (mins) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  };
  const out = [];
  for (let t = parse(from); t <= parse(to); t += stepMin) {
    out.push(fmt(t));
  }
  return out;
}

function cardLabel(startCol, endCol, instrCol) {
  return [
    `${G}!$B$${DATA_START}:$B$${DATA_END}`,
    `&CHAR(10)&TEXT(${G}!$${startCol}$${DATA_START}:$${startCol}$${DATA_END};"HH:MM")`,
    `&" – "&TEXT(${G}!$${endCol}$${DATA_START}:$${endCol}$${DATA_END};"HH:MM")`,
    `&CHAR(10)&"מדריך: "&${G}!$${instrCol}$${DATA_START}:$${instrCol}$${DATA_END}`,
    `&"  ·  רמה "&${G}!$D$${DATA_START}:$D$${DATA_END}`,
  ].join("");
}

function slotMatch(dayCol, startCol, dayRef, timeRef) {
  return [
    `(${G}!$${dayCol}$${DATA_START}:$${dayCol}$${DATA_END}=${dayRef})*`,
    `(TEXT(${G}!$${startCol}$${DATA_START}:$${startCol}$${DATA_END};"HH:MM")=TEXT(${timeRef};"HH:MM"))`,
  ].join("");
}

/** Nth matching group at day/time (1-based index); time anchored to first sub-row of block. */
function scheduleCellFormula(dayColLetter, timeAnchorRow, index) {
  const dayRef = `${dayColLetter}$${ROW_HEADER}`;
  const timeRef = `$A${timeAnchorRow}`;
  const l1 = cardLabel("H", "I", "J");
  const l2 = cardLabel("L", "M", "N");
  const c1 = slotMatch("G", "H", dayRef, timeRef);
  const c2 = slotMatch("K", "L", dayRef, timeRef);
  return [
    `=IFERROR(LET(groupIdx;${index};slot1Count;IFERROR(ROWS(FILTER(${l1};${c1}));0);`,
    `IF(groupIdx<=slot1Count;INDEX(FILTER(${l1};${c1});groupIdx);INDEX(FILTER(${l2};${c2});groupIdx-slot1Count)));"")`,
  ].join("");
}

function buildLegendRow(instructors) {
  const row = ["מדריכים · צבע לפי מדריך"];
  for (const name of instructors) row.push(name);
  return row;
}

/** Static + formula rows for writeSheetTab (USER_ENTERED). */
export function buildWeeklyScheduleSheetData(times = generateTimeSlots(), instructors = []) {
  const rows = [
    ["לו״ז קבוצות שבועי — מתעדכן אוטומטית מטאב «קבוצות»"],
    buildLegendRow(instructors),
    ["שעה", ...SCHEDULE_DAYS],
  ];

  let timeAnchorRow = FIRST_TIME_ROW;
  for (const time of times) {
    const anchorRow = timeAnchorRow;
    for (let sub = 0; sub < PARALLEL_ROWS; sub++) {
      const line = [sub === 0 ? time : ""];
      for (let d = 0; d < SCHEDULE_DAYS.length; d++) {
        const dayCol = colLetter(1 + d);
        line.push(scheduleCellFormula(dayCol, anchorRow, sub + 1));
      }
      rows.push(line);
      timeAnchorRow += 1;
    }
  }
  return rows;
}

export function buildClearScheduleConditionalFormatRequests(meta) {
  const sheet = (meta.sheets || []).find((s) => s.properties?.title === WEEKLY_SCHEDULE_TAB);
  if (!sheet) return [];
  const sheetId = sheet.properties.sheetId;
  const count = sheet.conditionalFormats?.length ?? 0;
  const requests = [];
  for (let i = count - 1; i >= 0; i--) {
    requests.push({ deleteConditionalFormatRule: { sheetId, index: i } });
  }
  return requests;
}

function instructorColorFormatRequests(sheetId, instructors, lastRow, lastCol) {
  const gridRange = {
    sheetId,
    startRowIndex: FIRST_TIME_ROW - 1,
    endRowIndex: lastRow,
    startColumnIndex: 1,
    endColumnIndex: lastCol + 1,
  };
  const anchor = `B${FIRST_TIME_ROW}`;
  const requests = instructors.map((name) => ({
    addConditionalFormatRule: {
      rule: {
        ranges: [gridRange],
        booleanRule: {
          condition: {
            type: "CUSTOM_FORMULA",
            values: [{
              userEnteredValue: `=AND(LEN(${anchor})>0;ISNUMBER(SEARCH("${escapeSheetString(name)}";${anchor})))`,
            }],
          },
          format: {
            backgroundColor: instructorColorForName(name),
            textFormat: {
              bold: true,
              foregroundColor: instructorTextColorForName(name),
            },
          },
        },
      },
      index: 0,
    },
  }));

  const noInstr = noInstructorColors();
  requests.push({
    addConditionalFormatRule: {
      rule: {
        ranges: [gridRange],
        booleanRule: {
          condition: {
            type: "CUSTOM_FORMULA",
            values: [{
              userEnteredValue: `=AND(LEN(${anchor})>0;ISNUMBER(SEARCH("מדריך:  ·";${anchor})))`,
            }],
          },
          format: {
            backgroundColor: noInstr.background,
            textFormat: { foregroundColor: noInstr.foreground },
          },
        },
      },
      index: 0,
    },
  });

  return requests;
}

export function buildWeeklyScheduleFormatRequests(meta, { instructors = [] } = {}) {
  const sheetId = sheetIdByTitle(meta, WEEKLY_SCHEDULE_TAB);
  if (sheetId == null) return [];

  const times = generateTimeSlots();
  const blockRows = times.length * PARALLEL_ROWS;
  const lastRow = FIRST_TIME_ROW + blockRows;
  const lastCol = SCHEDULE_DAYS.length;

  const requests = [
    {
      updateSheetProperties: {
        properties: {
          sheetId,
          gridProperties: { frozenRowCount: ROW_HEADER, frozenColumnCount: 1 },
          rightToLeft: true,
        },
        fields: "gridProperties.frozenRowCount,gridProperties.frozenColumnCount,rightToLeft",
      },
    },
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: lastCol + 1 },
        cell: {
          userEnteredFormat: {
            textFormat: { bold: true, fontSize: 14 },
            backgroundColor: { red: 0.91, green: 0.94, blue: 0.99 },
          },
        },
        fields: "userEnteredFormat(textFormat,backgroundColor)",
      },
    },
    {
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: ROW_LEGEND - 1,
          endRowIndex: ROW_LEGEND,
          startColumnIndex: 0,
          endColumnIndex: 1,
        },
        cell: {
          userEnteredFormat: {
            textFormat: { bold: true, fontSize: 10 },
            backgroundColor: { red: 0.97, green: 0.98, blue: 0.99 },
          },
        },
        fields: "userEnteredFormat(textFormat,backgroundColor)",
      },
    },
    {
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: ROW_HEADER - 1,
          endRowIndex: ROW_HEADER,
          startColumnIndex: 0,
          endColumnIndex: lastCol + 1,
        },
        cell: {
          userEnteredFormat: {
            textFormat: { bold: true },
            backgroundColor: { red: 0.85, green: 0.89, blue: 0.95 },
            horizontalAlignment: "CENTER",
          },
        },
        fields: "userEnteredFormat(textFormat,backgroundColor,horizontalAlignment)",
      },
    },
    {
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: FIRST_TIME_ROW - 1,
          endRowIndex: lastRow,
          startColumnIndex: 1,
          endColumnIndex: lastCol + 1,
        },
        cell: {
          userEnteredFormat: {
            wrapStrategy: "WRAP",
            verticalAlignment: "MIDDLE",
            horizontalAlignment: "CENTER",
            textFormat: { fontSize: 10 },
            backgroundColor: { red: 1, green: 1, blue: 1 },
            borders: {
              top: { style: "SOLID", width: 1, color: { red: 0.88, green: 0.9, blue: 0.93 } },
              bottom: { style: "SOLID", width: 1, color: { red: 0.88, green: 0.9, blue: 0.93 } },
              left: { style: "SOLID", width: 1, color: { red: 0.88, green: 0.9, blue: 0.93 } },
              right: { style: "SOLID", width: 1, color: { red: 0.88, green: 0.9, blue: 0.93 } },
            },
          },
        },
        fields: "userEnteredFormat(wrapStrategy,verticalAlignment,horizontalAlignment,textFormat,backgroundColor,borders)",
      },
    },
    {
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: FIRST_TIME_ROW - 1,
          endRowIndex: lastRow,
          startColumnIndex: 0,
          endColumnIndex: 1,
        },
        cell: {
          userEnteredFormat: {
            textFormat: { bold: true, fontSize: 10 },
            backgroundColor: { red: 0.96, green: 0.97, blue: 0.98 },
            horizontalAlignment: "CENTER",
            verticalAlignment: "MIDDLE",
          },
        },
        fields: "userEnteredFormat(textFormat,backgroundColor,horizontalAlignment,verticalAlignment)",
      },
    },
  ];

  for (let i = 0; i < instructors.length; i++) {
    const name = instructors[i];
    requests.push({
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: ROW_LEGEND - 1,
          endRowIndex: ROW_LEGEND,
          startColumnIndex: 1 + i,
          endColumnIndex: 2 + i,
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: instructorColorForName(name),
            textFormat: {
              bold: true,
              fontSize: 10,
              foregroundColor: instructorTextColorForName(name),
            },
            horizontalAlignment: "CENTER",
          },
        },
        fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)",
      },
    });
  }

  for (let t = 0; t < times.length; t++) {
    const blockStart = FIRST_TIME_ROW - 1 + t * PARALLEL_ROWS;
    const blockEnd = blockStart + PARALLEL_ROWS;

    requests.push({
      mergeCells: {
        range: {
          sheetId,
          startRowIndex: blockStart,
          endRowIndex: blockEnd,
          startColumnIndex: 0,
          endColumnIndex: 1,
        },
        mergeType: "MERGE_ALL",
      },
    });

    requests.push({
      updateBorders: {
        range: {
          sheetId,
          startRowIndex: blockEnd - 1,
          endRowIndex: blockEnd,
          startColumnIndex: 0,
          endColumnIndex: lastCol + 1,
        },
        bottom: { style: "SOLID_MEDIUM", width: 2, color: { red: 0.72, green: 0.76, blue: 0.82 } },
      },
    });
  }

  for (let c = 0; c <= lastCol; c++) {
    requests.push({
      updateDimensionProperties: {
        range: { sheetId, dimension: "COLUMNS", startIndex: c, endIndex: c + 1 },
        properties: { pixelSize: c === 0 ? 54 : 210 },
        fields: "pixelSize",
      },
    });
  }

  for (let r = FIRST_TIME_ROW - 1; r < lastRow; r++) {
    requests.push({
      updateDimensionProperties: {
        range: { sheetId, dimension: "ROWS", startIndex: r, endIndex: r + 1 },
        properties: { pixelSize: 52 },
        fields: "pixelSize",
      },
    });
  }

  requests.push(...instructorColorFormatRequests(sheetId, instructors, lastRow, lastCol));

  return requests;
}
