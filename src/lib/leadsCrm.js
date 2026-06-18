import { supabase } from "./supabase.js";

export const LEAD_FUNNEL_STATUSES = [
  "new",
  "call",
  "registered_assessment",
  "passed",
  "registered_class",
  "abandoned",
];

export const LEAD_SOURCES = ["recommendation", "facebook", "website", "import"];

export function leadStatusBadgeClass(status) {
  if (status === "new") return "badge-pending";
  if (status === "call") return "badge-pending";
  if (status === "registered_assessment") return "badge-pending";
  if (status === "passed") return "badge-active";
  if (status === "registered_class") return "badge-active";
  if (status === "abandoned") return "badge-used";
  return "badge-pending";
}

export async function createAssessmentLead({ phone, childName, parentName, source, notes, childAge }) {
  const { data, error } = await supabase.rpc("create_assessment_lead", {
    p_phone: phone,
    p_child_name: childName,
    p_parent_name: parentName ?? null,
    p_source: source ?? "website",
    p_notes: notes ?? null,
    p_child_age: childAge ?? null,
  });
  if (error) throw error;
  return data;
}

export async function updateLeadCrm({ leadId, status, source, notes, slotId }) {
  const { data, error } = await supabase.rpc("update_lead_crm", {
    p_lead_id: leadId,
    p_status: status ?? null,
    p_source: source ?? null,
    p_notes: notes ?? null,
    p_slot_id: slotId ?? null,
  });
  if (error) throw error;
  return data;
}

export async function createLeadTask({ leadId, title, dueDate }) {
  const { data, error } = await supabase.rpc("create_lead_task", {
    p_lead_id: leadId,
    p_title: title,
    p_due_date: dueDate,
  });
  if (error) throw error;
  return data;
}

export async function completeLeadTask(taskId) {
  const { data, error } = await supabase.rpc("complete_lead_task", {
    p_task_id: taskId,
  });
  if (error) throw error;
  return data;
}

export async function listDueLeadTasks() {
  const { data, error } = await supabase.rpc("list_due_lead_tasks");
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function listLeadTasks(leadId) {
  const { data, error } = await supabase
    .from("lead_follow_up_tasks")
    .select("id, title, due_date, completed_at, created_at")
    .eq("lead_id", leadId)
    .order("due_date", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function loadLeadFunnelCounts() {
  const { data, error } = await supabase
    .from("assessment_leads")
    .select("status");
  if (error) throw error;
  const counts = Object.fromEntries(LEAD_FUNNEL_STATUSES.map((s) => [s, 0]));
  for (const row of data || []) {
    if (counts[row.status] != null) counts[row.status] += 1;
  }
  return counts;
}

export function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function todayDateStr() {
  return new Date().toISOString().slice(0, 10);
}
