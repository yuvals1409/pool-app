/**
 * Master sheet row → Supabase sync engine (Node).
 * Ported to Deno in supabase/functions/sync-google-sheets/master-sync.ts
 */

import {
  MASTER_HEADERS,
  HEADER_INDEX,
  RECORD_TYPES,
  arrayToRow,
  membershipFromSheet,
  leadDedupKey,
  emptyMasterRow,
  rowToArray,
  participantFullName,
  splitFullName,
  isEnrollmentType,
} from "./master-sheet-schema.mjs";
import {
  normalizePhone,
  normalizeName,
  normalizeClientId,
  normalizeSheetGender,
  paymentStatusFromSheet,
  birthDateFromAge,
} from "./sheet-normalize.mjs";
import { parseIncomingLeadRows } from "./parse-leads-sheet.mjs";
import { enrichMasterRow, sheetCellValue, buildGroupCatalog } from "./master-sheet-enrich.mjs";
import { syncGroupsTab, GROUPS_TAB, GROUP_SLOTS_TAB } from "./groups-sync.mjs";
import { syncUsersTab, USERS_TAB, PAY_RATES_TAB } from "./users-sync.mjs";
import { randomUUID } from "node:crypto";

export const MASTER_TAB = "מאסטר_סנכרון";
export const INCOMING_LEADS_TAB = "לידים_נכנסים";
export const CONFIG_TAB = "הגדרות";
export const GROUPS_TAB_NAME = GROUPS_TAB;
export const SLOTS_TAB_NAME = GROUP_SLOTS_TAB;
export const USERS_TAB_NAME = USERS_TAB;

export function parseMasterRows(sheetRows, groupCatalog = null) {
  if (!sheetRows?.length || sheetRows.length < 2) return [];
  const header = sheetRows[0].map((h) => String(h).trim());
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  const rows = [];
  for (let i = 1; i < sheetRows.length; i++) {
    const line = sheetRows[i];
    if (!line?.length) continue;
    const cells = MASTER_HEADERS.map((h) => {
      const col = idx[h];
      return col != null ? String(line[col] ?? "").trim() : "";
    });
    const row = enrichMasterRow(arrayToRow(cells), groupCatalog);
    if (!row["מזהה_שורה"] && !row["שם_פרטי"]) continue;
    rows.push({ ...row, _sheetRow: i + 1 });
  }
  return rows;
}

export function isGlobalReady(configRows) {
  if (!configRows?.length) return false;
  for (const row of configRows) {
    if (String(row[0]).includes("מוכן_לסנכרון_כללי") && String(row[1]).trim() === "כן") {
      return true;
    }
  }
  return false;
}

export function mergeIncomingLeads(masterRows, incomingRows) {
  const existing = new Set(
    masterRows
      .filter((r) => r["סוג_רשומה"] === RECORD_TYPES.LEAD)
      .map(leadDedupKey),
  );
  const protectedKeys = new Set(
    masterRows
      .filter((r) => r["סוג_רשומה"] === RECORD_TYPES.LEAD && (r["מוכן_לסנכרון"] === "כן" || r["סונכרן"] === "כן"))
      .map(leadDedupKey),
  );

  const newRows = [...masterRows];
  const leads = parseIncomingLeadRows(incomingRows);

  for (const lead of leads) {
    const draft = emptyMasterRow(randomUUID());
    draft["סוג_רשומה"] = RECORD_TYPES.LEAD;
    draft["מקור_מקורי"] = "tc_leads";
    draft["טלפון_הורה"] = lead.phone;
    const { first, last } = splitFullName(lead.childName);
    draft["שם_פרטי"] = first;
    draft["שם_משפחה"] = last;
    draft["שם_הורה"] = lead.parentName || "";
    draft["גיל"] = lead.age ? String(lead.age) : "";
    draft["תאריך_מבדק"] = lead.slotDate;
    draft["שעת_מבדק"] = String(lead.slotTime).slice(0, 5);
    draft["סטטוס_ליד"] = "new";
    draft["מקור_ליד"] = "tc_leads";
    draft["עונה"] = "קיץ 2026";
    enrichMasterRow(draft);

    const key = leadDedupKey(draft);
    if (existing.has(key) || protectedKeys.has(key)) continue;
    existing.add(key);
    newRows.push(draft);
  }
  return newRows;
}

function cleanClientId(raw) {
  const s = String(raw ?? "").trim().replace(/^'/, "");
  return normalizeClientId(s);
}

async function ensureFamily(supabase, phone, parentName, email, membership) {
  const norm = normalizePhone(phone);
  if (!norm) return null;
  const { tier, isShareholder } = membershipFromSheet(membership);

  const { data: existing } = await supabase.from("families").select("id, is_shareholder").eq("phone", norm).maybeSingle();
  if (existing) {
    const patch = {};
    if (parentName) patch.parent_name = parentName;
    if (email) patch.email = email;
    if (isShareholder && !existing.is_shareholder) patch.is_shareholder = true;
    if (Object.keys(patch).length) {
      await supabase.from("families").update(patch).eq("id", existing.id);
    }
    return existing.id;
  }

  const { data: row, error } = await supabase
    .from("families")
    .insert({
      phone: norm,
      parent_name: parentName || null,
      email: email || null,
      is_shareholder: isShareholder,
    })
    .select("id")
    .single();
  if (error) throw error;
  return row.id;
}

async function upsertParticipant(supabase, { familyId, row }) {
  const clientId = cleanClientId(row["מס_לקוח"]);
  const fullName = normalizeName(participantFullName(row));
  const phone = normalizePhone(row["טלפון_הורה"]);
  const gender = normalizeSheetGender(sheetCellValue(row["מין"]));
  const birthDate = sheetCellValue(row["תאריך_לידה"]) || birthDateFromAge(sheetCellValue(row["גיל"]));
  const { tier } = membershipFromSheet(sheetCellValue(row["דרגת_לקוח"]));

  if (clientId) {
    const { data } = await supabase
      .from("participants")
      .select("id, gender_manual_at, membership_tier")
      .eq("external_client_id", clientId)
      .maybeSingle();
    if (data) {
      const patch = {};
      if (gender && !data.gender_manual_at) patch.gender = gender;
      if (birthDate) patch.birth_date = birthDate;
      if (sheetCellValue(row["כיתה"])) patch.grade = sheetCellValue(row["כיתה"]);
      if (tier) patch.membership_tier = tier;
      if (Object.keys(patch).length) {
        await supabase.from("participants").update(patch).eq("id", data.id);
      }
      return data.id;
    }
  }

  if (familyId && fullName) {
    const { data: parts } = await supabase
      .from("participants")
      .select("id, gender_manual_at, membership_tier")
      .eq("family_id", familyId);
    const match = (parts || []).find(
      (p) => normalizeName(p.full_name).toLowerCase() === fullName.toLowerCase(),
    );
    if (match) {
      const patch = {};
      if (clientId) patch.external_client_id = clientId;
      if (gender && !match.gender_manual_at) patch.gender = gender;
      if (birthDate) patch.birth_date = birthDate;
      if (sheetCellValue(row["כיתה"])) patch.grade = sheetCellValue(row["כיתה"]);
      if (tier) patch.membership_tier = tier;
      if (Object.keys(patch).length) {
        await supabase.from("participants").update(patch).eq("id", match.id);
      }
      return match.id;
    }
  }

  const { data: inserted, error } = await supabase
    .from("participants")
    .insert({
      family_id: familyId,
      full_name: fullName,
      gender,
      birth_date: birthDate,
      grade: sheetCellValue(row["כיתה"]) || null,
      external_client_id: clientId,
      membership_tier: tier || "external",
    })
    .select("id")
    .single();
  if (error) throw error;
  return inserted.id;
}

async function findProductByGroupName(supabase, row) {
  const groupName = sheetCellValue(row["שם_קבוצה"]);
  if (!groupName) return null;

  const { data: byGroupId } = await supabase
    .from("products")
    .select("id")
    .eq("name", groupName)
    .limit(1)
    .maybeSingle();
  if (byGroupId?.id) return byGroupId.id;

  const seasonName = row["עונה"];
  const { data: season } = await supabase.from("seasons").select("id").eq("name", seasonName).maybeSingle();
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

function assessmentResultFromSheet(val) {
  const s = String(val ?? "").trim();
  if (/עבר|passed/i.test(s)) return "passed";
  if (/נכשל|failed/i.test(s)) return "failed";
  if (/לא הגיע|no_show|no show/i.test(s)) return "no_show";
  if (/ממתין|pending/i.test(s)) return "pending";
  return null;
}

async function reconcileEnrollment(supabase, {
  participantId,
  productId,
  paymentStatus,
  validFrom,
  validUntil,
  active,
  notes,
  masterRowId,
}) {
  const { data: existing } = await supabase
    .from("enrollments")
    .select("id, active")
    .eq("participant_id", participantId)
    .eq("product_id", productId)
    .maybeSingle();

  if (existing) {
    await supabase.from("enrollments").update({
      payment_status: paymentStatus,
      valid_from: validFrom,
      valid_until: validUntil,
      active,
      notes: notes || null,
      cancelled_at: active ? null : new Date().toISOString(),
    }).eq("id", existing.id);
    return existing.id;
  }

  if (!active) return null;

  const { data: inserted, error } = await supabase
    .from("enrollments")
    .insert({
      participant_id: participantId,
      product_id: productId,
      payment_status: paymentStatus,
      valid_from: validFrom,
      valid_until: validUntil,
      active: true,
      notes: notes || null,
    })
    .select("id")
    .single();
  if (error) throw error;

  await supabase.from("sheet_row_links").upsert({
    sheet_tab: MASTER_TAB,
    row_key: masterRowId,
    master_row_id: masterRowId,
    entity_type: "enrollment",
    entity_id: inserted.id,
    updated_at: new Date().toISOString(),
  }, { onConflict: "sheet_tab,row_key" });

  return inserted.id;
}

async function syncLeadRow(supabase, row) {
  const phone = normalizePhone(row["טלפון_הורה"]);
  const familyId = await ensureFamily(supabase, phone, row["שם_הורה"], row["אימייל"], row["דרגת_לקוח"]);
  if (!familyId) throw new Error("missing_phone");

  const participantId = await upsertParticipant(supabase, { familyId, row });
  const source = row["מקור_ליד"] || "tc_leads";

  const { data: existingLead } = await supabase
    .from("assessment_leads")
    .select("id, status")
    .eq("participant_id", participantId)
    .order("created_at", { ascending: false })
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
  } else {
    const patch = {};
    if (row["סטטוס_ליד"]) patch.status = row["סטטוס_ליד"];
    if (row["הערות_ליד"]) patch.notes = row["הערות_ליד"];
    if (Object.keys(patch).length) {
      await supabase.from("assessment_leads").update(patch).eq("id", existingLead.id);
    }
  }

  if (row["תוצאת_מבדק"] || row["נוכחות_מבדק"] === "לא") {
    const result = row["נוכחות_מבדק"] === "לא"
      ? "no_show"
      : assessmentResultFromSheet(row["תוצאת_מבדק"]);
    if (result) {
      const patch = { assessment_result: result };
      if (result === "no_show") patch.status = "abandoned";
      if (result === "passed") patch.status = "passed";
      await supabase.from("assessment_leads").update(patch).eq("participant_id", participantId);
    }
  }

  const slotDate = row["תאריך_מבדק"];
  const slotTime = row["שעת_מבדק"] ? `${row["שעת_מבדק"]}:00`.slice(0, 8) : "16:00:00";
  if (slotDate) {
    let { data: slot } = await supabase
      .from("assessment_slots")
      .select("id")
      .eq("slot_date", slotDate)
      .eq("start_time", slotTime)
      .maybeSingle();
    if (!slot) {
      const { data: created } = await supabase
        .from("assessment_slots")
        .insert({ slot_date: slotDate, start_time: slotTime, capacity: 10 })
        .select("id")
        .single();
      slot = created;
      if (slot?.id) {
        await supabase.rpc("sync_assessment_slot_session", { p_slot_id: slot.id });
      }
    }
    if (slot?.id) {
      await supabase
        .from("assessment_leads")
        .update({ slot_id: slot.id, status: row["סטטוס_ליד"] === "new" ? "registered_assessment" : row["סטטוס_ליד"] })
        .eq("participant_id", participantId)
        .is("slot_id", null);
    }
  }

  return participantId;
}

async function syncEnrollmentRow(supabase, row) {
  const phone = normalizePhone(row["טלפון_הורה"]);
  const familyId = await ensureFamily(supabase, phone, row["שם_הורה"], row["אימייל"], row["דרגת_לקוח"]);
  if (!familyId) throw new Error("missing_phone");

  const participantId = await upsertParticipant(supabase, { familyId, row });
  const productId = await findProductByGroupName(supabase, row);
  if (!productId) throw new Error(`product_not_found:${row["שם_קבוצה"]}`);

  const paymentStatus = paymentStatusFromSheet(row["סטטוס_תשלום"]);
  const active = row["פעיל"] !== "לא";

  return reconcileEnrollment(supabase, {
    participantId,
    productId,
    paymentStatus,
    validFrom: row["מתאריך"],
    validUntil: row["עד_תאריך"],
    active,
    notes: row["הערות"],
    masterRowId: row["מזהה_שורה"],
  });
}

async function syncMasterRow(supabase, row, { dryRun = false } = {}) {
  if (row["מוכן_לסנכרון"] !== "כן") {
    return { skipped: true, reason: "not_ready" };
  }

  if (dryRun) {
    return { ok: true, dryRun: true, type: row["סוג_רשומה"] };
  }

  try {
    let entityId;
    switch (row["סוג_רשומה"]) {
      case RECORD_TYPES.LEAD:
        entityId = await syncLeadRow(supabase, row);
        break;
      case RECORD_TYPES.ANNUAL_ONCE:
      case RECORD_TYPES.ANNUAL_TWICE:
      case RECORD_TYPES.SUMMER_COURSE:
        entityId = await syncEnrollmentRow(supabase, row);
        break;
      default:
        if (isEnrollmentType(row["סוג_רשומה"])) {
          entityId = await syncEnrollmentRow(supabase, row);
          break;
        }
        throw new Error(`unknown_record_type:${row["סוג_רשומה"]}`);
    }
    return { ok: true, entityId };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

export async function runFullSheetSync({
  supabase,
  groupsRows,
  slotsRows,
  usersRows,
  payRatesRows,
  masterRows,
  globalReady,
  dryRun = false,
}) {
  const groupsResult = await syncGroupsTab(supabase, {
    groupsRows,
    slotsRows,
    dryRun,
  });

  const usersResult = await syncUsersTab(supabase, {
    usersRows,
    payRatesRows,
    dryRun,
  });

  const masterResult = await runMasterSync({
    supabase,
    masterRows,
    globalReady,
    dryRun,
  });

  return { groups: groupsResult, users: usersResult, master: masterResult };
}

export async function runMasterSync({
  supabase,
  masterRows,
  globalReady,
  dryRun = false,
}) {
  const results = {
    merged: 0,
    synced: 0,
    skipped: 0,
    failed: 0,
    errors: [],
    rowUpdates: [],
  };

  if (!globalReady) {
    return { ...results, blocked: true, reason: "global_not_ready" };
  }

  const readyRows = masterRows.filter((r) => r["מוכן_לסנכרון"] === "כן");

  for (const row of readyRows) {
    const outcome = await syncMasterRow(supabase, row, { dryRun });
    if (outcome.skipped) {
      results.skipped++;
      continue;
    }
    if (outcome.ok) {
      results.synced++;
      results.rowUpdates.push({
        sheetRow: row._sheetRow,
        masterRowId: row["מזהה_שורה"],
        synced: "כן",
        syncedAt: new Date().toISOString(),
        error: "",
      });
    } else {
      results.failed++;
      results.errors.push({ row: row["מזהה_שורה"], error: outcome.error });
      results.rowUpdates.push({
        sheetRow: row._sheetRow,
        masterRowId: row["מזהה_שורה"],
        synced: row["סונכרן"] || "לא",
        syncedAt: row["תאריך_סנכרון"] || "",
        error: outcome.error,
      });
    }
  }

  return results;
}

export function applyRowSyncUpdates(masterSheetRows, updates) {
  const syncedIdx = HEADER_INDEX["סונכרן"];
  const dateIdx = HEADER_INDEX["תאריך_סנכרון"];
  const errIdx = HEADER_INDEX["שגיאת_סנכרון"];
  const out = masterSheetRows.map((r) => [...r]);

  for (const u of updates) {
    const line = out[u.sheetRow - 1];
    if (!line) continue;
    line[syncedIdx] = u.synced;
    line[dateIdx] = u.syncedAt;
    line[errIdx] = u.error || "";
  }
  return out;
}

export { rowToArray, MASTER_HEADERS };
