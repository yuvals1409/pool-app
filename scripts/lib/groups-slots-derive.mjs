/**
 * Derive משבצות_קבוצות from קבוצות (יום_1 / יום_2).
 * Moran edits קבוצות only; slots tab is auto-generated and hidden.
 */

import { GROUP_HEADERS, GROUP_SLOT_HEADERS } from "./groups-sheet-schema.mjs";

function parseGroupsFromSheetRows(groupsRows) {
  if (!groupsRows?.length || groupsRows.length < 2) return [];
  const header = groupsRows[0].map((h) => String(h).trim());
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  const rows = [];
  for (let i = 1; i < groupsRows.length; i++) {
    const line = groupsRows[i];
    if (!line?.length) continue;
    const row = {};
    for (const h of GROUP_HEADERS) {
      const col = idx[h];
      row[h] = col != null ? String(line[col] ?? "").trim() : "";
    }
    if (!row[GROUP_HEADERS[0]]) continue;
    rows.push(row);
  }
  return rows;
}

const SLOT_DEFS = [
  { index: 1, day: "יום_1", start: "שעת_התחלה_1", end: "שעת_סיום_1", instructor: "מדריך_1" },
  { index: 2, day: "יום_2", start: "שעת_התחלה_2", end: "שעת_סיום_2", instructor: "מדריך_2" },
];

export function stableSlotId(groupId, slotIndex) {
  return `${groupId}::${slotIndex}`;
}

export function deriveSlotsFromGroups(groups) {
  const slots = [];
  for (const group of groups) {
    const groupId = String(group["מזהה_קבוצה"] ?? "").trim();
    if (!groupId) continue;

    for (const def of SLOT_DEFS) {
      const day = String(group[def.day] ?? "").trim();
      const start = String(group[def.start] ?? "").trim();
      const end = String(group[def.end] ?? "").trim();
      if (!day && !start) continue;

      slots.push({
        מזהה_משבצה: stableSlotId(groupId, def.index),
        מזהה_קבוצה: groupId,
        יום: day,
        שעת_התחלה: start.slice(0, 5),
        שעת_סיום: end.slice(0, 5),
        מדריך: String(group[def.instructor] ?? group["מדריך_1"] ?? "").trim(),
      });
    }
  }
  return slots;
}

export function slotsSheetDataFromGroups(groups) {
  const slots = deriveSlotsFromGroups(groups);
  return [
    GROUP_SLOT_HEADERS,
    ...slots.map((slot) => GROUP_SLOT_HEADERS.map((h) => String(slot[h] ?? ""))),
  ];
}

export function slotsSheetDataFromGroupsSheet(groupsRows) {
  return slotsSheetDataFromGroups(parseGroupsFromSheetRows(groupsRows));
}
