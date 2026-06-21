import { supabase } from "./supabase.js";
import { assignEventColumns, eventColumnStyle } from "./scheduleLayout.js";
import { timeToMinutes } from "./lessonDates.js";

export const SCHEDULE_LAYERS = ["annual", "summer"];

const PLANNING_DAYS = [1, 2, 3, 4, 5];

export function slotToEvent(slot) {
  const start = String(slot.start_time || "").slice(0, 5);
  const end = String(slot.end_time || "").slice(0, 5);
  const duration = timeToMinutes(end) - timeToMinutes(start);
  return {
    id: slot.id,
    layer: slot.layer,
    day_of_week: slot.day_of_week,
    start_time: start,
    end_time: end,
    duration_minutes: duration > 0 ? duration : 60,
    product_id: slot.product_id,
    product_name: slot.product_name || slot.label,
    instructor_name: slot.instructor_name,
    template_code: slot.template_code,
    readOnly: slot.readOnly,
  };
}

export function buildDayLayout(events) {
  return assignEventColumns(events);
}

export function layoutStyleForEvent(event, layout, { top, height }) {
  const columnLayout = layout.get(event.id) || { column: 0, totalColumns: 1 };
  return eventColumnStyle(columnLayout, {
    position: "absolute",
    top,
    height,
    zIndex: 2 + columnLayout.column + (event.layer === "summer" ? 10 : 0),
    opacity: event.readOnly ? 0.55 : 1,
  });
}

export async function getSeasonMasterSchedule(seasonId) {
  const { data, error } = await supabase.rpc("get_season_master_schedule", {
    p_season_id: seasonId,
  });
  if (error) throw error;
  if (data?.result !== "ok") throw new Error(data?.result || "schedule_failed");
  return data.slots || [];
}

export async function upsertScheduleSlot({
  seasonId,
  layer,
  dayOfWeek,
  startTime,
  endTime,
  label = null,
  slotId = null,
}) {
  const { data, error } = await supabase.rpc("upsert_schedule_slot", {
    p_season_id: seasonId,
    p_layer: layer,
    p_day_of_week: dayOfWeek,
    p_start_time: startTime,
    p_end_time: endTime,
    p_label: label,
    p_slot_id: slotId,
  });
  if (error) throw error;
  if (data?.result !== "ok") throw new Error(data?.result || "upsert_failed");
  return data;
}

export async function assignSlotProduct(slotId, productId) {
  const { data, error } = await supabase.rpc("assign_slot_product", {
    p_slot_id: slotId,
    p_product_id: productId,
  });
  if (error) throw error;
  if (data?.result !== "ok") throw new Error(data?.result || "assign_failed");
  return data;
}

export async function deleteScheduleSlot(slotId) {
  const { data, error } = await supabase.rpc("delete_schedule_slot", {
    p_slot_id: slotId,
  });
  if (error) throw error;
  if (data?.result !== "ok") throw new Error(data?.result || "delete_failed");
  return data;
}

export { PLANNING_DAYS };
