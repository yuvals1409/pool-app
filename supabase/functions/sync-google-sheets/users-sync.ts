import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export const USERS_TAB = "משתמשים";
export const PAY_RATES_TAB = "שכר_מדריכים";

const USER_HEADERS = [
  "מזהה_משתמש", "שם_מלא", "כינוי", "תפקיד", "תאריך_לידה", "אימייל", "טלפון",
  "תאריך_תחילת_העסקה", "קבוצות_אחראי",
];
const PAY_HEADERS = ["מזהה_משתמש", "סוג_שיעור", "שכר_לשעה"];

function parseRows(headers: string[], sheetRows: string[][]) {
  if (!sheetRows?.length || sheetRows.length < 2) return [] as Record<string, string>[];
  const header = sheetRows[0].map((h) => String(h).trim());
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < sheetRows.length; i++) {
    const line = sheetRows[i];
    if (!line?.length) continue;
    const row: Record<string, string> = {};
    for (const h of headers) {
      const col = idx[h];
      row[h] = col != null ? String(line[col] ?? "").trim() : "";
    }
    if (!row[headers[0]] && !row["אימייל"]) continue;
    rows.push(row);
  }
  return rows;
}

export async function syncUsersTab(
  supabase: SupabaseClient,
  usersRows: string[][],
  payRatesRows: string[][] = [],
) {
  const users = parseRows(USER_HEADERS, usersRows);
  const payRates = parseRows(PAY_HEADERS, payRatesRows);
  const payByUser = new Map<string, Record<string, string>[]>();
  for (const pr of payRates) {
    const uid = pr["מזהה_משתמש"];
    if (!payByUser.has(uid)) payByUser.set(uid, []);
    payByUser.get(uid)!.push(pr);
  }

  const results = { synced: 0, failed: 0, errors: [] as { userId: string; error: string }[] };

  for (const user of users) {
    const email = String(user["אימייל"] || "").trim().toLowerCase();
    const role = String(user["תפקיד"] || "").trim().toLowerCase();
    if (!email || !role) {
      results.failed++;
      results.errors.push({ userId: user["מזהה_משתמש"], error: "missing_email_or_role" });
      continue;
    }

    await supabase.from("role_assignments").upsert({ email, role }, { onConflict: "email" });

    const { data: profile } = await supabase.from("profiles").select("id").eq("email", email).maybeSingle();
    if (profile?.id) {
      const patch: Record<string, unknown> = {};
      if (user["שם_מלא"]) patch.full_name = user["שם_מלא"];
      if (user["כינוי"]) patch.nickname = user["כינוי"];
      if (user["טלפון"]) patch.phone = user["טלפון"];
      if (user["תאריך_לידה"]) patch.birth_date = user["תאריך_לידה"];
      if (user["תאריך_תחילת_העסקה"]) patch.hire_date = user["תאריך_תחילת_העסקה"];
      if (Object.keys(patch).length) await supabase.from("profiles").update(patch).eq("id", profile.id);

      if (role === "instructor") {
        for (const rate of payByUser.get(user["מזהה_משתמש"]) || []) {
          const hourly = Number(rate["שכר_לשעה"]);
          if (!rate["סוג_שיעור"] || !Number.isFinite(hourly)) continue;
          await supabase.from("instructor_pay_rates").upsert({
            instructor_id: profile.id,
            template_code: rate["סוג_שיעור"],
            rate_per_hour: hourly,
            updated_at: new Date().toISOString(),
          }, { onConflict: "instructor_id,template_code" });
        }
      }
    }
    results.synced++;
  }

  await supabase.from("master_sheet_config").upsert({
    id: 1,
    last_users_sync_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  return results;
}
