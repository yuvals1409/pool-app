import {
  normalizeClientId,
  normalizeName,
  normalizePhone,
  normalizeSheetGender,
  isPaid,
} from "./sheet-normalize.mjs";

export const SUMMER_SEASON_NAME = "קיץ 2026";
export const SUMMER_SEASON_START = "2026-05-25";
export const SUMMER_SEASON_END = "2026-07-02";
export const SUMMER_IMPORT_SHEETS = ["לימוד (מאי)", "לימוד (יוני)", "לימוד (יולי)"];

const HEB_DAY_MAP = { ב: 2, ג: 3, ד: 4, ה: 4, ו: 5 };

function parseHebrewDate(text) {
  const m = String(text).match(/(\d{1,2})\/(\d{1,2})/);
  if (!m) return null;
  const day = m[1].padStart(2, "0");
  const month = m[2].padStart(2, "0");
  return `2026-${month}-${day}`;
}

function parseWeekdays(text) {
  const days = new Set();
  for (const part of String(text).split("+")) {
    const letter = part.replace(/['\s]/g, "").trim()[0];
    if (letter && HEB_DAY_MAP[letter] != null) days.add(HEB_DAY_MAP[letter]);
  }
  return [...days].sort();
}

function parseTimeRange(str) {
  const first = String(str).split("+")[0].trim();
  const range = first.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
  const pad = (t) => {
    const [h, min] = t.split(":");
    return `${h.padStart(2, "0")}:${min.padStart(2, "0")}:00`;
  };
  if (range) return { start: pad(range[1]), end: pad(range[2]) };
  const single = first.match(/(\d{1,2}:\d{2})/);
  if (single) {
    const start = pad(single[1]);
    const [h, m] = start.split(":").map(Number);
    const endMin = h * 60 + m + 45;
    const end = `${String(Math.floor(endMin / 60)).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}:00`;
    return { start, end };
  }
  return { start: "17:30:00", end: "18:15:00" };
}

function productKey(name, instructor, start, weekdays) {
  return `${name}|${instructor}|${start}|${weekdays.join(",")}`;
}

export function parseSummerSheet(rows) {
  const stats = { products: 0, enrollments: 0, skippedUnpaid: 0, skippedEmpty: 0 };
  const products = [];
  const enrollments = [];
  const families = new Map();
  const participants = new Map();

  const maxRow = Math.max(...rows.keys());
  let r = 1;
  while (r <= maxRow) {
    const cells = rows.get(r) || {};
    const name = normalizeName(cells[2]);
    if (!name || !name.includes("לימוד שחייה")) {
      r++;
      continue;
    }

    const courseStart = parseHebrewDate(cells[11]) || SUMMER_SEASON_START;
    const row2 = rows.get(r + 1) || {};
    const weekdays = parseWeekdays(row2[1] || "");
    const instructor = normalizeName(row2[2]);
    const courseEnd = parseHebrewDate(row2[11]) || SUMMER_SEASON_END;
    const times = parseTimeRange(rows.get(r + 2)?.[1] || "");

    const prod = {
      key: productKey(name, instructor, times.start, weekdays),
      name,
      instructor,
      startTime: times.start,
      endTime: times.end,
      weekdays,
      courseStart,
      courseEnd,
    };
    products.push(prod);
    stats.products++;

    let rr = r + 4;
    while (rows.has(rr)) {
      const sc = rows.get(rr);
      const header = normalizeName(sc[2]);
      if (header.includes("לימוד שחייה")) break;
      if (header.includes("מס' לקוח") || !sc[3]) {
        rr++;
        continue;
      }

      const childName = normalizeName(sc[3]);
      if (!childName || childName === "0") {
        stats.skippedEmpty++;
        rr++;
        continue;
      }

      if (!isPaid(sc[9])) {
        stats.skippedUnpaid++;
        rr++;
        continue;
      }

      const clientId = normalizeClientId(sc[2]);
      const phone = normalizePhone(sc[7]);
      const parent = normalizeName(sc[6]);
      const partKey = clientId || `${childName}|${phone}`;

      if (phone) families.set(phone, { phone, parentName: parent });
      participants.set(partKey, {
        key: partKey,
        phone,
        fullName: childName,
        clientId,
        gender: normalizeSheetGender(sc[5]),
      });

      enrollments.push({
        productKey: prod.key,
        participantKey: partKey,
        paymentStatus: "paid",
        validFrom: courseStart,
        validUntil: courseEnd,
      });
      stats.enrollments++;
      rr++;
    }
    r = rr;
  }

  return { products, enrollments, families, participants, stats };
}

export function parseSummerData(sheets) {
  const merged = {
    products: [],
    enrollments: [],
    families: new Map(),
    participants: new Map(),
    stats: { products: 0, enrollments: 0, skippedUnpaid: 0, skippedEmpty: 0 },
  };

  for (const tab of SUMMER_IMPORT_SHEETS) {
    const rows = sheets[tab];
    if (!rows) continue;
    const part = parseSummerSheet(rows);
    merged.products.push(...part.products);
    merged.enrollments.push(...part.enrollments);
    for (const [k, v] of part.families) merged.families.set(k, v);
    for (const [k, v] of part.participants) merged.participants.set(k, v);
    merged.stats.products += part.stats.products;
    merged.stats.enrollments += part.stats.enrollments;
    merged.stats.skippedUnpaid += part.stats.skippedUnpaid;
    merged.stats.skippedEmpty += part.stats.skippedEmpty;
  }
  return merged;
}

/** Parse price list tab — returns Map<courseName, price> */
export function parseSummerPriceList(rows) {
  const prices = new Map();
  if (!rows) return prices;
  for (const [, cells] of rows) {
    const name = normalizeName(cells[1] || cells[0]);
    const price = Number(cells[2] ?? cells[3]);
    if (name && Number.isFinite(price) && price > 0) prices.set(name, price);
  }
  return prices;
}
