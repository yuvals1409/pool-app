import { USER_HEADERS, PAY_RATE_HEADERS, USERS_TAB, PAY_RATES_TAB } from "./users-sheet-schema.mjs";
import { normalizePhone } from "./sheet-normalize.mjs";

function parseSheetRows(headers, sheetRows) {
  if (!sheetRows?.length || sheetRows.length < 2) return [];
  const header = sheetRows[0].map((h) => String(h).trim());
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  const rows = [];
  for (let i = 1; i < sheetRows.length; i++) {
    const line = sheetRows[i];
    if (!line?.length) continue;
    const row = {};
    for (const h of headers) {
      const col = idx[h];
      row[h] = col != null ? String(line[col] ?? "").trim() : "";
    }
    if (!row[headers[0]] && !row["אימייל"]) continue;
    rows.push(row);
  }
  return rows;
}

export function parseUsersTab(sheetRows) {
  return parseSheetRows(USER_HEADERS, sheetRows);
}

export function parsePayRatesTab(sheetRows) {
  return parseSheetRows(PAY_RATE_HEADERS, sheetRows);
}

async function findProfileByEmail(supabase, email) {
  const norm = String(email || "").trim().toLowerCase();
  if (!norm) return null;
  const { data } = await supabase.from("profiles").select("id, email, full_name").eq("email", norm).maybeSingle();
  return data;
}

export async function syncUsersTab(supabase, { usersRows, payRatesRows, dryRun = false }) {
  const users = parseUsersTab(usersRows);
  const payRates = parsePayRatesTab(payRatesRows || []);
  const payByUser = new Map();
  for (const pr of payRates) {
    const uid = pr["מזהה_משתמש"];
    if (!payByUser.has(uid)) payByUser.set(uid, []);
    payByUser.get(uid).push(pr);
  }

  const results = { synced: 0, failed: 0, errors: [], userIdBySheetId: new Map() };

  for (const user of users) {
    const sheetUserId = user["מזהה_משתמש"];
    const email = String(user["אימייל"] || "").trim().toLowerCase();
    const role = String(user["תפקיד"] || "").trim().toLowerCase();

    if (!email || !role) {
      results.failed++;
      results.errors.push({ sheetUserId, error: "missing_email_or_role" });
      continue;
    }

    if (dryRun) {
      results.synced++;
      continue;
    }

    try {
      await supabase.rpc("upsert_role_assignment_from_sheet", { p_email: email, p_role: role });
    } catch {
      // RPC may not exist yet — fallback direct insert
      await supabase.from("role_assignments").upsert({ email, role }, { onConflict: "email" });
    }

    const profile = await findProfileByEmail(supabase, email);
    if (profile?.id) {
      const patch = {};
      if (user["שם_מלא"]) patch.full_name = user["שם_מלא"];
      if (user["כינוי"]) patch.nickname = user["כינוי"];
      if (user["טלפון"]) patch.phone = normalizePhone(user["טלפון"]);
      if (user["תאריך_לידה"]) patch.birth_date = user["תאריך_לידה"];
      if (user["תאריך_תחילת_העסקה"]) patch.hire_date = user["תאריך_תחילת_העסקה"];
      if (Object.keys(patch).length) {
        await supabase.from("profiles").update(patch).eq("id", profile.id);
      }
      results.userIdBySheetId.set(sheetUserId, profile.id);

      if (role === "instructor") {
        const rates = payByUser.get(sheetUserId) || [];
        for (const rate of rates) {
          const templateCode = rate["סוג_שיעור"];
          const hourly = Number(rate["שכר_לשעה"]);
          if (!templateCode || !Number.isFinite(hourly)) continue;
          await supabase.from("instructor_pay_rates").upsert({
            instructor_id: profile.id,
            template_code: templateCode,
            rate_per_hour: hourly,
            updated_at: new Date().toISOString(),
          }, { onConflict: "instructor_id,template_code" });
        }
      }
    }

    results.synced++;
  }

  if (!dryRun) {
    await supabase.from("master_sheet_config").upsert({
      id: 1,
      last_users_sync_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  return results;
}

export { USERS_TAB, PAY_RATES_TAB };
