import { GROUP_HEADERS, GROUP_SLOT_HEADERS, GROUPS_TAB, GROUP_SLOTS_TAB } from "./groups-sheet-schema.mjs";
import { dayNameToNumber } from "./group-name-build.mjs";
import { deriveSlotsFromGroups } from "./groups-slots-derive.mjs";

const DAY_MAP = { ראשון: 0, שני: 1, שלישי: 2, רביעי: 3, חמישי: 4, שישי: 5, שבת: 6 };

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
    if (!row[headers[0]]) continue;
    rows.push(row);
  }
  return rows;
}

export function parseGroupsTab(sheetRows) {
  return parseSheetRows(GROUP_HEADERS, sheetRows);
}

export function parseGroupSlotsTab(sheetRows) {
  return parseSheetRows(GROUP_SLOT_HEADERS, sheetRows);
}

function padTime(t) {
  const s = String(t || "").trim();
  if (!s) return "17:00:00";
  return s.length <= 5 ? `${s}:00`.slice(0, 8) : s.slice(0, 8);
}

function buildSchedulePattern(group, slots) {
  const type = group["סוג"] === "summer" ? "course_series" : "weekly";
  const schedule = slots.map((slot) => ({
    day: DAY_MAP[slot["יום"]] ?? dayNameToNumber(slot["יום"]),
    startTime: padTime(slot["שעת_התחלה"]),
    endTime: padTime(slot["שעת_סיום"]),
  })).filter((s) => s.day != null);

  if (type === "course_series") {
    return {
      type: "course_series",
      weekdays: schedule.map((s) => s.day),
      course_start: group["מתאריך"] || null,
      course_end: group["עד_תאריך"] || null,
      schedule,
    };
  }

  return { type: "weekly", schedule };
}

async function resolveTemplateId(supabase, groupType) {
  const code = groupType === "summer" ? "summer_course" : "annual_section";
  const { data } = await supabase.from("product_templates").select("id").eq("code", code).maybeSingle();
  return data?.id || null;
}

async function resolveSeasonId(supabase, seasonName) {
  const { data } = await supabase.from("seasons").select("id").eq("name", seasonName).maybeSingle();
  return data?.id || null;
}

async function resolveInstructorId(supabase, instructorName) {
  const first = String(instructorName || "").trim().split(/\s+/)[0];
  if (!first) return null;
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name")
    .ilike("full_name", `%${first}%`)
    .limit(5);
  const match = (data || []).find((p) => p.full_name?.includes(first));
  return match?.id || null;
}

export async function syncGroupsTab(supabase, { groupsRows, slotsRows: _slotsRows, dryRun = false }) {
  const groups = parseGroupsTab(groupsRows);
  const slots = deriveSlotsFromGroups(groups);
  const slotsByGroup = new Map();
  for (const slot of slots) {
    const gid = slot["מזהה_קבוצה"];
    if (!slotsByGroup.has(gid)) slotsByGroup.set(gid, []);
    slotsByGroup.get(gid).push(slot);
  }

  const results = { synced: 0, failed: 0, errors: [] };

  for (const group of groups) {
    const groupId = group["מזהה_קבוצה"];
    const groupSlots = slotsByGroup.get(groupId) || [];
    const firstSlot = groupSlots[0] || {};
    const seasonId = await resolveSeasonId(supabase, group["עונה"]);
    const templateId = await resolveTemplateId(supabase, group["סוג"]);
    if (!seasonId || !templateId) {
      results.failed++;
      results.errors.push({ groupId, error: "missing_season_or_template" });
      continue;
    }

    const schedulePattern = buildSchedulePattern(group, groupSlots);
    const firstDay = schedulePattern.schedule?.[0]?.day ?? null;
    const instructorName = firstSlot["מדריך"] || "";
    const instructorId = await resolveInstructorId(supabase, instructorName);

    const payload = {
      season_id: seasonId,
      template_id: templateId,
      name: group["שם_קבוצה"],
      sheet_group_id: groupId,
      day_of_week: firstDay,
      start_time: padTime(firstSlot["שעת_התחלה"]),
      end_time: padTime(firstSlot["שעת_סיום"] || firstSlot["שעת_התחלה"]),
      instructor_name: instructorName || "לא משויך",
      instructor_id: instructorId,
      capacity: group["קיבולת"] ? Number(group["קיבולת"]) : null,
      level: group["רמה"] ? Number(group["רמה"]) : null,
      target_audience: group["קהל_יעד"] || null,
      gender: group["מין_קבוצה"] || null,
      schedule_pattern: schedulePattern,
    };

    if (dryRun) {
      results.synced++;
      continue;
    }

    const { data: existing } = await supabase
      .from("products")
      .select("id")
      .eq("sheet_group_id", groupId)
      .maybeSingle();

    let productId = existing?.id;
    if (existing) {
      const { error } = await supabase.from("products").update(payload).eq("id", existing.id);
      if (error) {
        results.failed++;
        results.errors.push({ groupId, error: error.message });
        continue;
      }
    } else {
      const { data: inserted, error } = await supabase.from("products").insert(payload).select("id").single();
      if (error) {
        results.failed++;
        results.errors.push({ groupId, error: error.message });
        continue;
      }
      productId = inserted.id;
    }

    await supabase.from("sheet_row_links").upsert({
      sheet_tab: GROUPS_TAB,
      row_key: groupId,
      group_id: groupId,
      entity_type: "product",
      entity_id: productId,
      updated_at: new Date().toISOString(),
    }, { onConflict: "sheet_tab,row_key" });

    results.synced++;
  }

  if (!dryRun) {
    await supabase.from("master_sheet_config").upsert({
      id: 1,
      last_groups_sync_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  return results;
}

export { GROUPS_TAB, GROUP_SLOTS_TAB };
