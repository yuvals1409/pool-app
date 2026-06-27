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
import { Button, Field, Input, Select, Spinner } from "./ui/ds/index.js";
import PortalCredentialsCard from "./PortalCredentialsCard.jsx";
import ParticipantPhotoEditor from "./ParticipantPhotoEditor.jsx";
import { staffGetPortalCredentials } from "../lib/childPortal.js";
import "../styles/student-profile.css";

const DAY_NAMES = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

function MetaRow({ label, value, mono = true }) {
  return (
    <div className="sp-meta-row">
      <span className="sp-meta-label">{label}</span>
      <span className={`sp-meta-value${mono ? "" : " text"}`}>{value || "—"}</span>
    </div>
  );
}

export default function StudentProfilePanel({ participantId, profile, open, onClose, toast }) {
  const { t } = useLang();
  const [loading, setLoading] = useState(false);
  const [participant, setParticipant] = useState(null);
  const [enrollments, setEnrollments] = useState([]);
  const [attendanceRate, setAttendanceRate] = useState(null);
  const [editGender, setEditGender] = useState("");
  const [editGrade, setEditGrade] = useState("");
  const [editBirthDate, setEditBirthDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [photoUrl, setPhotoUrl] = useState(null);

  const loadPhoto = useCallback(async () => {
    if (!participantId || !profile) return;
    try {
      const data = await staffGetPortalCredentials(participantId);
      if (data?.result === "ok") setPhotoUrl(data.photo_url || null);
    } catch {
      setPhotoUrl(null);
    }
  }, [participantId, profile]);

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
      await loadPhoto();
    } catch (e) {
      toast?.show(e.message || t("systemError"));
    }
    setLoading(false);
  }, [participantId, toast, t, loadPhoto]);

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
          <AnimatedSheetPanel className="student-profile-panel" onClick={(e) => e.stopPropagation()}>
            <div className="schedule-panel-handle" aria-hidden />

            {loading && !participant ? (
              <div className="sp-loading"><Spinner /></div>
            ) : participant ? (
              <>
                <header className="sp-header">
                  <h2 className="sp-title">{t("studentProfile")}</h2>
                  <div className="sp-subtitle">{participant.full_name}</div>
                  {participant.external_client_id && (
                    <span className="sp-id">#{participant.external_client_id}</span>
                  )}
                </header>

                <div className="sp-meta-card">
                  <MetaRow label={t("parentName")} value={participant.family?.parent_name} mono={false} />
                  <MetaRow label={t("parentPhone")} value={participant.family?.phone} />
                  {participant.first_enrolled_at && (
                    <MetaRow label={t("studentTenure")} value={participant.first_enrolled_at} />
                  )}
                </div>

                <div className="sp-form-card">
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
                    <p className="sp-form-hint">{t("sheetGenderSkippedManual")}</p>
                  )}
                  <Button type="button" variant="primary" size="lg" fullWidth disabled={saving} onClick={save}>
                    {saving ? <Spinner size={16} /> : t("save")}
                  </Button>
                </div>

                {profile && (
                  <>
                    <PortalCredentialsCard
                      participantId={participant.id}
                      profile={profile}
                      phone={participant.family?.phone}
                      toast={toast}
                    />
                    <ParticipantPhotoEditor
                      participantId={participant.id}
                      profile={profile}
                      photoUrl={photoUrl}
                      toast={toast}
                      onUpdated={loadPhoto}
                    />
                  </>
                )}

                <section className="sp-section">
                  <h3 className="sp-section-title">{t("studentCurrentGroup")}</h3>
                  {activeEnrollments.length === 0 ? (
                    <p className="sp-empty">{t("noResults")}</p>
                  ) : (
                    activeEnrollments.map((enr) => (
                      <div key={enr.id} className="sp-enrollment-card">
                        <div className="sp-enrollment-name">
                          {formatProductLabel(enr.product, DAY_NAMES, enr.product?.product_templates?.code)}
                        </div>
                        <div className="sp-enrollment-meta">
                          {enr.product?.instructor_name || "—"}
                          {" · "}{t(`payment${enr.payment_status === "paid" ? "Paid" : enr.payment_status === "waived" ? "Waived" : "Unpaid"}`)}
                        </div>
                        {enr.notes && <div className="sp-enrollment-meta">{enr.notes}</div>}
                      </div>
                    ))
                  )}
                </section>

                <section className="sp-section">
                  <h3 className="sp-section-title">{t("studentAttendanceRate")}</h3>
                  <p className="sp-stat-value">{attendanceRate != null ? `${attendanceRate}%` : "—"}</p>
                  <p className="sp-stat-label">{t("ccPeriodMonth")}</p>
                </section>

                <section className="sp-section">
                  <h3 className="sp-section-title">{t("studentEnrollmentHistory")}</h3>
                  <div className="sp-history-scroll">
                    {enrollments.map((enr) => (
                      <div key={enr.id} className={`sp-enrollment-card${enr.active ? "" : " inactive"}`}>
                        <div className="sp-enrollment-name">
                          {formatProductLabel(enr.product, DAY_NAMES, enr.product?.product_templates?.code)}
                        </div>
                        <div className="sp-enrollment-meta">
                          {enr.valid_from} – {enr.valid_until}
                          {enr.active ? ` · ${t("enrollmentActiveLabel")}` : ` · ${t("enrollmentCancelled")}`}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                <Button type="button" variant="secondary" size="lg" fullWidth className="sp-close-btn" onClick={onClose}>
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
      <p className="sp-empty">{t("noResults")}</p>
      <Button type="button" variant="secondary" size="lg" fullWidth className="sp-close-btn" onClick={onClose}>
        {t("close")}
      </Button>
    </>
  );
}
