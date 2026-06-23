import { randomUUID } from "node:crypto";
import { parseLeadsFromWorkbook } from "./parse-leads-sheet.mjs";
import { parseAnnualData, getAnnualSeasonConfig, matchProductFromPlacement } from "./parse-annual-sheet.mjs";
import { parseSummerData, SUMMER_SEASON_NAME } from "./parse-summer-sheet.mjs";
import { parseGroupsFromSources } from "./parse-groups-from-xlsx.mjs";
import { loadWorkbook, rowsMapToArrays } from "./xlsx-workbook.mjs";
import {
  emptyMasterRow,
  RECORD_TYPES,
  applyConflictFlags,
  genderToSheet,
  paymentStatusToSheet,
  rowToArray,
  MASTER_HEADERS,
  splitFullName,
} from "./master-sheet-schema.mjs";
import { buildGroupCatalog } from "./master-sheet-enrich.mjs";
import { paymentStatusFromSheet } from "./sheet-normalize.mjs";

function formatTime(t) {
  if (!t) return "";
  return String(t).slice(0, 5);
}

function setParticipantNames(row, fullName) {
  const { first, last } = splitFullName(fullName);
  row["שם_פרטי"] = first;
  row["שם_משפחה"] = last;
}

function fillEnrollmentFromGroup(row, group, enr) {
  row["שם_קבוצה"] = group.name;
  row["עונה"] = group.season;
  row["ימים"] = group.daysLabel || group.slots?.map((s) => s.day).filter(Boolean).join("+") || "";
  row["שעת_התחלה"] = formatTime(group.startTime || group.slots?.[0]?.startTime);
  row["שעת_סיום"] = formatTime(group.endTime || group.slots?.[0]?.endTime);
  row["מדריך"] = group.instructor || group.slots?.[0]?.instructor || "";
  row["מתאריך"] = enr.validFrom || group.validFrom || "";
  row["עד_תאריך"] = enr.validUntil || group.validUntil || "";
  row["סוג_רשומה"] = group.defaultRecordType;
}

export function buildMasterRowsFromSources({ annualSheets, summerSheets, leadsSheets }) {
  const catalog = parseGroupsFromSources({ annualSheets, summerSheets });
  const groupCatalog = buildGroupCatalog(catalog.groups, catalog.slots);
  const rows = [];

  if (leadsSheets) {
    const leads = parseLeadsFromWorkbook(leadsSheets);
    for (const lead of leads) {
      const row = emptyMasterRow(randomUUID());
      row["סוג_רשומה"] = RECORD_TYPES.LEAD;
      row["מקור_מקורי"] = "לידים";
      row["טלפון_הורה"] = lead.phone;
      setParticipantNames(row, lead.childName);
      row["שם_הורה"] = lead.parentName || "";
      row["גיל"] = lead.age ? String(lead.age) : "";
      row["תאריך_מבדק"] = lead.slotDate;
      row["שעת_מבדק"] = String(lead.slotTime).slice(0, 5);
      row["סטטוס_ליד"] = "new";
      row["מקור_ליד"] = "tc_leads";
      row["עונה"] = SUMMER_SEASON_NAME;
      rows.push(row);
    }
  }

  if (annualSheets) {
    const annual = parseAnnualData(annualSheets);
    const season = getAnnualSeasonConfig();
    const cancelledKeys = new Set();

    for (const c of annual.cancellations) {
      const matched = matchProductFromPlacement(c.placement, annual.products);
      const partKey = c.clientId || `${c.fullName}|${c.phone}`;
      const groupId = matched ? catalog.productKeyToGroupId.get(matched.key) : null;
      cancelledKeys.add(`${partKey}|${groupId || "unknown"}`);
    }

    const byParticipantGroup = new Map();
    for (const enr of annual.enrollments) {
      const groupId = catalog.productKeyToGroupId.get(enr.productKey);
      if (!groupId) continue;
      const key = `${enr.participantKey}|${groupId}`;
      if (!byParticipantGroup.has(key)) byParticipantGroup.set(key, []);
      byParticipantGroup.get(key).push(enr);
    }

    for (const [key, enrollments] of byParticipantGroup) {
      const enr = enrollments[0];
      const part = annual.participants.get(enr.participantKey);
      const groupId = key.split("|")[1];
      const group = catalog.groupById.get(groupId);
      if (!part || !group) continue;

      const row = emptyMasterRow(randomUUID());
      row["מקור_מקורי"] = "שנתי";
      row["מס_לקוח"] = part.clientId ? `'${part.clientId}` : "";
      row["טלפון_הורה"] = part.phone;
      setParticipantNames(row, part.fullName);
      row["שם_הורה"] = part.parentName || "";
      row["מין"] = genderToSheet(part.gender);
      row["תאריך_לידה"] = part.birthDate || "";
      row["דרגת_לקוח"] = "חיצוני";
      row["עונה"] = season.name;
      fillEnrollmentFromGroup(row, group, enr);
      row["סטטוס_תשלום"] = paymentStatusToSheet(enr.paymentStatus);
      row["הערות"] = enr.notes || "";

      if (cancelledKeys.has(key)) {
        row["פעיל"] = "לא";
        row["סיבת_ביטול"] = "מגיליון ביטולים";
      }
      rows.push(row);
    }

    for (const c of annual.cancellations) {
      const matched = matchProductFromPlacement(c.placement, annual.products);
      const groupId = matched ? catalog.productKeyToGroupId.get(matched.key) : null;
      const group = groupId ? catalog.groupById.get(groupId) : null;
      const { first, last } = splitFullName(c.fullName);
      const already = rows.find(
        (r) =>
          isAnnualType(r["סוג_רשומה"]) &&
          r["שם_פרטי"] === first &&
          r["שם_משפחה"] === last &&
          r["פעיל"] === "לא",
      );
      if (already || !group) continue;

      const row = emptyMasterRow(randomUUID());
      row["סוג_רשומה"] = group.defaultRecordType;
      row["מקור_מקורי"] = "שנתי";
      row["מס_לקוח"] = c.clientId ? `'${c.clientId}` : "";
      row["טלפון_הורה"] = c.phone;
      setParticipantNames(row, c.fullName);
      row["עונה"] = season.name;
      fillEnrollmentFromGroup(row, group, { validFrom: season.start, validUntil: season.end });
      row["פעיל"] = "לא";
      row["סיבת_ביטול"] = c.placement || "ביטול";
      row["סטטוס_תשלום"] = "לא שולם";
      rows.push(row);
    }
  }

  if (summerSheets) {
    const summer = parseSummerData(summerSheets);
    const byParticipantGroup = new Map();

    for (const enr of summer.enrollments) {
      const groupId = catalog.productKeyToGroupId.get(enr.productKey);
      if (!groupId) continue;
      const key = `${enr.participantKey}|${groupId}`;
      if (!byParticipantGroup.has(key)) byParticipantGroup.set(key, []);
      byParticipantGroup.get(key).push(enr);
    }

    for (const [key, enrollments] of byParticipantGroup) {
      const enr = enrollments[0];
      const part = summer.participants.get(enr.participantKey);
      const groupId = key.split("|")[1];
      const group = catalog.groupById.get(groupId);
      if (!part || !group) continue;

      const row = emptyMasterRow(randomUUID());
      row["סוג_רשומה"] = RECORD_TYPES.SUMMER_COURSE;
      row["מקור_מקורי"] = "קיץ";
      row["מס_לקוח"] = part.clientId ? `'${part.clientId}` : "";
      row["טלפון_הורה"] = part.phone;
      setParticipantNames(row, part.fullName);
      row["שם_הורה"] = part.parentName || "";
      row["מין"] = genderToSheet(part.gender);
      row["תאריך_לידה"] = part.birthDate || "";
      row["דרגת_לקוח"] = part.membership?.label || "חיצוני";
      fillEnrollmentFromGroup(row, group, enr);
      row["סטטוס_תשלום"] = paymentStatusToSheet(enr.paymentStatus);
      row["הערות"] = enr.sheetTab ? `מקור: ${enr.sheetTab}` : "";
      rows.push(row);
    }
  }

  return applyConflictFlags(rows, groupCatalog);
}

function isAnnualType(type) {
  return type === RECORD_TYPES.ANNUAL_ONCE || type === RECORD_TYPES.ANNUAL_TWICE;
}

export function loadSourcesFromPaths({ leadsPath, annualPath, summerPath }) {
  return {
    leadsSheets: leadsPath ? loadWorkbook(leadsPath) : null,
    annualSheets: annualPath ? loadWorkbook(annualPath) : null,
    summerSheets: summerPath ? loadWorkbook(summerPath) : null,
  };
}

export function masterRowsToSheetData(rows) {
  return [MASTER_HEADERS, ...rows.map(rowToArray)];
}

export function snapshotSourceTabs(sheets, prefix) {
  const out = {};
  if (!sheets) return out;
  for (const [name, rows] of Object.entries(sheets)) {
    out[`${prefix}_${name}`] = rowsMapToArrays(rows).filter(Boolean);
  }
  return out;
}

export { paymentStatusFromSheet, parseGroupsFromSources };
