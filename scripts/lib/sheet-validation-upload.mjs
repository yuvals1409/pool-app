import {
  writeSheetTab,
  clearSheetTab,
  addSheetTab,
  batchUpdateSpreadsheet,
  getSpreadsheetMetadata,
  sheetIdByTitle,
  readSheetTab,
} from "./google-sheets-client.mjs";
import { LISTS_TAB, buildListsTabData } from "./sheet-lists-tab.mjs";
import { GROUPS_TAB, GROUP_SLOTS_TAB } from "./groups-sheet-schema.mjs";
import { slotsSheetDataFromGroupsSheet } from "./groups-slots-derive.mjs";
import {
  WEEKLY_SCHEDULE_TAB,
  buildWeeklyScheduleSheetData,
  buildWeeklyScheduleFormatRequests,
  buildClearScheduleConditionalFormatRequests,
  collectInstructorsFromGroupsSheet,
} from "./sheet-weekly-schedule.mjs";
import {
  buildSheetValidationRequests,
  collectInstructorsFromCatalog,
  collectTimesFromCatalog,
} from "./sheet-data-validation.mjs";
import { buildDateFormatRequests, MASTER_EDITABLE_DATE_FIELDS, MASTER_FORMULA_DATE_FIELDS } from "./sheet-date-cells.mjs";
import { buildAllFormulaRequests } from "./sheet-master-formulas.mjs";
import { buildDateValidationRequests } from "./sheet-data-validation.mjs";

async function batchRequests(token, spreadsheetId, requests, chunkSize = 80) {
  if (!requests.length) return;
  for (let i = 0; i < requests.length; i += chunkSize) {
    await batchUpdateSpreadsheet(token, spreadsheetId, requests.slice(i, i + chunkSize));
  }
}

async function ensureTab(token, spreadsheetId, title) {
  try {
    await addSheetTab(token, spreadsheetId, title);
  } catch {
    // already exists
  }
}

async function hideSheetTab(token, spreadsheetId, title) {
  const meta = await getSpreadsheetMetadata(token, spreadsheetId);
  const sheetId = sheetIdByTitle(meta, title);
  if (sheetId == null) return;
  await batchUpdateSpreadsheet(token, spreadsheetId, [{
    updateSheetProperties: {
      properties: { sheetId, hidden: true },
      fields: "hidden",
    },
  }]);
}

/** Rebuild hidden משבצות_קבוצות from current קבוצות tab. */
export async function refreshDerivedSlotsTab(token, spreadsheetId, groupsRows = null) {
  const rows = groupsRows ?? await readSheetTab(token, spreadsheetId, GROUPS_TAB);
  const slotsData = slotsSheetDataFromGroupsSheet(rows);
  await ensureTab(token, spreadsheetId, GROUP_SLOTS_TAB);
  await clearSheetTab(token, spreadsheetId, GROUP_SLOTS_TAB);
  await writeSheetTab(token, spreadsheetId, GROUP_SLOTS_TAB, slotsData);
  await hideSheetTab(token, spreadsheetId, GROUP_SLOTS_TAB);
  return slotsData.length - 1;
}

/** Build / refresh לו״ז קבוצות שבועי (formula grid from קבוצות). */
export async function refreshWeeklyScheduleTab(token, spreadsheetId, instructors = null) {
  const groupsRows = await readSheetTab(token, spreadsheetId, GROUPS_TAB);
  const instructorList = instructors ?? collectInstructorsFromGroupsSheet(groupsRows);

  await ensureTab(token, spreadsheetId, WEEKLY_SCHEDULE_TAB);
  await clearSheetTab(token, spreadsheetId, WEEKLY_SCHEDULE_TAB);
  const data = buildWeeklyScheduleSheetData(undefined, instructorList);
  await writeSheetTab(token, spreadsheetId, WEEKLY_SCHEDULE_TAB, data);

  const meta = await getSpreadsheetMetadata(
    token,
    spreadsheetId,
    "sheets(properties(sheetId,title),conditionalFormats)",
  );
  const clearCf = buildClearScheduleConditionalFormatRequests(meta);
  if (clearCf.length) await batchUpdateSpreadsheet(token, spreadsheetId, clearCf);

  const formatRequests = buildWeeklyScheduleFormatRequests(meta, { instructors: instructorList });
  if (formatRequests.length) {
    await batchRequests(token, spreadsheetId, formatRequests);
  }
  return data.length - 3;
}

export async function applyAllValidations(token, spreadsheetId, catalog) {
  const instructors = collectInstructorsFromCatalog(catalog);
  const times = collectTimesFromCatalog(catalog);
  const { rows: listsRows } = buildListsTabData({ instructors, times });
  const listsHeaders = listsRows[0];

  await ensureTab(token, spreadsheetId, LISTS_TAB);
  await clearSheetTab(token, spreadsheetId, LISTS_TAB);
  await writeSheetTab(token, spreadsheetId, LISTS_TAB, listsRows);
  await hideSheetTab(token, spreadsheetId, LISTS_TAB);

  const meta = await getSpreadsheetMetadata(token, spreadsheetId);
  const validationRequests = buildSheetValidationRequests(meta, { listsHeaders });
  const dateFormatRequests = buildDateFormatRequests(meta);
  const formulaRequests = buildAllFormulaRequests(meta);
  const dateValidationRequests = buildDateValidationRequests(meta);

  await batchRequests(token, spreadsheetId, dateFormatRequests);
  await batchRequests(token, spreadsheetId, validationRequests);
  await batchRequests(token, spreadsheetId, formulaRequests);
  await batchRequests(token, spreadsheetId, dateValidationRequests);

  const slotCount = await refreshDerivedSlotsTab(token, spreadsheetId);
  const scheduleRows = await refreshWeeklyScheduleTab(token, spreadsheetId, instructors);

  return {
    validationRules: validationRequests.length,
    dateFormats: dateFormatRequests.length,
    formulas: formulaRequests.length,
    dateValidations: dateValidationRequests.length,
    derivedSlots: slotCount,
    scheduleRows,
    instructors: instructors.length,
  };
}
