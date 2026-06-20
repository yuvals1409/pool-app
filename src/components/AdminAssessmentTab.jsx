import { useState, useEffect, useCallback } from "react";
import { AnimatePresence } from "framer-motion";
import { supabase } from "../lib/supabase.js";
import { syncAssessmentSlotSession } from "../lib/assessment.js";
import {
  LEAD_FUNNEL_STATUSES,
  LEAD_SOURCES,
  leadStatusBadgeClass,
  createAssessmentLead,
  updateLeadCrm,
  createLeadTask,
  completeLeadTask,
  listLeadTasks,
  loadLeadFunnelCounts,
  addDays,
  todayDateStr,
} from "../lib/leadsCrm.js";
import { AnimatedSheetOverlay, AnimatedSheetPanel } from "./ui/AnimatedSheet.jsx";
import { useLang } from "../i18n.jsx";
import { fmt_time } from "../lib/lessonDates.js";
import { useIsDesktop } from "../lib/useBreakpoint.js";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  SegmentedControl,
  Select,
  Spinner,
} from "./ui/ds/index.js";

const ASSESSMENT_RESULTS = ["pending", "passed", "failed"];
const DEFAULT_TIME = "16:00";
const DEFAULT_CAPACITY = 10;

function leadStatusBadgeVariant(status) {
  const cls = leadStatusBadgeClass(status);
  if (cls === "badge-active") return "success";
  if (cls === "badge-used") return "neutral";
  return "warn";
}

export default function AdminAssessmentTab({ toast }) {
  const { t, fmtDateDay } = useLang();
  const isDesktop = useIsDesktop();
  const [view, setView] = useState("slots");
  const [slots, setSlots] = useState([]);
  const [leads, setLeads] = useState([]);
  const [funnelCounts, setFunnelCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [leadFilterSlot, setLeadFilterSlot] = useState("");
  const [leadFilterStatus, setLeadFilterStatus] = useState("");
  const [leadFilterSource, setLeadFilterSource] = useState("");
  const [leadFilterResult, setLeadFilterResult] = useState("");

  const [newPhone, setNewPhone] = useState("");
  const [newParentName, setNewParentName] = useState("");
  const [newChildName, setNewChildName] = useState("");
  const [newChildAge, setNewChildAge] = useState("");
  const [newSource, setNewSource] = useState("website");
  const [newNotes, setNewNotes] = useState("");

  const [taskLead, setTaskLead] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDueDate, setTaskDueDate] = useState("");
  const [assignSlotByLead, setAssignSlotByLead] = useState({});

  const [slotDate, setSlotDate] = useState("");
  const [slotTime, setSlotTime] = useState(DEFAULT_TIME);
  const [slotCapacity, setSlotCapacity] = useState(String(DEFAULT_CAPACITY));
  const [editingSlotId, setEditingSlotId] = useState(null);
  const [editSlotDate, setEditSlotDate] = useState("");
  const [editSlotTime, setEditSlotTime] = useState(DEFAULT_TIME);
  const [editSlotCapacity, setEditSlotCapacity] = useState(String(DEFAULT_CAPACITY));

  const leadSelect = `
    id, slot_id, child_age, status, source, notes, created_at, assessment_result,
    slot:assessment_slots(id, slot_date, start_time),
    participant:participants(full_name, family:families(phone, parent_name)),
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
    if (leadFilterSource) q = q.eq("source", leadFilterSource);
    if (leadFilterResult) q = q.eq("assessment_result", leadFilterResult);
    const { data, error } = await q;
    if (error) toast.show(error.message);
    else setLeads(data || []);
  }, [leadFilterSlot, leadFilterStatus, leadFilterSource, leadFilterResult, toast]);

  const loadFunnel = useCallback(async () => {
    try {
      const counts = await loadLeadFunnelCounts();
      setFunnelCounts(counts);
    } catch (e) {
      toast.show(e.message);
    }
  }, [toast]);

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
    loadFunnel();
  }, [view, loadLeads, loadFunnel]);

  const leadStatusLabel = (status) => ({
    new: t("leadStatusNew"),
    call: t("leadStatusCall"),
    registered_assessment: t("leadStatusRegisteredAssessment"),
    passed: t("leadStatusPassed"),
    registered_class: t("leadStatusRegisteredClass"),
    abandoned: t("leadStatusAbandoned"),
    converted: t("leadStatusConverted"),
    cancelled: t("leadStatusCancelled"),
  }[status] || status);

  const leadSourceLabel = (source) => ({
    recommendation: t("leadSourceRecommendation"),
    facebook: t("leadSourceFacebook"),
    website: t("leadSourceWebsite"),
    import: t("leadSourceImport"),
    web: t("leadSourceWebsite"),
  }[source] || source);

  const assessmentResultLabel = (result) => ({
    pending: t("assessmentResultPending"),
    passed: t("assessmentResultPassed"),
    failed: t("assessmentResultFailed"),
  }[result] || result);

  const futureSlots = slots.filter(
    (s) => s.active && s.slot_date >= todayDateStr() && s.enrolled_count < s.capacity,
  );

  const viewOptions = [
    { value: "slots", label: t("assessmentSlots") },
    { value: "leads", label: t("assessmentLeads") },
  ];

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

  const startEditSlot = (slot) => {
    setEditingSlotId(slot.id);
    setEditSlotDate(slot.slot_date);
    setEditSlotTime(String(slot.start_time).slice(0, 5));
    setEditSlotCapacity(String(slot.capacity));
  };

  const saveSlotEdit = async (slot) => {
    const cap = Number(editSlotCapacity);
    if (!editSlotDate || !Number.isInteger(cap) || cap < 1) {
      return toast.show(t("assessmentCapacityInvalid"));
    }
    if (slot.enrolled_count > 0 && !confirm(t("editSlotWarning"))) return;

    setSaving(true);
    const { error } = await supabase
      .from("assessment_slots")
      .update({
        slot_date: editSlotDate,
        start_time: editSlotTime || DEFAULT_TIME,
        capacity: cap,
      })
      .eq("id", slot.id);

    if (error) {
      toast.show(error.message);
      setSaving(false);
      return;
    }

    try {
      await syncAssessmentSlotSession(slot.id);
      toast.show(t("assessmentSlotUpdated"));
      setEditingSlotId(null);
      await loadSlots();
    } catch (e) {
      toast.show(e.message);
    }
    setSaving(false);
  };

  const handleCreateLead = async () => {
    if (!newPhone.trim() || !newChildName.trim()) {
      return toast.show(t("phoneRequired"));
    }
    setSaving(true);
    try {
      const data = await createAssessmentLead({
        phone: newPhone.trim(),
        childName: newChildName.trim(),
        parentName: newParentName.trim() || null,
        source: newSource,
        notes: newNotes.trim() || null,
        childAge: newChildAge ? Number(newChildAge) : null,
      });
      if (data?.result !== "ok") {
        toast.show(t("systemError"));
      } else {
        toast.show(t("leadCreated"));
        setNewPhone("");
        setNewParentName("");
        setNewChildName("");
        setNewChildAge("");
        setNewNotes("");
        setNewSource("website");
        await loadLeads();
        await loadFunnel();
      }
    } catch (e) {
      toast.show(e.message);
    }
    setSaving(false);
  };

  const handleLeadFieldChange = async (lead, { status, source }) => {
    setSaving(true);
    try {
      const data = await updateLeadCrm({
        leadId: lead.id,
        status: status ?? undefined,
        source: source ?? undefined,
      });
      if (data?.result !== "ok") {
        toast.show(t("systemError"));
      } else {
        toast.show(t("leadUpdated"));
        await loadLeads();
        await loadFunnel();
      }
    } catch (e) {
      toast.show(e.message);
    }
    setSaving(false);
  };

  const handleAbandonLead = async (lead) => {
    if (!confirm(t("abandonLeadConfirm"))) return;
    setSaving(true);
    try {
      const data = await updateLeadCrm({ leadId: lead.id, status: "abandoned" });
      if (data?.result !== "ok") toast.show(t("systemError"));
      else {
        toast.show(t("leadMarkedAbandoned"));
        await loadLeads();
        await loadFunnel();
        await loadSlots();
      }
    } catch (e) {
      toast.show(e.message);
    }
    setSaving(false);
  };

  const handleAssignSlot = async (lead) => {
    const slotId = assignSlotByLead[lead.id];
    if (!slotId) return;
    setSaving(true);
    try {
      const data = await updateLeadCrm({ leadId: lead.id, slotId });
      if (data?.result !== "ok") {
        toast.show(data?.result === "slot_full" ? t("assessmentCapacityInvalid") : t("systemError"));
      } else {
        toast.show(t("leadAssignedSlot"));
        setAssignSlotByLead((prev) => ({ ...prev, [lead.id]: "" }));
        await loadLeads();
        await loadFunnel();
        await loadSlots();
      }
    } catch (e) {
      toast.show(e.message);
    }
    setSaving(false);
  };

  const openTasks = async (lead) => {
    setTaskLead(lead);
    setTaskTitle("");
    setTaskDueDate(addDays(todayDateStr(), 1));
    try {
      const rows = await listLeadTasks(lead.id);
      setTasks(rows);
    } catch (e) {
      toast.show(e.message);
      setTasks([]);
    }
  };

  const closeTasks = () => {
    setTaskLead(null);
    setTasks([]);
  };

  const handleAddTask = async () => {
    if (!taskLead || !taskTitle.trim() || !taskDueDate) return;
    setSaving(true);
    try {
      const data = await createLeadTask({
        leadId: taskLead.id,
        title: taskTitle.trim(),
        dueDate: taskDueDate,
      });
      if (data?.result !== "ok") toast.show(t("systemError"));
      else {
        setTaskTitle("");
        setTasks(await listLeadTasks(taskLead.id));
      }
    } catch (e) {
      toast.show(e.message);
    }
    setSaving(false);
  };

  const handleCompleteTask = async (taskId) => {
    setSaving(true);
    try {
      const data = await completeLeadTask(taskId);
      if (data?.result !== "ok") toast.show(t("systemError"));
      else {
        toast.show(t("taskCompleted"));
        if (taskLead) setTasks(await listLeadTasks(taskLead.id));
      }
    } catch (e) {
      toast.show(e.message);
    }
    setSaving(false);
  };

  if (loading && view === "slots") {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: 32 }}>
        <Spinner />
      </div>
    );
  }

  return (
    <div>
      {!isDesktop && (
        <div className="page-header">
          <h1 className="page-title">{t("tabAssessment")}</h1>
        </div>
      )}

      <div className="filter-bar" style={{ marginBottom: 16 }}>
        <SegmentedControl options={viewOptions} value={view} onChange={setView} size="sm" />
      </div>

      {view === "slots" ? (
        <>
          <Card style={{ marginBottom: 20 }}>
            <div className="section-sub" style={{ marginBottom: 12 }}>{t("addAssessmentSlot")}</div>
            <Field label={t("date")}>
              <Input type="date" value={slotDate} onChange={(e) => setSlotDate(e.target.value)} dir="ltr" />
            </Field>
            <Field label={t("startTime")}>
              <Input type="time" value={slotTime} onChange={(e) => setSlotTime(e.target.value)} dir="ltr" />
            </Field>
            <Field label={t("assessmentCapacity")}>
              <Input type="number" min={1} value={slotCapacity} onChange={(e) => setSlotCapacity(e.target.value)} dir="ltr" />
            </Field>
            <Button variant="primary" onClick={addSlot} disabled={saving}>
              {saving ? <><Spinner size={14} color="var(--on-primary)" /> {t("saving")}</> : t("saveAssessmentSlot")}
            </Button>
          </Card>

          {slots.length === 0 ? (
            <EmptyState title={t("noAssessmentSlots")} />
          ) : (
            <div className="grouped-list">
              {slots.map((slot) => (
                <div className="user-row" key={slot.id} style={{ flexWrap: "wrap", gap: 8 }}>
                  {editingSlotId === slot.id ? (
                    <div style={{ flex: 1, width: "100%" }}>
                      <Field label={t("date")}>
                        <Input type="date" value={editSlotDate} onChange={(e) => setEditSlotDate(e.target.value)} dir="ltr" />
                      </Field>
                      <Field label={t("startTime")}>
                        <Input type="time" value={editSlotTime} onChange={(e) => setEditSlotTime(e.target.value)} dir="ltr" />
                      </Field>
                      <Field label={t("assessmentCapacity")}>
                        <Input type="number" min={1} value={editSlotCapacity} onChange={(e) => setEditSlotCapacity(e.target.value)} dir="ltr" />
                      </Field>
                      <div style={{ display: "flex", gap: 6 }}>
                        <Button type="button" variant="primary" size="sm" onClick={() => saveSlotEdit(slot)} disabled={saving}>
                          {t("saveChanges")}
                        </Button>
                        <Button type="button" variant="secondary" size="sm" onClick={() => setEditingSlotId(null)}>{t("cancel")}</Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="user-info" style={{ flex: 1 }}>
                        <div className="user-display" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          {fmtDateDay(slot.slot_date)} · {fmt_time(slot.start_time)}
                          <Badge variant={slot.active ? "success" : "neutral"}>
                            {slot.active ? t("active") : t("cancelled")}
                          </Badge>
                        </div>
                        <div className="user-email">
                          {t("assessmentEnrolled", { n: slot.enrolled_count, cap: slot.capacity })}
                        </div>
                      </div>
                      {slot.active && slot.slot_date >= todayDateStr() && (
                        <div style={{ display: "flex", gap: 6 }}>
                          <Button variant="secondary" size="sm" onClick={() => startEditSlot(slot)} disabled={saving}>
                            {t("editAssessmentSlot")}
                          </Button>
                          <Button variant="danger" size="sm" onClick={() => cancelSlot(slot)} disabled={saving}>
                            {t("cancelAssessmentSlot")}
                          </Button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <Card style={{ marginBottom: 16 }}>
            <div className="section-sub" style={{ marginBottom: 8 }}>{t("leadFunnelTitle")}</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {LEAD_FUNNEL_STATUSES.map((st) => (
                <Badge key={st} variant={leadStatusBadgeVariant(st)} style={{ fontSize: 13 }}>
                  {leadStatusLabel(st)}: {funnelCounts[st] ?? 0}
                </Badge>
              ))}
            </div>
          </Card>

          <Card style={{ marginBottom: 16 }}>
            <div className="section-sub" style={{ marginBottom: 12 }}>{t("createLead")}</div>
            <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
              <Input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder={t("parentPhone")} dir="ltr" />
              <Input value={newParentName} onChange={(e) => setNewParentName(e.target.value)} placeholder={t("parentName")} />
              <Input value={newChildName} onChange={(e) => setNewChildName(e.target.value)} placeholder={t("childName")} />
              <Input type="number" min={1} max={120} value={newChildAge} onChange={(e) => setNewChildAge(e.target.value)} placeholder={t("childAge")} dir="ltr" />
              <Select value={newSource} onChange={(e) => setNewSource(e.target.value)}>
                {LEAD_SOURCES.filter((s) => s !== "import").map((src) => (
                  <option key={src} value={src}>{leadSourceLabel(src)}</option>
                ))}
              </Select>
              <Input value={newNotes} onChange={(e) => setNewNotes(e.target.value)} placeholder={t("leadNotes")} />
            </div>
            <Button variant="primary" size="sm" style={{ marginTop: 10 }} onClick={handleCreateLead} disabled={saving}>
              {t("createLeadSave")}
            </Button>
          </Card>

          <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
            <Select value={leadFilterSlot} onChange={(e) => setLeadFilterSlot(e.target.value)} style={{ flex: 1, minWidth: 140 }}>
              <option value="">{t("allSlots")}</option>
              {slots.map((s) => (
                <option key={s.id} value={s.id}>
                  {fmtDateDay(s.slot_date)} {fmt_time(s.start_time)}
                </option>
              ))}
            </Select>
            <Select value={leadFilterStatus} onChange={(e) => setLeadFilterStatus(e.target.value)} style={{ flex: 1, minWidth: 120 }}>
              <option value="">{t("allStatuses")}</option>
              {LEAD_FUNNEL_STATUSES.map((st) => (
                <option key={st} value={st}>{leadStatusLabel(st)}</option>
              ))}
            </Select>
            <Select value={leadFilterSource} onChange={(e) => setLeadFilterSource(e.target.value)} style={{ flex: 1, minWidth: 120 }}>
              <option value="">{t("allSources")}</option>
              {LEAD_SOURCES.map((src) => (
                <option key={src} value={src}>{leadSourceLabel(src)}</option>
              ))}
            </Select>
            <Select value={leadFilterResult} onChange={(e) => setLeadFilterResult(e.target.value)} style={{ flex: 1, minWidth: 120 }}>
              <option value="">{t("allResults")}</option>
              {ASSESSMENT_RESULTS.map((r) => (
                <option key={r} value={r}>{assessmentResultLabel(r)}</option>
              ))}
            </Select>
          </div>

          {leads.length === 0 ? (
            <EmptyState title={t("noAssessmentLeads")} />
          ) : (
            <div className="grouped-list">
              {leads.map((lead) => (
                <div className="user-row" key={lead.id} style={{ flexWrap: "wrap", gap: 8 }}>
                  <div className="user-info" style={{ flex: 1, minWidth: 200 }}>
                    <div className="user-display" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      {lead.participant?.full_name || "—"}
                      <Badge variant={leadStatusBadgeVariant(lead.status)}>
                        {leadStatusLabel(lead.status)}
                      </Badge>
                    </div>
                    <div className="user-email">
                      {lead.participant?.family?.phone ? `${lead.participant.family.phone}` : ""}
                      {lead.participant?.family?.parent_name ? ` · ${lead.participant.family.parent_name}` : ""}
                    </div>
                    <div className="user-email">
                      {lead.slot ? `${fmtDateDay(lead.slot.slot_date)} ${fmt_time(lead.slot.start_time)}` : "—"}
                      {lead.child_age != null ? ` · ${t("childAge")}: ${lead.child_age}` : ""}
                      {lead.assessment_result ? ` · ${assessmentResultLabel(lead.assessment_result)}` : ""}
                    </div>
                    {lead.notes ? <div className="user-email">{lead.notes}</div> : null}
                  </div>

                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                    <Select
                      style={{ minWidth: 130 }}
                      value={lead.status}
                      disabled={saving || lead.status === "abandoned"}
                      onChange={(e) => handleLeadFieldChange(lead, { status: e.target.value })}
                    >
                      {LEAD_FUNNEL_STATUSES.map((st) => (
                        <option key={st} value={st}>{leadStatusLabel(st)}</option>
                      ))}
                    </Select>
                    <Select
                      style={{ minWidth: 110 }}
                      value={lead.source || "website"}
                      disabled={saving}
                      onChange={(e) => handleLeadFieldChange(lead, { source: e.target.value })}
                    >
                      {LEAD_SOURCES.map((src) => (
                        <option key={src} value={src}>{leadSourceLabel(src)}</option>
                      ))}
                    </Select>
                    <Button type="button" variant="secondary" size="sm" onClick={() => openTasks(lead)} disabled={saving}>
                      {t("followUpTasks")}
                    </Button>
                    {!lead.slot_id && ["new", "call"].includes(lead.status) && (
                      <>
                        <Select
                          style={{ minWidth: 140 }}
                          value={assignSlotByLead[lead.id] || ""}
                          onChange={(e) => setAssignSlotByLead((prev) => ({ ...prev, [lead.id]: e.target.value }))}
                        >
                          <option value="">{t("assignSlot")}</option>
                          {futureSlots.map((s) => (
                            <option key={s.id} value={s.id}>
                              {fmtDateDay(s.slot_date)} {fmt_time(s.start_time)}
                            </option>
                          ))}
                        </Select>
                        <Button type="button" variant="primary" size="sm" disabled={saving || !assignSlotByLead[lead.id]} onClick={() => handleAssignSlot(lead)}>
                          {t("assignSlotSave")}
                        </Button>
                      </>
                    )}
                    {lead.status !== "abandoned" && lead.status !== "registered_class" && (
                      <Button type="button" variant="danger" size="sm" onClick={() => handleAbandonLead(lead)} disabled={saving}>
                        {t("markLeadAbandoned")}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <AnimatePresence>
        {taskLead && (
          <AnimatedSheetOverlay onClose={closeTasks}>
            <AnimatedSheetPanel onClick={(e) => e.stopPropagation()}>
              <div className="section-title">{t("followUpTasks")}</div>
              <div className="section-sub" style={{ marginBottom: 12 }}>
                {taskLead.participant?.full_name || "—"}
              </div>
              <Field label={t("followUpTaskTitle")}>
                <Input value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder={t("followUpTomorrow")} />
              </Field>
              <Field label={t("followUpDueDate")}>
                <Input type="date" value={taskDueDate} onChange={(e) => setTaskDueDate(e.target.value)} dir="ltr" />
              </Field>
              <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                <Button type="button" variant="secondary" size="sm" onClick={() => setTaskDueDate(addDays(todayDateStr(), 1))}>
                  {t("followUpTomorrow")}
                </Button>
                <Button type="button" variant="secondary" size="sm" onClick={() => setTaskDueDate(addDays(todayDateStr(), 7))}>
                  {t("followUpNextWeek")}
                </Button>
              </div>
              <Button type="button" variant="primary" size="sm" onClick={handleAddTask} disabled={saving || !taskTitle.trim()}>
                {t("addFollowUpTask")}
              </Button>
              <div style={{ marginTop: 16 }}>
                {tasks.length === 0 ? (
                  <div className="empty-text">{t("noFollowUpTasks")}</div>
                ) : (
                  <div className="grouped-list">
                    {tasks.map((task) => (
                      <div className="user-row" key={task.id} style={{ gap: 8 }}>
                        <div className="user-info" style={{ flex: 1 }}>
                          <div className="user-display">{task.title}</div>
                          <div className="user-email">{fmtDateDay(task.due_date)}</div>
                        </div>
                        {!task.completed_at ? (
                          <Button type="button" variant="primary" size="sm" onClick={() => handleCompleteTask(task.id)} disabled={saving}>
                            {t("taskComplete")}
                          </Button>
                        ) : (
                          <Badge variant="success">{t("taskComplete")}</Badge>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <Button type="button" variant="secondary" fullWidth style={{ marginTop: 16 }} onClick={closeTasks}>
                {t("cancel")}
              </Button>
            </AnimatedSheetPanel>
          </AnimatedSheetOverlay>
        )}
      </AnimatePresence>
    </div>
  );
}
