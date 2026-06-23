/**
 * Deduplicate groups by schedule fingerprint and disambiguate display names.
 */

import { buildGroupName, GROUP_TYPE_ANNUAL, GROUP_TYPE_SUMMER } from "./group-name-build.mjs";
import { GROUP_HEADERS } from "./groups-sheet-schema.mjs";

const DAY_ORDER = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

function normTime(t) {
  const s = String(t ?? "").trim();
  if (!s) return "";
  if (s.includes(":")) return s.slice(0, 5);
  return s;
}

/** Short label from Excel product name, e.g. "לימוד שחייה 4" → "שחייה 4". */
export function shortExcelLabel(excelSourceName) {
  const text = String(excelSourceName || "").trim();
  if (!text) return "";
  const swim = text.match(/שחייה\s*(\d+)/i);
  if (swim) return `שחייה ${swim[1]}`;
  if (text.length <= 28) return text;
  return `${text.slice(0, 25)}…`;
}

function rowIndex(hdr, name) {
  const i = hdr.indexOf(name);
  return i >= 0 ? i : null;
}

function rowVal(row, hdr, name) {
  const i = rowIndex(hdr, name);
  return i == null ? "" : String(row[i] ?? "").trim();
}

function slotSetFromRow(row, hdr) {
  const slots = [];
  const add = (dayKey, startKey, endKey) => {
    const day = rowVal(row, hdr, dayKey);
    const start = normTime(rowVal(row, hdr, startKey));
    if (!day || !start) return;
    slots.push(`${day}|${start}|${normTime(rowVal(row, hdr, endKey))}`);
  };
  add("יום_1", "שעת_התחלה_1", "שעת_סיום_1");
  add("יום_2", "שעת_התחלה_2", "שעת_סיום_2");
  return [...new Set(slots)].sort();
}

export function scheduleFingerprintFromRow(row, hdr) {
  const season = rowVal(row, hdr, "עונה");
  const type = rowVal(row, hdr, "סוג");
  return `${type}|${season}|${slotSetFromRow(row, hdr).join(";")}`;
}

export function scheduleFingerprintFromCatalog(group) {
  const slots = (group.slots || [])
    .filter((s) => s.day && s.startTime)
    .map((s) => `${s.day}|${normTime(s.startTime)}|${normTime(s.endTime)}`)
    .sort();
  return `${group.type}|${group.season}|${slots.join(";")}`;
}

function instructorScoreFromRow(row, hdr) {
  let n = 0;
  if (rowVal(row, hdr, "מדריך_1")) n += 2;
  if (rowVal(row, hdr, "מדריך_2")) n += 2;
  if (rowVal(row, hdr, "מקור_שם_אקסל")) n += 1;
  return n;
}

function instructorScoreFromCatalog(group) {
  let n = 0;
  for (const s of group.slots || []) {
    if (s.instructor) n += 2;
  }
  if (group.excelSourceName) n += 1;
  return n;
}

function isSummerRow(row, hdr) {
  const type = rowVal(row, hdr, "סוג");
  const season = rowVal(row, hdr, "עונה");
  return type === GROUP_TYPE_SUMMER || /קיץ/i.test(season);
}

function isSummerGroup(group) {
  return group.type === GROUP_TYPE_SUMMER || /קיץ/i.test(group.season || "");
}

function isSubsetSlots(sub, sup) {
  if (!sub.length || sub.length >= sup.length) return false;
  const supSet = new Set(sup);
  return sub.every((s) => supSet.has(s));
}

function pickBetterRow(a, b, hdr) {
  const sa = instructorScoreFromRow(a, hdr);
  const sb = instructorScoreFromRow(b, hdr);
  if (sa !== sb) return sa > sb ? a : b;
  const slotsA = slotSetFromRow(a, hdr);
  const slotsB = slotSetFromRow(b, hdr);
  if (slotsA.length !== slotsB.length) return slotsA.length > slotsB.length ? a : b;
  return a;
}

function pickBetterGroup(a, b) {
  const sa = instructorScoreFromCatalog(a);
  const sb = instructorScoreFromCatalog(b);
  if (sa !== sb) return sa > sb ? a : b;
  const slotsA = (a.slots || []).filter((s) => s.day && s.startTime);
  const slotsB = (b.slots || []).filter((s) => s.day && s.startTime);
  if (slotsA.length !== slotsB.length) return slotsA.length > slotsB.length ? a : b;
  return a;
}

function scheduleFromRow(row, hdr) {
  const dayToNum = Object.fromEntries(DAY_ORDER.map((d, i) => [d, i]));
  const slots = [];
  const add = (dayKey, startKey, endKey) => {
    const day = rowVal(row, hdr, dayKey);
    const start = normTime(rowVal(row, hdr, startKey));
    if (!day || !start) return;
    slots.push({
      day: dayToNum[day] ?? day,
      startTime: start,
      endTime: normTime(rowVal(row, hdr, endKey)),
    });
  };
  add("יום_1", "שעת_התחלה_1", "שעת_סיום_1");
  add("יום_2", "שעת_התחלה_2", "שעת_סיום_2");
  return slots;
}

/** Build a clearer group name using row metadata. */
export function buildGroupNameFromRow(row, hdr, { forceExcelLabel = false } = {}) {
  const type = rowVal(row, hdr, "סוג") || GROUP_TYPE_ANNUAL;
  const level = rowVal(row, hdr, "רמה");
  const schedule = scheduleFromRow(row, hdr);
  const excelSource = rowVal(row, hdr, "מקור_שם_אקסל");
  return buildGroupName({
    type,
    level: level ? Number(level) : null,
    gender: rowVal(row, hdr, "מין_קבוצה") || "mixed",
    targetAudience: rowVal(row, hdr, "קהל_יעד"),
    schedule,
    excelSourceName: excelSource,
    forceExcelLabel,
  });
}

function baseGroupNameFromRow(row, hdr) {
  return buildGroupNameFromRow(row, hdr, { forceExcelLabel: false });
}

function ensureUniqueRowNames(kept, hdr) {
  const nameCol = rowIndex(hdr, "שם_קבוצה");
  if (nameCol == null) return 0;
  const baseCounts = new Map();
  for (const row of kept) {
    const base = baseGroupNameFromRow(row, hdr);
    baseCounts.set(base, (baseCounts.get(base) || 0) + 1);
  }
  let renamed = 0;
  for (const row of kept) {
    const base = baseGroupNameFromRow(row, hdr);
    const newName = (baseCounts.get(base) || 0) > 1
      ? buildGroupNameFromRow(row, hdr, { forceExcelLabel: true })
      : base;
    if (newName !== row[nameCol]) renamed += 1;
    row[nameCol] = newName;
  }
  return renamed;
}

export function buildGroupNameFromCatalog(group, { forceExcelLabel = false } = {}) {
  const schedule = (group.slots || [])
    .filter((s) => s.day && s.startTime)
    .map((s) => ({
      day: s.dayOfWeek ?? DAY_ORDER.indexOf(s.day),
      startTime: s.startTime,
      endTime: s.endTime,
    }));
  return buildGroupName({
    type: group.type,
    level: group.level,
    gender: group.gender,
    targetAudience: group.targetAudience,
    schedule,
    excelSourceName: group.excelSourceName,
    forceExcelLabel: forceExcelLabel || group.type === GROUP_TYPE_SUMMER,
  });
}

function ensureUniqueCatalogNames(groups) {
  const baseCounts = new Map();
  for (const g of groups) {
    const base = buildGroupNameFromCatalog(g, { forceExcelLabel: false });
    baseCounts.set(base, (baseCounts.get(base) || 0) + 1);
  }
  for (const g of groups) {
    const base = buildGroupNameFromCatalog(g, { forceExcelLabel: false });
    g.name = (baseCounts.get(base) || 0) > 1
      ? buildGroupNameFromCatalog(g, { forceExcelLabel: true })
      : buildGroupNameFromCatalog(g);
  }
}

/**
 * Remove duplicate / subset groups from sheet rows (header preserved).
 * @returns {{ rows: string[][], removed: object[], renamed: number }}
 */
export function dedupeGroupSheetRows(rows) {
  if (!rows?.length) return { rows: rows || [], removed: [], renamed: 0 };
  const hdr = rows[0].map((h) => String(h).trim());
  const nameCol = rowIndex(hdr, "שם_קבוצה");

  const candidates = rows.slice(1).filter((r) => rowVal(r, hdr, "מזהה_קבוצה"));
  const removed = [];
  const kept = [];

  for (const row of candidates) {
    const fp = scheduleFingerprintFromRow(row, hdr);
    const excel = rowVal(row, hdr, "מקור_שם_אקסל");
    const slots = slotSetFromRow(row, hdr);
    const summer = isSummerRow(row, hdr);

    let drop = false;

    for (let i = kept.length - 1; i >= 0; i--) {
      const other = kept[i];
      const otherFp = scheduleFingerprintFromRow(other, hdr);
      const otherExcel = rowVal(other, hdr, "מקור_שם_אקסל");
      const otherSlots = slotSetFromRow(other, hdr);
      const otherSummer = isSummerRow(other, hdr);

      if (excel && excel === otherExcel && fp === otherFp) {
        const winner = pickBetterRow(row, other, hdr);
        const loser = winner === row ? other : row;
        if (loser === row) {
          drop = true;
          removed.push({ reason: "same_excel_same_schedule", row, kept: other });
          break;
        }
        removed.push({ reason: "same_excel_same_schedule", row: other, kept: row });
        kept.splice(i, 1);
        continue;
      }

      if (excel && excel === otherExcel && isSubsetSlots(slots, otherSlots)) {
        drop = true;
        removed.push({ reason: "subset_same_excel", row, superset: other });
        break;
      }
      if (excel && excel === otherExcel && isSubsetSlots(otherSlots, slots)) {
        removed.push({ reason: "subset_same_excel", row: other, superset: row });
        kept.splice(i, 1);
        continue;
      }

      if (summer && otherSummer && fp === otherFp) {
        const winner = pickBetterRow(row, other, hdr);
        const loser = winner === row ? other : row;
        if (loser === row) {
          drop = true;
          removed.push({ reason: "summer_schedule_collision", row, kept: other });
          break;
        }
        removed.push({ reason: "summer_schedule_collision", row: other, kept: row });
        kept.splice(i, 1);
      }
    }

    if (!drop) kept.push(row);
  }

  let renamed = ensureUniqueRowNames(kept, hdr);

  return {
    rows: [hdr, ...kept],
    removed,
    renamed,
  };
}

/** Deduplicate in-memory catalog groups (used at import). */
export function dedupeCatalogGroups(groups) {
  const kept = [];
  const removed = [];

  for (const group of groups) {
    const fp = scheduleFingerprintFromCatalog(group);
    const excel = String(group.excelSourceName || "").trim();
    const slots = (group.slots || [])
      .filter((s) => s.day && s.startTime)
      .map((s) => `${s.day}|${normTime(s.startTime)}|${normTime(s.endTime)}`)
      .sort();
    const summer = isSummerGroup(group);

    let drop = false;

    for (let i = kept.length - 1; i >= 0; i--) {
      const other = kept[i];
      const otherFp = scheduleFingerprintFromCatalog(other);
      const otherExcel = String(other.excelSourceName || "").trim();
      const otherSlots = (other.slots || [])
        .filter((s) => s.day && s.startTime)
        .map((s) => `${s.day}|${normTime(s.startTime)}|${normTime(s.endTime)}`)
        .sort();

      if (excel && excel === otherExcel && fp === otherFp) {
        const winner = pickBetterGroup(group, other);
        const loser = winner === group ? other : group;
        if (loser === group) {
          drop = true;
          removed.push({ reason: "same_excel_same_schedule", group, kept: other });
          break;
        }
        removed.push({ reason: "same_excel_same_schedule", group: other, kept: group });
        kept.splice(i, 1);
        continue;
      }

      if (excel && excel === otherExcel && isSubsetSlots(slots, otherSlots)) {
        drop = true;
        removed.push({ reason: "subset_same_excel", group, superset: other });
        break;
      }
      if (excel && excel === otherExcel && isSubsetSlots(otherSlots, slots)) {
        removed.push({ reason: "subset_same_excel", group: other, superset: group });
        kept.splice(i, 1);
        continue;
      }

      if (summer && isSummerGroup(other) && fp === otherFp) {
        const winner = pickBetterGroup(group, other);
        const loser = winner === group ? other : group;
        if (loser === group) {
          drop = true;
          removed.push({ reason: "summer_schedule_collision", group, kept: other });
          break;
        }
        removed.push({ reason: "summer_schedule_collision", group: other, kept: group });
        kept.splice(i, 1);
      }
    }

    if (!drop) kept.push(group);
  }

  ensureUniqueCatalogNames(kept);

  return { groups: kept, removed };
}

export function groupsSheetDataToRows(data) {
  return data.map((row) => GROUP_HEADERS.map((_, i) => String(row[i] ?? "")));
}
