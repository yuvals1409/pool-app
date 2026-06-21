import {
  normalizeClientId,
  normalizeName,
  normalizePhone,
  normalizeSheetGender,
  birthDateFromAge,
  isPaid,
  parseTimeRange,
} from "./sheet-normalize.mjs";

export const DAY_SHEETS = ["שני", "שלישי", "רביעי", "חמישי", "שישי"];
export const DAY_MAP = { שני: 1, שלישי: 2, רביעי: 3, חמישי: 4, שישי: 5 };
export const ANNUAL_SEASON_NAME = "2025/26";
export const ANNUAL_SEASON_START = "2025-09-01";
export const ANNUAL_SEASON_END = "2026-06-30";

let annualSeasonConfig = {
  name: ANNUAL_SEASON_NAME,
  start: ANNUAL_SEASON_START,
  end: ANNUAL_SEASON_END,
};

/** Override target season for resync backup imports, e.g. configureAnnualSeason("2026/27") */
export function configureAnnualSeason(name) {
  const m = String(name || "").match(/^(\d{4})\/(\d{2})$/);
  if (!m) throw new Error(`Invalid season name "${name}" — expected format 2026/27`);
  const y1 = Number(m[1]);
  const y2 = 2000 + Number(m[2]);
  annualSeasonConfig = {
    name: String(name),
    start: `${y1}-09-01`,
    end: `${y2}-06-30`,
  };
  return annualSeasonConfig;
}

export function getAnnualSeasonConfig() {
  return { ...annualSeasonConfig };
}

export function productKey(day, instructor, start, end, classType) {
  return `${day}|${instructor}|${start}|${end}|${classType}`;
}

export function parsePeriod(periodText, subscriptionText) {
  const text = `${periodText || ""} ${subscriptionText || ""}`;
  let validFrom = annualSeasonConfig.start;
  let validUntil = annualSeasonConfig.end;

  const startYear = annualSeasonConfig.start.slice(0, 4);
  const endYear = annualSeasonConfig.end.slice(0, 4);

  if (/אמצע\s*אוקטובר|אמצע-אוקטובר/i.test(text)) validFrom = `${startYear}-10-15`;
  else if (/אוקטובר/i.test(text) && !/ספטמבר/i.test(periodText || "")) validFrom = `${startYear}-10-01`;
  else if (/דצמבר/i.test(periodText || "")) validFrom = `${startYear}-12-01`;
  else if (/נובמבר/i.test(periodText || "")) validFrom = `${startYear}-11-01`;

  if (/עד\s*סוף\s*מאי|עד\s*מאי/i.test(subscriptionText || "")) validUntil = `${endYear}-05-31`;
  else if (/עד\s*סוף\s*מרץ|עד\s*מרץ/i.test(subscriptionText || "")) validUntil = `${endYear}-03-31`;

  return { validFrom, validUntil };
}

export function matchProductFromPlacement(placement, products) {
  if (!placement) return null;
  const dayMatch = DAY_SHEETS.find((d) => placement.includes(d));
  const time = parseTimeRange(placement);
  if (!dayMatch && !time) return null;
  const candidates = products.filter((p) => {
    if (dayMatch && p.day !== dayMatch) return false;
    if (time && p.startTime.slice(0, 5) !== time.start.slice(0, 5)) return false;
    if (placement.includes(p.instructor.split(" ")[0])) return true;
    return !placement.match(/שקד|דניאל|מורן|גל|ענתבי/i);
  });
  return candidates[0] || null;
}

export function parseAnnualData(sheets) {
  const stats = {
    products: 0,
    enrollments: 0,
    skippedUnpaid: 0,
    scientificNotationFixed: 0,
    dualEnrollments: 0,
    cancellations: 0,
  };
  const products = [];
  const enrollments = [];
  const families = new Map();
  const participants = new Map();
  const cancellations = [];

  for (const day of DAY_SHEETS) {
    const rows = sheets[day];
    if (!rows) continue;
    const maxRow = Math.max(...rows.keys());
    let r = 1;
    while (r <= maxRow) {
      const instructor = normalizeName(rows.get(r)?.[1]);
      const timeLine = rows.get(r + 1)?.[1];
      const classType = normalizeName(rows.get(r + 2)?.[1]);
      const times = parseTimeRange(timeLine);
      if (instructor && times && classType && !classType.includes("מס' לקוח")) {
        const prod = {
          key: productKey(day, instructor, times.start, times.end, classType),
          day,
          dayOfWeek: DAY_MAP[day],
          instructor,
          startTime: times.start,
          endTime: times.end,
          name: classType,
        };
        products.push(prod);
        stats.products++;

        let rr = r + 4;
        while (rows.has(rr)) {
          const cells = rows.get(rr);
          const childName = normalizeName(cells[3]);
          if (!childName) break;
          if (String(cells[2] || "").includes("מס' לקוח")) { rr++; continue; }

          if (!isPaid(cells[9])) {
            stats.skippedUnpaid++;
            rr++;
            continue;
          }

          const rawClientId = cells[2];
          const clientId = normalizeClientId(rawClientId);
          if (rawClientId && /e/i.test(String(rawClientId))) stats.scientificNotationFixed++;

          const phone = normalizePhone(cells[7]);
          const parent = normalizeName(cells[6]);
          const period = parsePeriod(cells[10], cells[8]);
          const genderRaw = cells[5];
          const age = cells[4] ? Number(cells[4]) : null;

          if (phone) families.set(phone, { phone, parentName: parent, email: null });

          const partKey = clientId || `${childName}|${phone}`;
          if (!participants.has(partKey)) {
            participants.set(partKey, {
              key: partKey,
              fullName: childName,
              phone,
              parentName: parent,
              clientId,
              gender: normalizeSheetGender(genderRaw),
              birthDate: birthDateFromAge(age),
            });
          }

          enrollments.push({
            productKey: prod.key,
            participantKey: partKey,
            paymentStatus: "paid",
            validFrom: period.validFrom,
            validUntil: period.validUntil,
            notes: cells[12] ? String(cells[12]).trim() : null,
          });
          stats.enrollments++;
          rr++;
        }
        r = rr;
        continue;
      }
      r++;
    }
  }

  const cancelRows = sheets["ביטולים"];
  if (cancelRows) {
    for (const [ri, cells] of cancelRows) {
      if (ri < 5) continue;
      const name = normalizeName(cells[3]);
      if (!name) continue;
      const rawClientId = cells[2];
      const clientId = normalizeClientId(rawClientId);
      if (rawClientId && /e/i.test(String(rawClientId))) stats.scientificNotationFixed++;
      cancellations.push({
        clientId,
        fullName: name,
        phone: normalizePhone(cells[7]),
        placement: cells[14] ? String(cells[14]).trim() : null,
      });
      stats.cancellations++;
    }
  }

  const enrollCountByChild = new Map();
  for (const e of enrollments) {
    enrollCountByChild.set(e.participantKey, (enrollCountByChild.get(e.participantKey) || 0) + 1);
  }
  stats.dualEnrollments = [...enrollCountByChild.values()].filter((n) => n > 1).length;

  return { products, enrollments, families, participants, cancellations, stats };
}
