import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { runMasterSheetSync, MASTER_TAB, CONFIG_TAB, INCOMING_LEADS_TAB } from "./master-sync.ts";
import { GROUPS_TAB, GROUP_SLOTS_TAB } from "./groups-sync.ts";
import { USERS_TAB, PAY_RATES_TAB } from "./users-sync.ts";

const MONTHLY_TABS = ["מאי", "יוני", "יולי"];
const ANNUAL_DAY_TABS = ["שני", "שלישי", "רביעי", "חמישי", "שישי"];
const SUMMER_TABS = ["לימוד (מאי)", "לימוד (יוני)", "לימוד (יולי)"];

function normalizeSheetGender(raw: string) {
  const s = String(raw ?? "").trim().toLowerCase();
  if (!s) return null;
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

async function findParticipantForRow(
  supabase: ReturnType<typeof createClient>,
  { clientId, childName, phone }: { clientId: string; childName: string; phone: string },
) {
  if (clientId) {
    const { data } = await supabase
      .from("participants")
      .select("id, gender_manual_at, family_id, full_name")
      .eq("external_client_id", clientId)
      .maybeSingle();
    if (data) return data;
  }
  if (phone && childName) {
    const { data: fam } = await supabase.from("families").select("id").eq("phone", phone).maybeSingle();
    if (fam) {
      const { data: parts } = await supabase
        .from("participants")
        .select("id, gender_manual_at, family_id, full_name")
        .eq("family_id", fam.id);
      const match = (parts || []).find(
        (p) => p.full_name?.trim().toLowerCase() === childName.trim().toLowerCase(),
      );
      if (match) return match;
    }
  }
  const { data: byName } = await supabase
    .from("participants")
    .select("id, gender_manual_at, family_id, full_name")
    .eq("full_name", childName)
    .limit(1)
    .maybeSingle();
  return byName;
}

function base64url(data: Uint8Array | string) {
  const str = typeof data === "string" ? data : String.fromCharCode(...data);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function getGoogleAccessToken(serviceAccount: { client_email: string; private_key: string }) {
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const claim = base64url(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(serviceAccount.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(`${header}.${claim}`),
  );
  const jwt = `${header}.${claim}.${base64url(new Uint8Array(sig))}`;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const json = await res.json();
  if (!json.access_token) throw new Error(json.error || "google_auth_failed");
  return json.access_token as string;
}

function pemToArrayBuffer(pem: string) {
  const b64 = pem.replace(/-----[^-]+-----/g, "").replace(/\s/g, "");
  const raw = atob(b64);
  const buf = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i);
  return buf.buffer;
}

async function readSheetTab(token: string, spreadsheetId: string, tab: string) {
  const range = encodeURIComponent(`${tab}!A:Z`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`sheet_read_failed:${tab}`);
  const json = await res.json();
  return (json.values || []) as string[][];
}

async function writeSheetTab(
  token: string,
  spreadsheetId: string,
  tab: string,
  rows: string[][],
) {
  const range = encodeURIComponent(`${tab}!A1`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueInputOption=USER_ENTERED`;
  const res = await fetch(url, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ values: rows }),
  });
  if (!res.ok) throw new Error(`sheet_write_failed:${tab}`);
}

function hashRow(cells: string[]) {
  return cells.join("|");
}

async function syncTabPull(supabase: ReturnType<typeof createClient>, tab: string, rows: string[][]) {
  if (rows.length < 2) return { rows_in: 0, rows_out: 0, errors: [] as string[] };
  const header = rows[0].map((h) => String(h).trim().toLowerCase());
  const phoneIdx = header.findIndex((h) => h.includes("טלפון") || h.includes("phone"));
  const childIdx = header.findIndex((h) => h.includes("ילד") || h.includes("שם"));
  const clientIdx = header.findIndex((h) => h.includes("לקוח") || h.includes("client"));
  const genderIdx = header.findIndex((h) => h.includes("מין") || h.includes("gender"));
  const paidIdx = header.findIndex((h) => h.includes("שולם") || h.includes("paid"));
  const attendIdx = header.findIndex((h) => h.includes("נוכחות") || h.includes("attendance"));
  const assessIdx = header.findIndex((h) => h.includes("מבדק") || h.includes("assessment"));
  let rowsIn = 0;
  const errors: string[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row?.length) continue;
    const rowKey = `${tab}:${i}`;
    const contentHash = hashRow(row);
    const phone = phoneIdx >= 0 ? String(row[phoneIdx] || "").replace(/\s/g, "") : "";
    const childName = childIdx >= 0 ? String(row[childIdx] || "").trim() : "";
    const clientId = clientIdx >= 0 ? String(row[clientIdx] || "").trim() : "";

    const part = childName
      ? await findParticipantForRow(supabase, { clientId, childName, phone })
      : null;

    if (genderIdx >= 0 && part?.id) {
      const gender = normalizeSheetGender(String(row[genderIdx] || ""));
      if (gender && !part.gender_manual_at) {
        await supabase.from("participants").update({ gender }).eq("id", part.id);
        rowsIn++;
      }
    }

    if (paidIdx >= 0 && part?.id) {
      const status = paymentStatusFromSheet(String(row[paidIdx] || ""));
      const { data: enrs } = await supabase
        .from("enrollments")
        .select("id")
        .eq("participant_id", part.id)
        .eq("active", true)
        .limit(1);
      const enrollmentId = enrs?.[0]?.id;
      if (enrollmentId) {
        await supabase.from("enrollments").update({ payment_status: status }).eq("id", enrollmentId);
        rowsIn++;
      }
    }

    if (paidIdx >= 0 && phone && childName && !part) {
      const paidVal = String(row[paidIdx] || "").trim();
      const status = paymentStatusFromSheet(paidVal);
      const { data: parts } = await supabase
        .from("participants")
        .select("id, enrollments(id, active)")
        .eq("full_name", childName)
        .limit(1);
      const enrollmentId = parts?.[0]?.enrollments?.find((e: { active: boolean }) => e.active)?.id;
      if (enrollmentId) {
        await supabase.from("enrollments").update({ payment_status: status }).eq("id", enrollmentId);
        rowsIn++;
      }
    }

    if (assessIdx >= 0 && childName) {
      const resultVal = String(row[assessIdx] || "").trim().toLowerCase();
      let result: string | null = null;
      if (/עבר|passed/.test(resultVal)) result = "passed";
      if (/נכשל|failed/.test(resultVal)) result = "failed";
      if (result) {
        const { data: part } = await supabase
          .from("participants")
          .select("id")
          .eq("full_name", childName)
          .maybeSingle();
        if (part?.id) {
          await supabase.from("assessment_leads")
            .update({ assessment_result: result })
            .eq("participant_id", part.id);
          rowsIn++;
        }
      }
    }

    await supabase.from("sheet_row_links").upsert({
      sheet_tab: tab,
      row_key: rowKey,
      entity_type: "row",
      entity_id: crypto.randomUUID(),
      content_hash: contentHash,
      updated_at: new Date().toISOString(),
    }, { onConflict: "sheet_tab,row_key" });
  }

  return { rows_in: rowsIn, rows_out: 0, errors };
}

async function syncTabPush(supabase: ReturnType<typeof createClient>, tab: string) {
  const { data: enrollments } = await supabase
    .from("enrollments")
    .select(`
      payment_status, active,
      participant:participants(full_name, family:families(phone)),
      product:products(name)
    `)
    .eq("active", true)
    .limit(500);

  const header = ["טלפון הורה", "שם ילד", "חוג", "שולם", "נוכחות", "מבדק"];
  const out: string[][] = [header];
  for (const e of enrollments || []) {
    out.push([
      e.participant?.family?.phone || "",
      e.participant?.full_name || "",
      e.product?.name || "",
      e.payment_status === "paid" ? "שולם" : "לא שולם",
      "",
      "",
    ]);
  }
  return { rows: out, rows_out: out.length - 1 };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  const { direction = "both", tabs, mode = "monthly" } = await req.json().catch(() => ({}));
  const spreadsheetId = Deno.env.get("SHEETS_SPREADSHEET_ID");
  const saJson = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");

  if (!spreadsheetId || !saJson) {
    return new Response(JSON.stringify({
      ok: false,
      message: "Configure SHEETS_SPREADSHEET_ID and GOOGLE_SERVICE_ACCOUNT_JSON in Edge Function secrets",
    }), { status: 501, headers: { "Content-Type": "application/json" } });
  }

  const serviceAccount = JSON.parse(saJson);
  const token = await getGoogleAccessToken(serviceAccount);

  if (mode === "master") {
    const masterRows = await readSheetTab(token, spreadsheetId, MASTER_TAB);
    const configRows = await readSheetTab(token, spreadsheetId, CONFIG_TAB);
    let incomingRows: string[][] = [];
    let groupsRows: string[][] = [];
    let slotsRows: string[][] = [];
    let usersRows: string[][] = [];
    let payRatesRows: string[][] = [];
    try {
      incomingRows = await readSheetTab(token, spreadsheetId, INCOMING_LEADS_TAB);
    } catch {
      incomingRows = [];
    }
    try {
      groupsRows = await readSheetTab(token, spreadsheetId, GROUPS_TAB);
      slotsRows = await readSheetTab(token, spreadsheetId, GROUP_SLOTS_TAB);
    } catch {
      groupsRows = [];
      slotsRows = [];
    }
    try {
      usersRows = await readSheetTab(token, spreadsheetId, USERS_TAB);
      payRatesRows = await readSheetTab(token, spreadsheetId, PAY_RATES_TAB);
    } catch {
      usersRows = [];
      payRatesRows = [];
    }
    const writeTab = (tab: string, rows: string[][]) => writeSheetTab(token, spreadsheetId, tab, rows);

    const { data: run } = await supabase.from("sheet_sync_runs").insert({
      direction: "pull",
      sheet_tab: MASTER_TAB,
      status: "running",
    }).select("id").single();

    try {
      const results = await runMasterSheetSync(
        supabase,
        masterRows,
        configRows,
        writeTab,
        incomingRows,
        groupsRows,
        slotsRows,
        usersRows,
        payRatesRows,
      );
      await supabase.from("sheet_sync_runs").update({
        finished_at: new Date().toISOString(),
        rows_in: results.synced,
        rows_out: 0,
        errors: results.errors,
        status: results.blocked ? "failed" : results.failed ? "partial" : "ok",
      }).eq("id", run?.id);

      return new Response(JSON.stringify({ ok: true, message: "master_sheet_sync_complete", results }), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await supabase.from("sheet_sync_runs").update({
        finished_at: new Date().toISOString(),
        errors: [{ error: msg }],
        status: "failed",
      }).eq("id", run?.id);
      return new Response(JSON.stringify({ ok: false, error: msg }), { status: 500 });
    }
  }

  const defaultTabs = mode === "annual"
    ? ANNUAL_DAY_TABS
    : mode === "summer"
      ? SUMMER_TABS
      : MONTHLY_TABS;
  const syncTabs: string[] = tabs?.length ? tabs : defaultTabs;

  const results = [];

  for (const tab of syncTabs) {
    const { data: run } = await supabase.from("sheet_sync_runs").insert({
      direction,
      sheet_tab: tab,
      status: "running",
    }).select("id").single();

    const errors: string[] = [];
    let rowsIn = 0;
    let rowsOut = 0;

    try {
      if (direction === "pull" || direction === "both") {
        const sheetRows = await readSheetTab(token, spreadsheetId, tab);
        const pull = await syncTabPull(supabase, tab, sheetRows);
        rowsIn = pull.rows_in;
        errors.push(...pull.errors);
      }
      if (direction === "push" || direction === "both") {
        const pushResult = await syncTabPush(supabase, tab);
        await writeSheetTab(token, spreadsheetId, tab, pushResult.rows);
        rowsOut = pushResult.rows_out;
      }
      await supabase.from("sheet_sync_runs").update({
        finished_at: new Date().toISOString(),
        rows_in: rowsIn,
        rows_out: rowsOut,
        errors,
        status: errors.length ? "partial" : "ok",
      }).eq("id", run?.id);
      results.push({ tab, rows_in: rowsIn, rows_out: rowsOut });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await supabase.from("sheet_sync_runs").update({
        finished_at: new Date().toISOString(),
        errors: [msg],
        status: "failed",
      }).eq("id", run?.id);
      results.push({ tab, error: msg });
    }
  }

  return new Response(JSON.stringify({ ok: true, message: "sheet_sync_complete", results }), {
    headers: { "Content-Type": "application/json" },
  });
});
