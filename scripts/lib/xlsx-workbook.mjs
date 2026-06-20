import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

export function extractXlsx(path) {
  const dir = mkdtempSync(join(tmpdir(), "stream-line-xlsx-"));
  execFileSync("unzip", ["-q", "-o", path, "-d", dir], { stdio: "pipe" });
  return dir;
}

export function readExtractedFile(dir, relPath) {
  return readFileSync(join(dir, relPath), "utf8");
}

export function parseSharedStrings(xml) {
  const strings = [];
  const re = /<si[^>]*>([\s\S]*?)<\/si>/g;
  let m;
  while ((m = re.exec(xml))) {
    const inner = m[1];
    const parts = [...inner.matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map((x) => x[1]);
    strings.push(parts.join(""));
  }
  return strings;
}

export function colToNum(col) {
  let n = 0;
  for (const c of col) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}

export function parseSheet(xml, strings) {
  const rows = new Map();
  const rowRe = /<row[^>]* r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g;
  let rm;
  while ((rm = rowRe.exec(xml))) {
    const ri = Number(rm[1]);
    const cells = {};
    const cellRe = /<c[^>]* r="([A-Z]+\d+)"([^>]*)>(?:<v>([^<]*)<\/v>)?/g;
    let cm;
    while ((cm = cellRe.exec(rm[2]))) {
      const col = cm[1].match(/^([A-Z]+)/)[1];
      const t = /t="([^"]+)"/.exec(cm[2])?.[1];
      const raw = cm[3];
      if (raw == null) continue;
      cells[colToNum(col)] = t === "s" ? strings[Number(raw)] : raw;
    }
    rows.set(ri, cells);
  }
  return rows;
}

export function loadWorkbook(path) {
  const dir = extractXlsx(path);
  try {
    const strings = parseSharedStrings(readExtractedFile(dir, "xl/sharedStrings.xml"));
    const wb = readExtractedFile(dir, "xl/workbook.xml");
    const rels = readExtractedFile(dir, "xl/_rels/workbook.xml.rels");
    const ridMap = Object.fromEntries([...rels.matchAll(/Id="([^"]+)"[^>]*Target="([^"]+)"/g)].map((m) => [m[1], m[2]]));
    const sheets = {};
    for (const m of wb.matchAll(/<sheet[^>]* name="([^"]+)"[^>]*r:id="([^"]+)"/g)) {
      const target = ridMap[m[2]].replace(/^\//, "");
      sheets[m[1]] = parseSheet(readExtractedFile(dir, `xl/${target}`), strings);
    }
    return sheets;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Convert Map<number, Record<number, string>> rows to array-of-arrays (0-indexed cols). */
export function rowsMapToArrays(rows) {
  const out = [];
  const maxRow = Math.max(...rows.keys(), 0);
  for (let r = 1; r <= maxRow; r++) {
    const cells = rows.get(r) || {};
    const maxCol = Math.max(...Object.keys(cells).map(Number), 0);
    const row = [];
    for (let c = 0; c <= maxCol; c++) row[c] = cells[c] ?? "";
    out[r] = row;
  }
  return out;
}
