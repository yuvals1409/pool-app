import { useState, useEffect, useCallback } from "react";
import { AnimatePresence } from "framer-motion";
import { supabase } from "../lib/supabase.js";
import { useLang } from "../i18n.jsx";
import { formatProductLabel } from "../lib/productLabel.js";
import { PARTICIPANT_GRADES } from "../lib/participantFields.js";
import {
  getAttendanceSummary,
  periodPresetRange,
} from "../lib/commandCenter.js";
import { AnimatedSheetOverlay, AnimatedSheetPanel } from "./ui/AnimatedSheet.jsx";
import { Button, Card, Field, Input, Select, Spinner } from "./ui/ds/index.js";

const DAY_NAMES = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

export default function StudentProfilePanel({ participantId, open, onClose, toast }) {
  const { t } = useLang();
  const [loading, setLoading] = useState(false);
  const [participant, setParticipant] = useState(null);
  const [enrollments, setEnrollments] = useState([]);
  const [attendanceRate, setAttendanceRate] = useState(null);
  const [editGender, setEditGender] = useState("");
  const [editGrade, setEditGrade] = useState("");
  const [editBirthDate, setEditBirthDate] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!participantId) return;
    setLoading(true);
    try {
      const { data: part, error } = await supabase
        .from("participants")
        .select("id, full_name, gender, grade, birth_date, gender_manual_at, external_client_id, first_enrolled_at, family:families(id, phone, parent_name, email)")
        .eq("id", participantId)
        .maybeSingle();
      if (error) throw error;
      setParticipant(part);
      setEditGender(part?.gender || "");
      setEditGrade(part?.grade || "");
      setEditBirthDate(part?.birth_date || "");

      const { data: enrs, error: enrErr } = await supabase
        .from("enrollments")
        .select(`
          id, active, payment_status, valid_from, valid_until, notes, cancelled_at,
          product:products(id, name, day_of_week, start_time, end_time, instructor_name, schedule_pattern, product_templates(code))
        `)
        .eq("participant_id", participantId)
        .order("valid_from", { ascending: false });
      if (enrErr) throw enrErr;
      setEnrollments(enrs || []);

      const { from, to } = periodPresetRange("month");
      const summary = await getAttendanceSummary(from, to, "participant");
      const row = (summary || []).find((r) => r.entity_id === participantId);
      setAttendanceRate(row?.attendance_rate ?? null);
    } catch (e) {
      toast?.show(e.message || t("systemError"));
    }
    setLoading(false);
  }, [participantId, toast, t]);

  useEffect(() => {
    if (open && participantId) load();
    if (!open) {
      setParticipant(null);
      setEnrollments([]);
    }
  }, [open, participantId, load]);

  const save = async () => {
    if (!participant) return;
    setSaving(true);
    try {
      const genderChanged = editGender && editGender !== participant.gender;
      const { error } = await supabase.from("participants").update({
        gender: editGender || null,
        grade: editGrade || null,
        birth_date: editBirthDate || null,
        ...(genderChanged ? { gender_manual_at: new Date().toISOString() } : {}),
      }).eq("id", participant.id);
      if (error) throw error;
      toast?.show(t("save"));
      await load();
    } catch (e) {
      toast?.show(e.message || t("systemError"));
    }
    setSaving(false);
  };

  const activeEnrollments = enrollments.filter((e) => e.active);

  return (
    <AnimatePresence>
      {open && (
        <AnimatedSheetOverlay onClose={onClose}>
          <AnimatedSheetPanel onClick={(e) => e.stopPropagation()}>
            <div className="section-title">{t("studentProfile")}</div>
            {loading && !participant ? (
              <div style={{ display: "flex", justifyContent: "center", padding: 24 }}>
                <Spinner />
              </div>
            ) : participant ? (
              <>
                <div className="section-sub" style={{ marginBottom: 12 }}>
                  {participant.full_name}
                  {participant.external_client_id ? ` · #${participant.external_client_id}` : ""}
                </div>

                <Card style={{ marginBottom: 12, padding: 12 }}>
                  <div className="log-meta" style={{ marginBottom: 8 }}>
                    {t("parentName")}: {participant.family?.parent_name || "—"}
                  </div>
                  <div className="log-meta" style={{ marginBottom: 8 }}>
                    {t("parentPhone")}: {participant.family?.phone || "—"}
                  </div>
                  {participant.first_enrolled_at && (
                    <div className="log-meta">
                      {t("studentTenure")}: {participant.first_enrolled_at}
                    </div>
                  )}
                </Card>

                <Field label={t("participantGenderLabel")}>
                  <Select value={editGender} onChange={(e) => setEditGender(e.target.value)}>
                    <option value="">{t("participantGenderLabel")}</option>
                    <option value="male">{t("participantGender_male")}</option>
                    <option value="female">{t("participantGender_female")}</option>
                  </Select>
                </Field>
                <Field label={t("participantGradeLabel")}>
                  <Select value={editGrade} onChange={(e) => setEditGrade(e.target.value)}>
                    <option value="">{t("participantGradeLabel")}</option>
                    {PARTICIPANT_GRADES.map((g) => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </Select>
                </Field>
                <Field label={t("participantBirthDateLabel")}>
                  <Input type="date" value={editBirthDate} onChange={(e) => setEditBirthDate(e.target.value)} dir="ltr" />
                </Field>
                {participant.gender_manual_at && (
                  <p className="schedule-session-hint">{t("sheetGenderSkippedManual")}</p>
                )}
                <Button type="button" variant="primary" size="sm" disabled={saving} onClick={save} style={{ marginBottom: 16 }}>
                  {saving ? <Spinner size={14} /> : t("save")}
                </Button>

                <div className="section-title" style={{ fontSize: 14 }}>{t("studentCurrentGroup")}</div>
                {activeEnrollments.length === 0 ? (
                  <p className="empty-text" style={{ marginBottom: 12 }}>{t("noResults")}</p>
                ) : (
                  activeEnrollments.map((enr) => (
                    <div key={enr.id} className="log-item" style={{ marginBottom: 8 }}>
                      <div className="log-name">{formatProductLabel(enr.product, DAY_NAMES, enr.product?.product_templates?.code)}</div>
                      <div className="log-meta">
                        {enr.product?.instructor_name || "—"}
                        {" · "}{t(`payment${enr.payment_status === "paid" ? "Paid" : enr.payment_status === "waived" ? "Waived" : "Unpaid"}`)}
                      </div>
                      {enr.notes && <div className="log-meta">{enr.notes}</div>}
                    </div>
                  ))
                )}

                <div className="section-title" style={{ fontSize: 14, marginTop: 12 }}>{t("studentAttendanceRate")}</div>
                <p className="log-meta" style={{ marginBottom: 12 }}>
                  {attendanceRate != null ? `${attendanceRate}%` : "—"} ({t("ccPeriodMonth")})
                </p>

                <div className="section-title" style={{ fontSize: 14 }}>{t("studentEnrollmentHistory")}</div>
                <div style={{ maxHeight: 200, overflowY: "auto" }}>
                  {enrollments.map((enr) => (
                    <div key={enr.id} className="log-item" style={{ marginBottom: 6, opacity: enr.active ? 1 : 0.65 }}>
                      <div className="log-name">{formatProductLabel(enr.product, DAY_NAMES, enr.product?.product_templates?.code)}</div>
                      <div className="log-meta">
                        {enr.valid_from} – {enr.valid_until}
                        {enr.active ? ` · ${t("enrollmentActiveLabel")}` : ` · ${t("enrollmentCancelled")}`}
                      </div>
                    </div>
                  ))}
                </div>

                <Button type="button" variant="secondary" fullWidth style={{ marginTop: 16 }} onClick={onClose}>
                  {t("close")}
                </Button>
              </>
            ) : (
              <EmptyProfile onClose={onClose} t={t} />
            )}
          </AnimatedSheetPanel>
        </AnimatedSheetOverlay>
      )}
    </AnimatePresence>
  );
}

function EmptyProfile({ onClose, t }) {
  return (
    <>
      <p className="empty-text">{t("noResults")}</p>
      <Button type="button" variant="secondary" fullWidth onClick={onClose}>{t("close")}</Button>
    </>
  );
}
