import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export const GROUPS_TAB = "קבוצות";
export const GROUP_SLOTS_TAB = "משבצות_קבוצות";

const GROUP_HEADERS = [
  "מזהה_קבוצה", "שם_קבוצה", "סוג", "רמה", "קהל_יעד", "מין_קבוצה",
  "יום_1", "שעת_התחלה_1", "שעת_סיום_1", "מדריך_1",
  "יום_2", "שעת_התחלה_2", "שעת_סיום_2", "מדריך_2",
  "ימים", "עונה", "מתאריך", "עד_תאריך", "קיבולת",
  "סוג_רשומה_ברירת_מחדל", "מקור_שם_אקסל",
];
const SLOT_HEADERS = [
  "מזהה_משבצה", "מזהה_קבוצה", "יום", "שעת_התחלה", "שעת_סיום", "מדריך",
];
const DAY_MAP: Record<string, number> = {
  ראשון: 0, שני: 1, שלישי: 2, רביעי: 3, חמישי: 4, שישי: 5, שבת: 6,
};

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
    if (!row[headers[0]]) continue;
    rows.push(row);
  }
  return rows;
}

function padTime(t: string) {
  const s = String(t || "").trim();
  if (!s) return "17:00:00";
  return s.length <= 5 ? `${s}:00`.slice(0, 8) : s.slice(0, 8);
}

function deriveSlotsFromGroups(groups: Record<string, string>[]) {
  const slots: Record<string, string>[] = [];
  const defs = [
    { index: 1, day: "יום_1", start: "שעת_התחלה_1", end: "שעת_סיום_1", instructor: "מדריך_1" },
    { index: 2, day: "יום_2", start: "שעת_התחלה_2", end: "שעת_סיום_2", instructor: "מדריך_2" },
  ];
  for (const group of groups) {
    const groupId = String(group["מזהה_קבוצה"] ?? "").trim();
    if (!groupId) continue;
    for (const def of defs) {
      const day = String(group[def.day] ?? "").trim();
      const start = String(group[def.start] ?? "").trim();
      const end = String(group[def.end] ?? "").trim();
      if (!day && !start) continue;
      slots.push({
        מזהה_משבצה: `${groupId}::${def.index}`,
        מזהה_קבוצה: groupId,
        יום: day,
        שעת_התחלה: start.slice(0, 5),
        שעת_סיום: end.slice(0, 5),
        מדריך: String(group[def.instructor] ?? group["מדריך_1"] ?? "").trim(),
      });
    }
  }
  return slots;
}

export async function syncGroupsTab(
  supabase: SupabaseClient,
  groupsRows: string[][],
  _slotsRows?: string[][],
) {
  const groups = parseRows(GROUP_HEADERS, groupsRows);
  const slots = deriveSlotsFromGroups(groups);
  const slotsByGroup = new Map<string, Record<string, string>[]>();
  for (const slot of slots) {
    const gid = slot["מזהה_קבוצה"];
    if (!slotsByGroup.has(gid)) slotsByGroup.set(gid, []);
    slotsByGroup.get(gid)!.push(slot);
  }

  const results = { synced: 0, failed: 0, errors: [] as { groupId: string; error: string }[] };

  for (const group of groups) {
    const groupId = group["מזהה_קבוצה"];
    const groupSlots = slotsByGroup.get(groupId) || [];
    const firstSlot = groupSlots[0] || {};
    const { data: season } = await supabase.from("seasons").select("id").eq("name", group["עונה"]).maybeSingle();
    const templateCode = group["סוג"] === "summer" ? "summer_course" : "annual_section";
    const { data: template } = await supabase.from("product_templates").select("id").eq("code", templateCode).maybeSingle();
    if (!season?.id || !template?.id) {
      results.failed++;
      results.errors.push({ groupId, error: "missing_season_or_template" });
      continue;
    }

    const schedule = groupSlots.map((slot) => ({
      day: DAY_MAP[slot["יום"]],
      startTime: padTime(slot["שעת_התחלה"]),
      endTime: padTime(slot["שעת_סיום"]),
    })).filter((s) => s.day != null);

    const schedulePattern = group["סוג"] === "summer"
      ? { type: "course_series", weekdays: schedule.map((s) => s.day), schedule }
      : { type: "weekly", schedule };

    const payload = {
      season_id: season.id,
      template_id: template.id,
      name: group["שם_קבוצה"],
      sheet_group_id: groupId,
      day_of_week: schedule[0]?.day ?? null,
      start_time: padTime(firstSlot["שעת_התחלה"]),
      end_time: padTime(firstSlot["שעת_סיום"] || firstSlot["שעת_התחלה"]),
      instructor_name: firstSlot["מדריך"] || "לא משויך",
      level: group["רמה"] ? Number(group["רמה"]) : null,
      target_audience: group["קהל_יעד"] || null,
      gender: group["מין_קבוצה"] || null,
      schedule_pattern: schedulePattern,
    };

    const { data: existing } = await supabase.from("products").select("id").eq("sheet_group_id", groupId).maybeSingle();
    if (existing?.id) {
      const { error } = await supabase.from("products").update(payload).eq("id", existing.id);
      if (error) { results.failed++; results.errors.push({ groupId, error: error.message }); continue; }
    } else {
      const { error } = await supabase.from("products").insert(payload);
      if (error) { results.failed++; results.errors.push({ groupId, error: error.message }); continue; }
    }
    results.synced++;
  }

  await supabase.from("master_sheet_config").upsert({
    id: 1,
    last_groups_sync_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  return results;
}
