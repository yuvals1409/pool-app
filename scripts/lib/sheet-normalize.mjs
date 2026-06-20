export function normalizeClientId(raw) {
  if (raw == null || raw === "") return null;
  const s = String(raw).trim();
  if (/e/i.test(s)) {
    const [mantissa, expPart] = s.toLowerCase().split("e");
    const exp = Number(expPart);
    const [intPart, decPart = ""] = mantissa.split(".");
    const digits = intPart + decPart;
    const shift = exp - decPart.length;
    if (shift >= 0) return digits + "0".repeat(shift);
    return digits.slice(0, digits.length + shift);
  }
  return s.replace(/\.0$/, "").replace(/\s/g, "");
}

export function normalizePhone(raw) {
  if (!raw) return "";
  let s = String(raw).replace(/\s/g, "").trim();
  if (/e/i.test(s)) {
    const n = Number(s);
    if (Number.isFinite(n)) s = String(Math.round(n));
  }
  if (s.startsWith("5") && s.length === 9) s = `0${s}`;
  return s;
}

export function normalizeName(raw) {
  return String(raw || "").replace(/\s+/g, " ").trim();
}

export function isPaid(val) {
  const s = String(val ?? "").trim();
  return s === "1" || s === "1.0" || s === "true" || /^(כן|שולם|paid)$/i.test(s);
}

export function paymentStatusFromSheet(val) {
  const s = String(val ?? "").trim();
  if (isPaid(s)) return "paid";
  if (/פטור|waived/i.test(s)) return "waived";
  return "unpaid";
}

/** Sheet gender: ז'/זכר → male; נ'/נקבה → female */
export function normalizeSheetGender(raw) {
  const s = String(raw ?? "").trim().toLowerCase();
  if (!s) return null;
  if (["male", "m", "ז'", "זכר", "ז"].includes(s)) return "male";
  if (["female", "f", "נ'", "נקבה", "נ"].includes(s)) return "female";
  return null;
}

export function birthDateFromAge(age, refDate = new Date()) {
  const n = Number(age);
  if (!Number.isFinite(n) || n <= 0 || n >= 120) return null;
  const d = new Date(refDate);
  d.setFullYear(d.getFullYear() - Math.round(n));
  return d.toISOString().slice(0, 10);
}

export function parseTimeRange(line) {
  const m = String(line).match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
  if (!m) return null;
  const pad = (t) => {
    const [h, min] = t.split(":");
    return `${h.padStart(2, "0")}:${min.padStart(2, "0")}:00`;
  };
  return { start: pad(m[1]), end: pad(m[2]) };
}
