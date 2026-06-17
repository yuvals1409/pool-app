import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase.js";
import { syncAssessmentSlotSession } from "../lib/assessment.js";
import { useLang } from "../i18n.jsx";
import { fmt_time } from "../lib/lessonDates.js";

const LEAD_STATUSES = ["new", "converted", "cancelled"];
const DEFAULT_TIME = "16:00";
const DEFAULT_CAPACITY = 10;

export default function AdminAssessmentTab({ toast }) {
  const { t, fmtDateDay } = useLang();
  const [view, setView] = useState("slots");
  const [slots, setSlots] = useState([]);
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [leadFilterSlot, setLeadFilterSlot] = useState("");
  const [leadFilterStatus, setLeadFilterStatus] = useState("");

  const [slotDate, setSlotDate] = useState("");
  const [slotTime, setSlotTime] = useState(DEFAULT_TIME);
  const [slotCapacity, setSlotCapacity] = useState(String(DEFAULT_CAPACITY));

  const leadSelect = `
    id, slot_id, child_age, status, source, created_at,
    slot:assessment_slots(id, slot_date, start_time),
    participant:participants(full_name),
    enrollment:enrollments(id, payment_status, active)
  `;

  const loadSlots = useCallback(async () => {
    const { data, error } = await supabase
      .from("assessment_slots")
      .select("id, slot_date, start_time, capacity, enrolled_count, active, session_id")
      .order("slot_date", { ascending: false })
      .order("start_time", { ascending: false });
    if (error) toast.show(error.message);
    else setSlots(data || []);
  }, [toast]);

  const loadLeads = useCallback(async () => {
    let q = supabase
      .from("assessment_leads")
      .select(leadSelect)
      .order("created_at", { ascending: false });
    if (leadFilterSlot) q = q.eq("slot_id", leadFilterSlot);
    if (leadFilterStatus) q = q.eq("status", leadFilterStatus);
    const { data, error } = await q;
    if (error) toast.show(error.message);
    else setLeads(data || []);
  }, [leadFilterSlot, leadFilterStatus, toast]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadSlots();
      setLoading(false);
    })();
  }, [loadSlots]);

  useEffect(() => {
    if (view !== "leads") return;
    loadLeads();
  }, [view, loadLeads]);

  const addSlot = async () => {
    if (!slotDate) return toast.show(t("assessmentDateRequired"));
    const cap = Number(slotCapacity);
    if (!Number.isInteger(cap) || cap < 1) return toast.show(t("assessmentCapacityInvalid"));

    setSaving(true);
    const { data: inserted, error } = await supabase
      .from("assessment_slots")
      .insert({
        slot_date: slotDate,
        start_time: slotTime || DEFAULT_TIME,
        capacity: cap,
      })
      .select("id")
      .single();

    if (error) {
      toast.show(error.message);
      setSaving(false);
      return;
    }

    try {
      await syncAssessmentSlotSession(inserted.id);
      toast.show(t("assessmentSlotAdded"));
      setSlotDate("");
      setSlotTime(DEFAULT_TIME);
      setSlotCapacity(String(DEFAULT_CAPACITY));
      await loadSlots();
    } catch (e) {
      toast.show(e.message);
    }
    setSaving(false);
  };

  const cancelSlot = async (slot) => {
    if (!confirm(t("cancelAssessmentSlotConfirm", { date: fmtDateDay(slot.slot_date) }))) return;

    setSaving(true);
    const { error } = await supabase
      .from("assessment_slots")
      .update({ active: false })
      .eq("id", slot.id);

    if (error) {
      toast.show(error.message);
      setSaving(false);
      return;
    }

    if (slot.session_id) {
      await supabase
        .from("access_passes")
        .update({ status: "cancelled" })
        .eq("session_id", slot.session_id)
        .eq("status", "active")
        .gt("valid_until", new Date().toISOString());
    }

    toast.show(t("assessmentSlotCancelled"));
    await loadSlots();
    setSaving(false);
  };

  const updateLeadStatus = async (lead, status) => {
    if (status === "cancelled" && !confirm(t("cancelLeadConfirm"))) return;

    setSaving(true);
    const { error } = await supabase
      .from("assessment_leads")
      .update({ status })
      .eq("id", lead.id);

    if (error) {
      toast.show(error.message);
      setSaving(false);
      return;
    }

    if (status === "cancelled" && lead.enrollment?.id) {
      await supabase
        .from("enrollments")
        .update({ active: false })
        .eq("id", lead.enrollment.id);

      const { data: passes } = await supabase
        .from("access_passes")
        .select("id")
        .eq("enrollment_id", lead.enrollment.id)
        .eq("status", "active");

      if (passes?.length) {
        await supabase
          .from("access_passes")
          .update({ status: "cancelled" })
          .in("id", passes.map((p) => p.id));
      }

      const slot = slots.find((s) => s.id === lead.slot_id);
      if (slot && slot.enrolled_count > 0) {
        await supabase
          .from("assessment_slots")
          .update({ enrolled_count: slot.enrolled_count - 1 })
          .eq("id", slot.id);
        await loadSlots();
      }
    }

    toast.show(status === "converted" ? t("leadMarkedConverted") : t("leadCancelled"));
    await loadLeads();
    setSaving(false);
  };

  const leadStatusLabel = (status) => ({
    new: t("leadStatusNew"),
    converted: t("leadStatusConverted"),
    cancelled: t("leadStatusCancelled"),
  }[status] || status);

  if (loading && view === "slots") {
    return <div style={{ textAlign: "center", padding: 32, color: "var(--ink-soft)" }}>{t("loading")}</div>;
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <button
          type="button"
          className={`btn btn-sm ${view === "slots" ? "btn-primary" : "btn-outline"}`}
          onClick={() => setView("slots")}
        >
          {t("assessmentSlots")}
        </button>
        <button
          type="button"
          className={`btn btn-sm ${view === "leads" ? "btn-primary" : "btn-outline"}`}
          onClick={() => setView("leads")}
        >
          {t("assessmentLeads")}
        </button>
      </div>

      {view === "slots" ? (
        <>
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="section-sub" style={{ marginBottom: 12 }}>{t("addAssessmentSlot")}</div>
            <div className="field">
              <label className="label">{t("date")}</label>
              <input className="input" type="date" value={slotDate} onChange={(e) => setSlotDate(e.target.value)} dir="ltr" />
            </div>
            <div className="field">
              <label className="label">{t("startTime")}</label>
              <input className="input" type="time" value={slotTime} onChange={(e) => setSlotTime(e.target.value)} dir="ltr" />
            </div>
            <div className="field">
              <label className="label">{t("assessmentCapacity")}</label>
              <input className="input" type="number" min={1} value={slotCapacity} onChange={(e) => setSlotCapacity(e.target.value)} dir="ltr" />
            </div>
            <button className="btn btn-primary" onClick={addSlot} disabled={saving}>
              {saving ? <><div className="spinner" /> {t("saving")}</> : t("saveAssessmentSlot")}
            </button>
          </div>

          {slots.length === 0 ? (
            <div className="empty"><div className="empty-icon">📅</div><div className="empty-text">{t("noAssessmentSlots")}</div></div>
          ) : (
            <div className="grouped-list">
              {slots.map((slot) => (
                <div className="user-row" key={slot.id} style={{ flexWrap: "wrap", gap: 8 }}>
                  <div className="user-info" style={{ flex: 1 }}>
                    <div className="user-display">
                      {fmtDateDay(slot.slot_date)} · {fmt_time(slot.start_time)}
                      <span className={`badge ${slot.active ? "badge-active" : "badge-used"}`} style={{ marginInlineStart: 8 }}>
                        {slot.active ? t("active") : t("cancelled")}
                      </span>
                    </div>
                    <div className="user-email">
                      {t("assessmentEnrolled", { n: slot.enrolled_count, cap: slot.capacity })}
                    </div>
                  </div>
                  {slot.active && slot.slot_date >= new Date().toISOString().slice(0, 10) && (
                    <button className="btn btn-danger btn-sm" onClick={() => cancelSlot(slot)} disabled={saving}>
                      {t("cancelAssessmentSlot")}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
            <select className="input" value={leadFilterSlot} onChange={(e) => setLeadFilterSlot(e.target.value)} style={{ flex: 1, minWidth: 140 }}>
              <option value="">{t("allSlots")}</option>
              {slots.map((s) => (
                <option key={s.id} value={s.id}>
                  {fmtDateDay(s.slot_date)} {fmt_time(s.start_time)}
                </option>
              ))}
            </select>
            <select className="input" value={leadFilterStatus} onChange={(e) => setLeadFilterStatus(e.target.value)} style={{ flex: 1, minWidth: 120 }}>
              <option value="">{t("allStatuses")}</option>
              {LEAD_STATUSES.map((st) => (
                <option key={st} value={st}>{leadStatusLabel(st)}</option>
              ))}
            </select>
          </div>

          {leads.length === 0 ? (
            <div className="empty"><div className="empty-icon">📋</div><div className="empty-text">{t("noAssessmentLeads")}</div></div>
          ) : (
            <div className="grouped-list">
              {leads.map((lead) => (
                <div className="user-row" key={lead.id} style={{ flexWrap: "wrap", gap: 8 }}>
                  <div className="user-info" style={{ flex: 1 }}>
                    <div className="user-display">
                      {lead.participant?.full_name || "—"}
                      <span className={`badge ${lead.status === "new" ? "badge-pending" : lead.status === "converted" ? "badge-active" : "badge-used"}`} style={{ marginInlineStart: 8 }}>
                        {leadStatusLabel(lead.status)}
                      </span>
                    </div>
                    <div className="user-email">
                      {lead.slot ? `${fmtDateDay(lead.slot.slot_date)} ${fmt_time(lead.slot.start_time)}` : "—"}
                      {lead.child_age != null ? ` · ${t("childAge")}: ${lead.child_age}` : ""}
                      {lead.source ? ` · ${lead.source}` : ""}
                    </div>
                  </div>
                  {lead.status === "new" && (
                    <div style={{ display: "flex", gap: 6 }}>
                      <button className="btn btn-primary btn-sm" onClick={() => updateLeadStatus(lead, "converted")} disabled={saving}>
                        {t("markLeadConverted")}
                      </button>
                      <button className="btn btn-danger btn-sm" onClick={() => updateLeadStatus(lead, "cancelled")} disabled={saving}>
                        {t("cancelLead")}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
