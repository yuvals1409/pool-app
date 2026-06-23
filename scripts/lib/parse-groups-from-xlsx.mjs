import { randomUUID } from "node:crypto";
import { parseAnnualData, getAnnualSeasonConfig } from "./parse-annual-sheet.mjs";
import { parseSummerData, SUMMER_SEASON_NAME } from "./parse-summer-sheet.mjs";
import {
  buildGroupName,
  GROUP_TYPE_ANNUAL,
  GROUP_TYPE_SUMMER,
  weekdaysToSheetDays,
} from "./group-name-build.mjs";
import { dedupeCatalogGroups } from "./groups-dedupe.mjs";
import { RECORD_TYPES } from "./master-sheet-schema.mjs";
import { GROUP_HEADERS, GROUP_SLOT_HEADERS } from "./groups-sheet-schema.mjs";

function parseProgramMeta(className) {
  const text = String(className || "").trim();
  let gender = "mixed";
  if (/בנים|בנות(?!\s*בנים)/i.test(text) && !/בנות/i.test(text)) gender = "male";
  else if (/בנות/i.test(text)) gender = "female";

  let targetAudience = "";
  if (/קטנים/i.test(text)) targetAudience = "קטנים";
  else if (/גדולים/i.test(text)) targetAudience = "גדולים";
  else if (/מתקדמים/i.test(text)) targetAudience = "מתקדמים";
  else if (/שיפור/i.test(text)) targetAudience = "שיפור סגנון";
  else if (/מבוגרים/i.test(text)) targetAudience = "מבוגרים";

  let level = null;
  const levelMatch = text.match(/רמה\s*(\d+)/i);
  if (levelMatch) {
    level = Number(levelMatch[1]);
  } else if (/קטנים/i.test(text)) level = 2;
  else if (/בינוני/i.test(text)) level = 4;
  else if (/מתקדמים/i.test(text)) level = 6;
  else if (/שיפור/i.test(text)) level = 8;
  else if (/מבוגרים/i.test(text)) level = 10;

  return { gender, targetAudience, level };
}

function defaultRecordTypeForSlotCount(type, slotCount) {
  if (type === GROUP_TYPE_SUMMER) return RECORD_TYPES.SUMMER_COURSE;
  if (slotCount >= 2) return RECORD_TYPES.ANNUAL_TWICE;
  return RECORD_TYPES.ANNUAL_ONCE;
}

function buildAnnualGroups(annual) {
  const season = getAnnualSeasonConfig();
  const byProgram = new Map();

  for (const prod of annual.products) {
    const programKey = prod.name;
    if (!byProgram.has(programKey)) byProgram.set(programKey, []);
    byProgram.get(programKey).push(prod);
  }

  const groups = [];
  const slots = [];
  const productKeyToGroupId = new Map();

  for (const [programName, products] of byProgram) {
    const groupId = randomUUID();
    const meta = parseProgramMeta(programName);
    const schedule = products.map((p) => ({
      day: p.dayOfWeek,
      startTime: p.startTime,
      endTime: p.endTime,
    }));

    const groupName = buildGroupName({
      type: GROUP_TYPE_ANNUAL,
      level: meta.level,
      gender: meta.gender,
      targetAudience: meta.targetAudience,
      schedule,
    });

    const slotCount = products.length;
    const defaultRecordType = defaultRecordTypeForSlotCount(GROUP_TYPE_ANNUAL, slotCount);

    groups.push({
      id: groupId,
      name: groupName,
      type: GROUP_TYPE_ANNUAL,
      level: meta.level,
      targetAudience: meta.targetAudience,
      gender: meta.gender,
      season: season.name,
      validFrom: season.start,
      validUntil: season.end,
      capacity: "",
      defaultRecordType,
      excelSourceName: programName,
      slots: [],
    });

    for (const prod of products) {
      const slotId = randomUUID();
      const slot = {
        id: slotId,
        groupId,
        day: prod.day,
        startTime: prod.startTime,
        endTime: prod.endTime,
        instructor: prod.instructor,
        dayOfWeek: prod.dayOfWeek,
        productKey: prod.key,
      };
      slots.push(slot);
      productKeyToGroupId.set(prod.key, groupId);
      groups[groups.length - 1].slots.push(slot);
    }
  }

  return { groups, slots, productKeyToGroupId };
}

function buildSummerGroups(summer) {
  const groups = [];
  const slots = [];
  const productKeyToGroupId = new Map();

  for (const prod of summer.products) {
    if (prod.recordType === "section") continue;

    const groupId = randomUUID();
    const meta = parseProgramMeta(prod.name);
    const schedule = (prod.weekdays || []).map((day) => ({
      day,
      startTime: prod.startTime,
      endTime: prod.endTime,
    }));

    const groupName = buildGroupName({
      type: GROUP_TYPE_SUMMER,
      level: meta.level,
      gender: meta.gender,
      targetAudience: meta.targetAudience || "קיץ",
      schedule,
      excelSourceName: prod.name,
    });

    const groupSlots = (prod.weekdays || []).map((dayNum) => {
      const dayNames = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
      return {
        id: randomUUID(),
        groupId,
        day: dayNames[dayNum] || String(dayNum),
        startTime: prod.startTime,
        endTime: prod.endTime,
        instructor: prod.instructor,
        dayOfWeek: dayNum,
      };
    });

    if (!groupSlots.length) {
      groupSlots.push({
        id: randomUUID(),
        groupId,
        day: prod.dayLabel || "",
        startTime: prod.startTime,
        endTime: prod.endTime,
        instructor: prod.instructor,
        dayOfWeek: null,
      });
    }

    groups.push({
      id: groupId,
      name: groupName,
      type: GROUP_TYPE_SUMMER,
      level: meta.level,
      targetAudience: meta.targetAudience || "קיץ",
      gender: meta.gender,
      season: SUMMER_SEASON_NAME,
      validFrom: prod.courseStart || SUMMER_SEASON_START,
      validUntil: prod.courseEnd,
      capacity: "",
      defaultRecordType: RECORD_TYPES.SUMMER_COURSE,
      excelSourceName: prod.name,
      slots: groupSlots,
      daysLabel: weekdaysToSheetDays(prod.weekdays),
      startTime: prod.startTime,
      endTime: prod.endTime,
      instructor: prod.instructor,
    });

    for (const slot of groupSlots) slots.push({ ...slot, productKey: prod.key });
    productKeyToGroupId.set(prod.key, groupId);
  }

  return { groups, slots, productKeyToGroupId };
}

export function parseGroupsFromSources({ annualSheets, summerSheets }) {
  const annual = annualSheets ? parseAnnualData(annualSheets) : { products: [] };
  const summer = summerSheets ? parseSummerData(summerSheets) : { products: [] };

  const annualPart = buildAnnualGroups(annual);
  const summerPart = buildSummerGroups(summer);

  const merged = [...annualPart.groups, ...summerPart.groups];
  const { groups, removed: dedupedRemoved } = dedupeCatalogGroups(merged);

  const keptIds = new Set(groups.map((g) => g.id));
  const slots = [...annualPart.slots, ...summerPart.slots].filter((s) => keptIds.has(s.groupId));

  const productKeyToGroupId = new Map([
    ...annualPart.productKeyToGroupId,
    ...summerPart.productKeyToGroupId,
  ]);

  const groupById = new Map(groups.map((g) => [g.id, g]));
  const groupByName = new Map(groups.map((g) => [g.name, g]));

  return {
    groups,
    slots,
    productKeyToGroupId,
    groupById,
    groupByName,
    stats: {
      annualGroups: annualPart.groups.length,
      summerGroups: summerPart.groups.length,
      dedupedRemoved: dedupedRemoved.length,
      totalSlots: slots.length,
    },
  };
}

export function groupToSheetRow(group) {
  const s0 = group.slots?.[0] || {};
  const s1 = group.slots?.[1] || {};
  const daysLabel = group.daysLabel
    || group.slots?.map((s) => s.day).filter(Boolean).join("+")
    || "";

  return {
    מזהה_קבוצה: group.id,
    שם_קבוצה: group.name,
    סוג: group.type,
    רמה: group.level != null ? String(group.level) : "",
    קהל_יעד: group.targetAudience || "",
    מין_קבוצה: group.gender || "",
    יום_1: s0.day || "",
    שעת_התחלה_1: String(s0.startTime || "").slice(0, 5),
    שעת_סיום_1: String(s0.endTime || "").slice(0, 5),
    מדריך_1: s0.instructor || "",
    יום_2: s1.day || "",
    שעת_התחלה_2: String(s1.startTime || "").slice(0, 5),
    שעת_סיום_2: String(s1.endTime || "").slice(0, 5),
    מדריך_2: s1.instructor || "",
    ימים: daysLabel,
    עונה: group.season || "",
    מתאריך: group.validFrom || "",
    עד_תאריך: group.validUntil || "",
    קיבולת: group.capacity || "",
    סוג_רשומה_ברירת_מחדל: group.defaultRecordType || "",
    מקור_שם_אקסל: group.excelSourceName || "",
  };
}

export function slotToSheetRow(slot) {
  return {
    מזהה_משבצה: slot.id,
    מזהה_קבוצה: slot.groupId,
    יום: slot.day || "",
    שעת_התחלה: String(slot.startTime || "").slice(0, 5),
    שעת_סיום: String(slot.endTime || "").slice(0, 5),
    מדריך: slot.instructor || "",
  };
}

export function groupsToSheetData(catalog) {
  const groupRows = catalog.groups.map((g) =>
    GROUP_HEADERS.map((h) => String(groupToSheetRow(g)[h] ?? "")),
  );
  const slotRows = catalog.slots.map((s) =>
    GROUP_SLOT_HEADERS.map((h) => String(slotToSheetRow(s)[h] ?? "")),
  );
  return {
    groups: [GROUP_HEADERS, ...groupRows],
    slots: [GROUP_SLOT_HEADERS, ...slotRows],
  };
}
