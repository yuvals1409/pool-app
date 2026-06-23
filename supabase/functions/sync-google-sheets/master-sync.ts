import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  enrichMasterSheetData,
  enrichMasterRow,
  sheetCellValue,
  MASTER_HEADERS,
  participantFullName,
  splitFullName,
} from "./master-enrich.ts";
import { syncGroupsTab, GROUPS_TAB, GROUP_SLOTS_TAB } from "./groups-sync.ts";
import { syncUsersTab, USERS_TAB, PAY_RATES_TAB } from "./users-sync.ts";

export const MASTER_TAB = "מאסטר_סנכרון";
export const INCOMING_LEADS_TAB = "לידים_נכנסים";
export const INCOMING_LEADS_SOURCE_TAB = "מבדק שחיה 2026";
export const CONFIG_TAB = "הגדרות";

const RECORD_TYPES = {
  LEAD: "ליד",
  ANNUAL_ONCE: "הרשמה_שנתית_פעם_בשבוע",
  ANNUAL_TWICE: "הרשמה_שנתית_פעמיים_בשבוע",
  SUMMER_COURSE: "קורס_קיץ",
};

const HEADER_INDEX = Object.fromEntries(MASTER_HEADERS.map((h, i) => [h, i]));

function normalizePhone(raw: string) {
  if (!raw) return "";
  let s = String(raw).replace(/\s/g, "").trim();
  if (s.startsWith("5") && s.length === 9) s = `0${s}`;
  return s;
}

function normalizeName(raw: string) {
  return String(raw ?? "").replace(/\s+/g, " ").trim();
}

function normalizeClientId(raw: string) {
  const s = String(raw ?? "").trim().replace(/^'/, "");
  if (!s) return null;
  if (/e/i.test(s)) {
    const n = Number(s);
    if (Number.isFinite(n)) return String(Math.round(n));
  }
  return s.replace(/\.0$/, "");
}

function normalizeSheetGender(raw: string) {
  const s = String(raw ?? "").trim().toLowerCase();
  if (["male", "m", "ז'", "זכר", "ז"].includes(s)) return "male";
  if (["female", "f", "נ'", "נקבה", "נ"].includes(s)) return "female";
  return null;
}

function paymentStatusFromSheet(val: string) {
  const s = String(val ?? "").trim();
  if (/^(1|כן|שולם|paid|true)$/i.test(s)) return "paid";
  if (/פטור|waived/i.test(s)) return "waived";
  return "unpaid";
}

function membershipFromSheet(label: string) {
  const s = String(label ?? "").trim();
  if (/בעל|מניות/i.test(s)) return { tier: "external", isShareholder: true };
  if (/מנוי/i.test(s)) return { tier: "subscriber", isShareholder: false };
  return { tier: "external", isShareholder: false };
}

export function parseMasterRows(sheetRows: string[][]) {
  if (!sheetRows?.length || sheetRows.length < 2) return [] as Record<string, string>[];
  const header = sheetRows[0].map((h) => String(h).trim());
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  const rows: (Record<string, string> & { _sheetRow?: number })[] = [];
  for (let i = 1; i < sheetRows.length; i++) {
    const line = sheetRows[i];
    if (!line?.length) continue;
    const row: Record<string, string> = {};
    for (const h of MASTER_HEADERS) {
      const col = idx[h];
      row[h] = col != null ? String(line[col] ?? "").trim() : "";
    }
    if (!row["מזהה_שורה"] && !row["שם_פרטי"]) continue;
    enrichMasterRow(row);
    row._sheetRow = i + 1;
    rows.push(row);
  }
  return rows;
}

export function isGlobalReady(configRows: string[][]) {
  if (!configRows?.length) return false;
  for (const row of configRows) {
    if (String(row[0]).includes("מוכן_לסנכרון_כללי") && String(row[1]).trim() === "כן") return true;
  }
  return false;
}

function leadDedupKey(row: Record<string, string>) {
  return `${row["טלפון_הורה"]}|${row["תאריך_מבדק"]}|${participantFullName(row)}`.toLowerCase();
}

function parseLeadSlotDate(raw: string, defaultYear = 2026) {
  if (!raw) return null;
  const n = Number(raw);
  if (Number.isFinite(n) && n > 0 && n < 100000) {
    const d = new Date(Date.UTC(1899, 11, 30) + n * 86400000);
    return d.toISOString().slice(0, 10);
  }
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (m) return `${defaultYear}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

function parseIncomingLeadRows(rows: string[][]) {
  if (!rows?.length || rows.length < 2) return [] as Record<string, string>[];
  const header = rows[0].map((h) => String(h).trim().toLowerCase());
  const dateIdx = header.findIndex((h) => h.includes("תאריך") || h.includes("date"));
  const childIdx = header.findIndex((h) => h.includes("ילד") || (h.includes("שם") && !h.includes("הורה")));
  const ageIdx = header.findIndex((h) => h.includes("גיל"));
  const parentIdx = header.findIndex((h) => h.includes("הורה"));
  const phoneIdx = header.findIndex((h) => h.includes("טלפון") || h.includes("phone"));
  const out: Record<string, string>[] = [];

  for (let i = 1; i < rows.length; i++) {
    const line = rows[i];
    if (!line?.length) continue;
    const get = (idx: number, fallback: number) => (idx >= 0 ? line[idx] : line[fallback]);
    const slotDate = parseLeadSlotDate(String(get(dateIdx, 0) || ""));
    const phone = normalizePhone(String(get(phoneIdx, 5) || ""));
    if (!slotDate || !phone) continue;
    const childName = normalizeName(String(get(childIdx, 1) || ""));
    const parentName = normalizeName(String(get(parentIdx, 4) || ""));
    const { first, last } = splitFullName(childName || (parentName ? `${parentName} (מבדק)` : `מבדק שורה ${i + 1}`));
    out.push({
      "סוג_רשומה": RECORD_TYPES.LEAD,
      "מקור_מקורי": "tc_leads",
      "טלפון_הורה": phone,
      "שם_פרטי": first,
      "שם_משפחה": last,
      "שם_הורה": parentName,
      "גיל": ageIdx >= 0 ? String(line[ageIdx] ?? "") : String(line[2] ?? ""),
      "תאריך_מבדק": slotDate,
      "שעת_מבדק": "16:00",
      "סטטוס_ליד": "new",
      "מקור_ליד": "tc_leads",
      "עונה": "קיץ 2026",
      "פעיל": "כן",
      "מוכן_לסנכרון": "לא",
      "סונכרן": "לא",
    });
  }
  return out;
}

export function mergeIncomingLeadsIntoMaster(masterSheetRows: string[][], incomingRows: string[][]) {
  const masterRows = parseMasterRows(masterSheetRows);
  const existing = new Set(
    masterRows.filter((r) => r["סוג_רשומה"] === RECORD_TYPES.LEAD).map(leadDedupKey),
  );
  const protectedKeys = new Set(
    masterRows
      .filter((r) => r["סוג_רשומה"] === RECORD_TYPES.LEAD && (r["מוכן_לסנכרון"] === "כן" || r["סונכרן"] === "כן"))
      .map(leadDedupKey),
  );

  const incoming = parseIncomingLeadRows(incomingRows);
  let added = 0;
  const newDataRows: string[][] = [];

  for (const draft of incoming) {
    const key = leadDedupKey(draft);
    if (existing.has(key) || protectedKeys.has(key)) continue;
    existing.add(key);
    draft["מזהה_שורה"] = crypto.randomUUID();
    enrichMasterRow(draft);
    const cells = MASTER_HEADERS.map((h) => draft[h] || "");
    newDataRows.push(cells);
    added++;
  }

  if (!added) return { masterSheetRows, added: 0 };

  const out = [...masterSheetRows, ...newDataRows];
  return { masterSheetRows: out, added };
}

export function masterRowsToSheetArray(rows: Record<string, string>[]) {
  return [MASTER_HEADERS, ...rows.map((r) => MASTER_HEADERS.map((h) => r[h] || ""))];
}

async function pushWebsiteLeadsToMaster(supabase: SupabaseClient, masterSheetRows: string[][]) {
  const masterRows = parseMasterRows(masterSheetRows);
  const existing = new Set(masterRows.map(leadDedupKey));

  const { data: leads } = await supabase
    .from("assessment_leads")
    .select(`
      id, status, source, created_at, child_age,
      participant:participants(full_name, family:families(phone, parent_name))
    `)
    .eq("source", "website")
    .order("created_at", { ascending: false })
    .limit(100);

  const newRows: string[][] = [];
  for (const lead of leads || []) {
    const phone = normalizePhone(lead.participant?.family?.phone || "");
    const childName = lead.participant?.full_name || "";
    if (!phone || !childName) continue;
    const { first, last } = splitFullName(childName);
    const draft: Record<string, string> = {
      "סוג_רשומה": RECORD_TYPES.LEAD,
      "מקור_מקורי": "מערכת",
      "מזהה_שורה": crypto.randomUUID(),
      "טלפון_הורה": phone,
      "שם_פרטי": first,
      "שם_משפחה": last,
      "שם_הורה": lead.participant?.family?.parent_name || "",
      "גיל": lead.child_age ? String(lead.child_age) : "",
      "תאריך_מבדק": String(lead.created_at || "").slice(0, 10),
      "שעת_מבדק": "16:00",
      "סטטוס_ליד": lead.status || "new",
      "מקור_ליד": "website",
      "מוכן_לסנכרון": "לא",
      "סונכרן": "לא",
      "פעיל": "כן",
    };
    enrichMasterRow(draft);
    const key = leadDedupKey(draft);
    if (existing.has(key)) continue;
    existing.add(key);
    newRows.push(MASTER_HEADERS.map((h) => draft[h] || ""));
  }

  if (!newRows.length) return { masterSheetRows, pushed: 0 };
  return { masterSheetRows: [...masterSheetRows, ...newRows], pushed: newRows.length };
}

async function ensureFamily(
  supabase: SupabaseClient,
  phone: string,
  parentName: string,
  email: string,
  membership: string,
) {
  const norm = normalizePhone(phone);
  if (!norm) return null;
  const { isShareholder } = membershipFromSheet(membership);
  const { data: existing } = await supabase.from("families").select("id, is_shareholder").eq("phone", norm).maybeSingle();
  if (existing) {
    const patch: Record<string, unknown> = {};
    if (parentName) patch.parent_name = parentName;
    if (email) patch.email = email;
    if (isShareholder && !existing.is_shareholder) patch.is_shareholder = true;
    if (Object.keys(patch).length) await supabase.from("families").update(patch).eq("id", existing.id);
    return existing.id;
  }
  const { data: row, error } = await supabase
    .from("families")
    .insert({ phone: norm, parent_name: parentName || null, email: email || null, is_shareholder: isShareholder })
    .select("id")
    .single();
  if (error) throw error;
  return row.id;
}

async function upsertParticipant(supabase: SupabaseClient, familyId: string, row: Record<string, string>) {
  const clientId = normalizeClientId(row["מס_לקוח"]);
  const fullName = normalizeName(participantFullName(row));
  const gender = normalizeSheetGender(row["מין"]);
  const { tier } = membershipFromSheet(row["דרגת_לקוח"]);

  if (clientId) {
    const { data } = await supabase.from("participants").select("id, gender_manual_at").eq("external_client_id", clientId).maybeSingle();
    if (data) {
      const patch: Record<string, unknown> = {};
      if (gender && !data.gender_manual_at) patch.gender = gender;
      if (row["כיתה"]) patch.grade = row["כיתה"];
      if (tier) patch.membership_tier = tier;
      if (Object.keys(patch).length) await supabase.from("participants").update(patch).eq("id", data.id);
      return data.id;
    }
  }

  const { data: parts } = await supabase.from("participants").select("id, gender_manual_at").eq("family_id", familyId);
  const match = (parts || []).find((p) => normalizeName(p.full_name).toLowerCase() === fullName.toLowerCase());
  if (match) {
    const patch: Record<string, unknown> = {};
    if (clientId) patch.external_client_id = clientId;
    if (gender && !match.gender_manual_at) patch.gender = gender;
    if (Object.keys(patch).length) await supabase.from("participants").update(patch).eq("id", match.id);
    return match.id;
  }

  const { data: inserted, error } = await supabase
    .from("participants")
    .insert({
      family_id: familyId,
      full_name: fullName,
      gender,
      grade: row["כיתה"] || null,
      external_client_id: clientId,
      membership_tier: tier || "external",
    })
    .select("id")
    .single();
  if (error) throw error;
  return inserted.id;
}

async function findProductByGroupName(supabase: SupabaseClient, row: Record<string, string>) {
  const groupName = sheetCellValue(row["שם_קבוצה"]);
  if (!groupName) return null;
  const { data: season } = await supabase.from("seasons").select("id").eq("name", row["עונה"]).maybeSingle();
  if (!season) return null;
  const { data } = await supabase
    .from("products")
    .select("id")
    .eq("season_id", season.id)
    .eq("name", groupName)
    .limit(1)
    .maybeSingle();
  return data?.id || null;
}

function assessmentResultFromSheet(val: string) {
  const s = String(val ?? "").trim();
  if (/עבר|passed/i.test(s)) return "passed";
  if (/נכשל|failed/i.test(s)) return "failed";
  if (/לא הגיע|no_show/i.test(s)) return "no_show";
  if (/ממתין|pending/i.test(s)) return "pending";
  return null;
}

async function syncEnrollmentRow(supabase: SupabaseClient, row: Record<string, string>) {
  const familyId = await ensureFamily(supabase, row["טלפון_הורה"], row["שם_הורה"], row["אימייל"], row["דרגת_לקוח"]);
  if (!familyId) throw new Error("missing_phone");
  const participantId = await upsertParticipant(supabase, familyId, row);
  const productId = await findProductByGroupName(supabase, row);
  if (!productId) throw new Error(`product_not_found:${row["שם_קבוצה"]}`);

  const paymentStatus = paymentStatusFromSheet(row["סטטוס_תשלום"]);
  const active = row["פעיל"] !== "לא";

  const { data: existing } = await supabase
    .from("enrollments")
    .select("id")
    .eq("participant_id", participantId)
    .eq("product_id", productId)
    .maybeSingle();

  if (existing) {
    await supabase.from("enrollments").update({
      payment_status: paymentStatus,
      valid_from: row["מתאריך"],
      valid_until: row["עד_תאריך"],
      active,
      notes: row["הערות"] || null,
      cancelled_at: active ? null : new Date().toISOString(),
    }).eq("id", existing.id);
    return existing.id;
  }
  if (!active) return null;

  const { data: inserted, error } = await supabase.from("enrollments").insert({
    participant_id: participantId,
    product_id: productId,
    payment_status: paymentStatus,
    valid_from: row["מתאריך"],
    valid_until: row["עד_תאריך"],
    active: true,
    notes: row["הערות"] || null,
  }).select("id").single();
  if (error) throw error;

  await supabase.from("sheet_row_links").upsert({
    sheet_tab: MASTER_TAB,
    row_key: row["מזהה_שורה"],
    master_row_id: row["מזהה_שורה"],
    entity_type: "enrollment",
    entity_id: inserted.id,
    updated_at: new Date().toISOString(),
  }, { onConflict: "sheet_tab,row_key" });

  return inserted.id;
}

async function syncLeadRow(supabase: SupabaseClient, row: Record<string, string>) {
  const familyId = await ensureFamily(supabase, row["טלפון_הורה"], row["שם_הורה"], row["אימייל"], row["דרגת_לקוח"]);
  if (!familyId) throw new Error("missing_phone");
  const participantId = await upsertParticipant(supabase, familyId, row);
  const source = row["מקור_ליד"] || "tc_leads";

  const { data: existingLead } = await supabase
    .from("assessment_leads")
    .select("id")
    .eq("participant_id", participantId)
    .limit(1)
    .maybeSingle();

  if (!existingLead) {
    const { error } = await supabase.from("assessment_leads").insert({
      participant_id: participantId,
      child_age: row["גיל"] ? Number(row["גיל"]) : null,
      status: row["סטטוס_ליד"] || "new",
      source,
      notes: row["הערות_ליד"] || null,
    });
    if (error) throw error;
  }

  const result = row["נוכחות_מבדק"] === "לא"
    ? "no_show"
    : assessmentResultFromSheet(row["תוצאת_מבדק"]);
  if (result) {
    const patch: Record<string, string> = { assessment_result: result };
    if (result === "no_show") patch.status = "abandoned";
    if (result === "passed") patch.status = "passed";
    await supabase.from("assessment_leads").update(patch).eq("participant_id", participantId);
  }

  return participantId;
}

async function syncMasterRow(supabase: SupabaseClient, row: Record<string, string>) {
  if (row["מוכן_לסנכרון"] !== "כן") return { skipped: true };
  switch (row["סוג_רשומה"]) {
    case RECORD_TYPES.LEAD:
      await syncLeadRow(supabase, row);
      break;
    case RECORD_TYPES.ANNUAL_ONCE:
    case RECORD_TYPES.ANNUAL_TWICE:
    case RECORD_TYPES.SUMMER_COURSE:
      await syncEnrollmentRow(supabase, row);
      break;
    default:
      throw new Error(`unsupported_type:${row["סוג_רשומה"]}`);
  }
  return { ok: true };
}

export function applyRowSyncUpdates(masterSheetRows: string[][], updates: { sheetRow: number; synced: string; syncedAt: string; error: string }[]) {
  const out = masterSheetRows.map((r) => [...r]);
  for (const u of updates) {
    const line = out[u.sheetRow - 1];
    if (!line) continue;
    line[HEADER_INDEX["סונכרן"]] = u.synced;
    line[HEADER_INDEX["תאריך_סנכרון"]] = u.syncedAt;
    line[HEADER_INDEX["שגיאת_סנכרון"]] = u.error || "";
  }
  return out;
}

export async function runMasterSheetSync(
  supabase: SupabaseClient,
  masterSheetRows: string[][],
  configRows: string[][],
  writeTab: (tab: string, rows: string[][]) => Promise<void>,
  incomingLeadRows: string[][] = [],
  groupsRows: string[][] = [],
  slotsRows: string[][] = [],
  usersRows: string[][] = [],
  payRatesRows: string[][] = [],
) {
  const globalReady = isGlobalReady(configRows);

  const groupsResult = groupsRows.length
    ? await syncGroupsTab(supabase, groupsRows, slotsRows)
    : { synced: 0, failed: 0, errors: [] };

  const usersResult = usersRows.length
    ? await syncUsersTab(supabase, usersRows, payRatesRows)
    : { synced: 0, failed: 0, errors: [] };

  const enriched = enrichMasterSheetData(masterSheetRows);
  let workingRows = enriched.rows;
  if (enriched.changed) {
    await writeTab(MASTER_TAB, workingRows);
  }

  const merged = mergeIncomingLeadsIntoMaster(workingRows, incomingLeadRows);
  workingRows = merged.masterSheetRows;
  if (merged.added > 0) {
    await writeTab(MASTER_TAB, workingRows);
  }

  const pushed = await pushWebsiteLeadsToMaster(supabase, workingRows);
  workingRows = pushed.masterSheetRows;
  if (pushed.pushed > 0) {
    await writeTab(MASTER_TAB, workingRows);
  }

  const masterRows = parseMasterRows(workingRows);
  const results = {
    globalReady,
    groups: groupsResult,
    users: usersResult,
    mergedLeads: merged.added,
    pushedWebsiteLeads: pushed.pushed,
    synced: 0,
    failed: 0,
    skipped: 0,
    errors: [] as { row: string; error: string }[],
    rowUpdates: [] as { sheetRow: number; synced: string; syncedAt: string; error: string }[],
  };

  if (!globalReady) {
    return { ...results, blocked: true };
  }

  for (const row of masterRows) {
    if (row["מוכן_לסנכרון"] !== "כן") {
      results.skipped++;
      continue;
    }
    try {
      await syncMasterRow(supabase, row);
      results.synced++;
      results.rowUpdates.push({
        sheetRow: row._sheetRow!,
        synced: "כן",
        syncedAt: new Date().toISOString(),
        error: "",
      });
    } catch (e) {
      results.failed++;
      const msg = e instanceof Error ? e.message : String(e);
      results.errors.push({ row: row["מזהה_שורה"], error: msg });
      results.rowUpdates.push({
        sheetRow: row._sheetRow!,
        synced: row["סונכרן"] || "לא",
        syncedAt: row["תאריך_סנכרון"] || "",
        error: msg,
      });
    }
  }

  if (results.rowUpdates.length) {
    const updated = applyRowSyncUpdates(workingRows, results.rowUpdates);
    await writeTab(MASTER_TAB, updated);
  }

  await supabase.from("master_sheet_config").upsert({
    id: 1,
    spreadsheet_id: Deno.env.get("SHEETS_SPREADSHEET_ID") || null,
    leads_spreadsheet_id: Deno.env.get("SHEETS_LEADS_SPREADSHEET_ID") || null,
    global_ready: globalReady,
    last_sync_at: new Date().toISOString(),
    last_sync_status: results.failed ? "partial" : "ok",
    updated_at: new Date().toISOString(),
  });

  return results;
}
