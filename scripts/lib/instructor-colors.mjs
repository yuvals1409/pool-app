/** Stable, saturated colors per instructor name (Google Sheets RGB 0–1). */

const VIBRANT_PALETTE = [
  { red: 0.56, green: 0.77, blue: 0.98 },
  { red: 0.52, green: 0.90, blue: 0.55 },
  { red: 1.0, green: 0.72, blue: 0.55 },
  { red: 0.95, green: 0.60, blue: 0.75 },
  { red: 0.75, green: 0.62, blue: 0.98 },
  { red: 0.45, green: 0.86, blue: 0.86 },
  { red: 0.98, green: 0.85, blue: 0.45 },
  { red: 0.68, green: 0.85, blue: 0.45 },
  { red: 0.55, green: 0.70, blue: 0.98 },
  { red: 0.98, green: 0.65, blue: 0.55 },
  { red: 0.82, green: 0.55, blue: 0.98 },
  { red: 0.55, green: 0.92, blue: 0.78 },
  { red: 0.98, green: 0.78, blue: 0.55 },
  { red: 0.60, green: 0.78, blue: 0.98 },
  { red: 0.90, green: 0.55, blue: 0.65 },
  { red: 0.72, green: 0.90, blue: 0.98 },
  { red: 0.85, green: 0.75, blue: 0.98 },
  { red: 0.65, green: 0.95, blue: 0.65 },
  { red: 0.98, green: 0.80, blue: 0.65 },
  { red: 0.58, green: 0.82, blue: 0.90 },
  { red: 0.92, green: 0.58, blue: 0.82 },
  { red: 0.78, green: 0.92, blue: 0.55 },
  { red: 0.55, green: 0.65, blue: 0.98 },
  { red: 0.98, green: 0.92, blue: 0.55 },
];

const NO_INSTRUCTOR_BG = { red: 0.90, green: 0.90, blue: 0.92 };
const NO_INSTRUCTOR_FG = { red: 0.45, green: 0.45, blue: 0.50 };

function hashName(name) {
  let h = 2166136261;
  const s = String(name).trim();
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function luminance({ red, green, blue }) {
  return 0.299 * red + 0.587 * green + 0.114 * blue;
}

export function instructorColorForName(name) {
  const trimmed = String(name || "").trim();
  if (!trimmed) return NO_INSTRUCTOR_BG;
  return VIBRANT_PALETTE[hashName(trimmed) % VIBRANT_PALETTE.length];
}

export function instructorTextColorForName(name) {
  const trimmed = String(name || "").trim();
  if (!trimmed) return NO_INSTRUCTOR_FG;
  const bg = instructorColorForName(trimmed);
  return luminance(bg) > 0.62
    ? { red: 0.12, green: 0.14, blue: 0.20 }
    : { red: 0.98, green: 0.98, blue: 0.98 };
}

export function noInstructorColors() {
  return { background: NO_INSTRUCTOR_BG, foreground: NO_INSTRUCTOR_FG };
}
