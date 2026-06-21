import { useState, useEffect, useCallback } from "react";
import {
  supabase,
  ensureWeeklySessionsGenerated,
  ensureAccessPassesGenerated,
  ensureCourseSeriesSessions,
} from "../../lib/supabase.js";
import { copyEnrollmentTicketLink } from "../../lib/accessPass.js";
import { regenerateEnrollmentPasses } from "../../lib/summerCourse.js";
import { formatProductLabel } from "../../lib/productLabel.js";
import { useLang } from "../../i18n.jsx";
import { useStudentProfile } from "../../lib/StudentProfileContext.jsx";
import { cancelEnrollment as cancelEnrollmentRpc } from "../../lib/waitlist.js";
import { useIsDesktop } from "../../lib/useBreakpoint.js";
import {
  PARTICIPANT_GRADES,
  gradeRequired,
  validateParticipantFields,
} from "../../lib/participantFields.js";
import { getEnrollmentUtilization, listUtilizationReport } from "../../lib/utilization.js";
import MakeupBookingModal from "../MakeupBookingModal.jsx";
import BillingPaymentModal from "../BillingPaymentModal.jsx";
import { billingTypeForTemplate } from "../../lib/billing.js";
import {
  Avatar,
  Badge,
  Button,
  Card,
  Field,
  Input,
  Select,
  Spinner,
} from "../ui/ds/index.js";

const PAYMENT_STATUSES = ["unpaid", "paid", "waived"];
const PAYMENT_BADGE_VARIANT = { paid: "success", unpaid: "warn", waived: "neutral" };

function normalizePhone(phone) {
  return phone.replace(/\s/g, "").trim();
}

const ENROLLMENT_SELECT = `
  id, payment_status, valid_from, valid_until, active,
  participant:participants(id, full_name, birth_date, gender, grade, family:families(id, phone, parent_name)),
  product:products(id, name, day_of_week, start_time, end_time, instructor_name, level, level_label, target_audience, gender, schedule_pattern, product_templates(code))
`;

export default function GroupEnrollmentsPanel({
  toast,
  season,
  seasonIsLive,
  products,
  productId,
  searchMode = false,
  searchRows = [],
  searchLoading = false,
  onSearchRefresh,
  historyFilter = "active",
  showClassColumn = false,
  onEnrollmentChange,
  showAddButton = true,
}) {
  const { t, days, fmtDateDay } = useLang();
  const { openProfile } = useStudentProfile();
  const isDesktop = useIsDesktop();

  const [rows, setRows] = useState([]);
  const [listLoading, setListLoading] = useState(false);
  const [savingId, setSavingId] = useState(null);

  const [showAddForm, setShowAddForm] = useState(false);
  const [addSaving, setAddSaving] = useState(false);
  const [parentPhone, setParentPhone] = useState("");
  const [parentName, setParentName] = useState("");
  const [childName, setChildName] = useState("");
  const [addGender, setAddGender] = useState("");
  const [addGrade, setAddGrade] = useState("");
  const [addBirthDate, setAddBirthDate] = useState("");
  const [addProductId, setAddProductId] = useState("");
  const [addPaymentStatus, setAddPaymentStatus] = useState("unpaid");

  const [editingId, setEditingId] = useState(null);
  const [editChildName, setEditChildName] = useState("");
  const [editParentPhone, setEditParentPhone] = useState("");
  const [editProductId, setEditProductId] = useState("");
  const [editPaymentStatus, setEditPaymentStatus] = useState("unpaid");
  const [editValidFrom, setEditValidFrom] = useState("");
  const [editValidUntil, setEditValidUntil] = useState("");
  const [editGender, setEditGender] = useState("");
  const [editGrade, setEditGrade] = useState("");
  const [editBirthDate, setEditBirthDate] = useState("");
  const [utilizationMap, setUtilizationMap] = useState({});
  const [makeupRow, setMakeupRow] = useState(null);
  const [makeupUtil, setMakeupUtil] = useState(null);
  const [billingRow, setBillingRow] = useState(null);

  const todayStr = () => new Date().toISOString().slice(0, 10);

  const paymentLabel = (status) => ({
    paid: t("paymentPaid"),
    unpaid: t("paymentUnpaid"),
    waived: t("paymentWaived"),
  }[status] || status);

  const productLabel = (p) => formatProductLabel(p, days, p?.product_templates?.code);

  useEffect(() => {
    if (productId) setAddProductId(productId);
  }, [productId]);

  const loadUtilization = useCallback(async (enrollmentRows, pid = null) => {
    const active = (enrollmentRows || []).filter((r) => r.active);
    if (!active.length) {
      setUtilizationMap({});
      return;
    }
    try {
      if (pid) {
        const report = await listUtilizationReport({
          asOf: todayStr(),
          productId: pid,
          minShortfall: 0,
        });
        const map = {};
        for (const r of report) map[r.enrollment_id] = r;
        setUtilizationMap(map);
        return;
      }
      const results = await Promise.all(
        active.map((r) => getEnrollmentUtilization(r.id, todayStr())),
      );
      const map = {};
      active.forEach((r, i) => {
        const u = results[i];
        if (u?.result === "ok") {
          map[r.id] = {
            entitled: u.entitled,
            utilized: u.utilized,
            shortfall: u.shortfall,
            makeup_scheduled: u.makeup_scheduled,
          };
        }
      });
      setUtilizationMap(map);
    } catch {
      setUtilizationMap({});
    }
  }, []);

  const loadByProduct = useCallback(async (pid, filter) => {
    if (!pid) {
      setRows([]);
      setUtilizationMap({});
      return;
    }
    setListLoading(true);
    let q = supabase
      .from("enrollments")
      .select(ENROLLMENT_SELECT)
      .eq("product_id", pid)
      .order("created_at", { ascending: true });
    if (filter === "active") q = q.eq("active", true);
    else if (filter === "cancelled") q = q.eq("active", false);
    const { data, error } = await q;
    if (error) toast.show(error.message);
    else {
      setRows(data || []);
      await loadUtilization(data || [], pid);
    }
    setListLoading(false);
  }, [loadUtilization, toast]);

  useEffect(() => {
    if (!searchMode) loadByProduct(productId, historyFilter);
  }, [productId, searchMode, historyFilter, loadByProduct]);

  useEffect(() => {
    if (searchMode && searchRows.length) {
      loadUtilization(searchRows);
    }
  }, [searchMode, searchRows, loadUtilization]);

  const reload = async () => {
    if (searchMode && onSearchRefresh) {
      await onSearchRefresh();
    } else if (productId) {
      await loadByProduct(productId, historyFilter);
    }
    onEnrollmentChange?.();
  };

  const productTemplateCode = (pid) => {
    const p = products.find((x) => x.id === pid);
    return p?.product_templates?.code;
  };

  const syncSessionsForProduct = async (pid) => {
    if (!seasonIsLive) return;
    const code = productTemplateCode(pid);
    if (code === "summer_course") {
      await ensureCourseSeriesSessions(pid);
    } else {
      await ensureWeeklySessionsGenerated();
      await ensureAccessPassesGenerated();
    }
  };

  const cancelEnrollment = async (row) => {
    const name = row.participant?.full_name || "—";
    if (!confirm(t("cancelEnrollmentConfirm", { name }))) return;
    setSavingId(row.id);
    try {
      const data = await cancelEnrollmentRpc(row.id);
      if (data?.result !== "ok") {
        toast.show(t("systemError"));
      } else {
        toast.show(t("enrollmentCancelled"));
        await reload();
      }
    } catch (e) {
      toast.show(e.message);
    }
    setSavingId(null);
  };

  const startEdit = (row) => {
    setEditingId(row.id);
    setEditChildName(row.participant?.full_name || "");
    setEditParentPhone(row.participant?.family?.phone || "");
    setEditProductId(row.product?.id || "");
    setEditPaymentStatus(row.payment_status);
    setEditValidFrom(row.valid_from || "");
    setEditValidUntil(row.valid_until || "");
    setEditGender(row.participant?.gender || "");
    setEditGrade(row.participant?.grade || "");
    setEditBirthDate(row.participant?.birth_date || "");
  };

  const cancelEdit = () => setEditingId(null);

  const saveEdit = async (row) => {
    setSavingId(row.id);
    try {
      const familyId = row.participant?.family?.id;
      if (familyId && editParentPhone.trim()) {
        await supabase.from("families").update({ phone: normalizePhone(editParentPhone) }).eq("id", familyId);
      }
      if (row.participant?.id && editChildName.trim()) {
        await supabase.from("participants").update({
          full_name: editChildName.trim(),
          gender: editGender || null,
          grade: editGrade || null,
          birth_date: editBirthDate || null,
        }).eq("id", row.participant.id);
      }
      const productChanged = editProductId && editProductId !== row.product?.id;
      const { error } = await supabase.from("enrollments").update({
        payment_status: editPaymentStatus,
        valid_from: editValidFrom || row.valid_from,
        valid_until: editValidUntil || row.valid_until,
        ...(editProductId ? { product_id: editProductId } : {}),
      }).eq("id", row.id);
      if (error) throw error;

      const targetProductId = editProductId || row.product?.id;
      if (productChanged) await syncSessionsForProduct(targetProductId);
      else await regenerateEnrollmentPasses(row.id);

      toast.show(t("enrollmentUpdated"));
      setEditingId(null);
      await reload();
    } catch (e) {
      toast.show(e.message || t("systemError"));
    }
    setSavingId(null);
  };

  const handleRegeneratePasses = async (row) => {
    setSavingId(row.id);
    try {
      await regenerateEnrollmentPasses(row.id);
      toast.show(t("passesRegenerated"));
    } catch (e) {
      toast.show(e.message || t("systemError"));
    }
    setSavingId(null);
  };

  const findOrCreateFamily = async (phone, name) => {
    const { data: existing } = await supabase
      .from("families")
      .select("id, parent_name")
      .eq("phone", phone)
      .maybeSingle();
    if (existing) {
      if (name && name !== existing.parent_name) {
        await supabase.from("families").update({ parent_name: name }).eq("id", existing.id);
      }
      return existing.id;
    }
    const { data: created, error } = await supabase
      .from("families")
      .insert({ phone, parent_name: name || null })
      .select("id")
      .single();
    if (error) throw error;
    return created.id;
  };

  const findOrCreateParticipant = async (familyId, fullName, { gender, grade, birthDate } = {}) => {
    const trimmed = fullName.trim();
    const { data: siblings } = await supabase
      .from("participants")
      .select("id, full_name")
      .eq("family_id", familyId);
    const match = (siblings || []).find(
      (p) => p.full_name.trim().toLowerCase() === trimmed.toLowerCase(),
    );
    if (match) {
      if (gender || grade || birthDate) {
        await supabase.from("participants").update({
          ...(gender ? { gender } : {}),
          ...(grade ? { grade } : {}),
          ...(birthDate ? { birth_date: birthDate } : {}),
        }).eq("id", match.id);
      }
      return match.id;
    }
    const { data: created, error } = await supabase
      .from("participants")
      .insert({
        family_id: familyId,
        full_name: trimmed,
        gender: gender || null,
        grade: grade || null,
        birth_date: birthDate || null,
      })
      .select("id")
      .single();
    if (error) throw error;
    return created.id;
  };

  const addEnrollment = async () => {
    const phone = normalizePhone(parentPhone);
    const child = childName.trim();
    const pid = addProductId || productId;
    if (!phone) return toast.show(t("phoneRequired"));
    if (!child) return toast.show(t("childRequired"));
    if (!pid) return toast.show(t("selectClassRequired"));
    if (!season) return toast.show(t("systemError"));

    const fieldErr = validateParticipantFields({
      gender: addGender,
      grade: addGrade || null,
      birthDate: addBirthDate || null,
    }, { t });
    if (fieldErr) return toast.show(fieldErr);

    setAddSaving(true);
    try {
      const familyId = await findOrCreateFamily(phone, parentName.trim());
      const participantId = await findOrCreateParticipant(familyId, child, {
        gender: addGender,
        grade: addGrade || null,
        birthDate: addBirthDate || null,
      });

      const { data: existingEnr } = await supabase
        .from("enrollments")
        .select("id")
        .eq("participant_id", participantId)
        .eq("product_id", pid)
        .eq("active", true)
        .maybeSingle();
      if (existingEnr) {
        toast.show(t("duplicateEnrollment"));
        setAddSaving(false);
        return;
      }

      const { error: enrErr } = await supabase.from("enrollments").insert({
        product_id: pid,
        participant_id: participantId,
        payment_status: addPaymentStatus,
        valid_from: season.start_date,
        valid_until: season.end_date,
        active: true,
      });
      if (enrErr) {
        if (enrErr.code === "23505") toast.show(t("duplicateEnrollment"));
        else throw enrErr;
        setAddSaving(false);
        return;
      }

      await syncSessionsForProduct(pid);

      toast.show(t("enrollmentAdded"));
      setParentPhone("");
      setParentName("");
      setChildName("");
      setAddGender("");
      setAddGrade("");
      setAddBirthDate("");
      setShowAddForm(false);
      await reload();
    } catch (e) {
      toast.show(e.message || t("systemError"));
    }
    setAddSaving(false);
  };

  const displayRows = searchMode ? searchRows : rows;
  const displayLoading = searchMode ? searchLoading : listLoading;
  const colCount = showClassColumn ? 7 : 6;

  const renderParticipantFields = (gender, setGender, grade, setGrade, birthDate, setBirthDate) => {
    const needsGrade = gradeRequired({ birthDate: birthDate || null });
    return (
      <>
        <Field label={t("participantGenderLabel")}>
          <Select value={gender} onChange={(e) => setGender(e.target.value)}>
            <option value="">{t("participantGenderLabel")}</option>
            <option value="male">{t("participantGender_male")}</option>
            <option value="female">{t("participantGender_female")}</option>
          </Select>
        </Field>
        <Field label={t("participantBirthDateLabel")}>
          <Input type="date" dir="ltr" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
        </Field>
        <Field label={t("participantGradeLabel")}>
          <Select
            value={grade}
            onChange={(e) => setGrade(e.target.value)}
            disabled={!needsGrade}
          >
            <option value="">{needsGrade ? t("participantGradeLabel") : t("participantGradeOptionalAdult")}</option>
            {PARTICIPANT_GRADES.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </Select>
        </Field>
      </>
    );
  };

  const renderEditFields = (row) => (
    <>
      <Field label={t("childName")}>
        <Input value={editChildName} onChange={(e) => setEditChildName(e.target.value)} />
      </Field>
      {renderParticipantFields(
        editGender, setEditGender, editGrade, setEditGrade, editBirthDate, setEditBirthDate,
      )}
      <Field label={t("parentPhone")}>
        <Input type="tel" dir="ltr" value={editParentPhone} onChange={(e) => setEditParentPhone(e.target.value)} />
      </Field>
      <Field label={t("selectClass")}>
        <Select value={editProductId} onChange={(e) => setEditProductId(e.target.value)}>
          {products.map((p) => (
            <option key={p.id} value={p.id}>{productLabel(p)}</option>
          ))}
        </Select>
      </Field>
      <Field label={t("paymentStatus")}>
        <Select value={editPaymentStatus} onChange={(e) => setEditPaymentStatus(e.target.value)}>
          {PAYMENT_STATUSES.map((s) => (
            <option key={s} value={s}>{paymentLabel(s)}</option>
          ))}
        </Select>
      </Field>
      <Field label={`${t("validFrom")} / ${t("validUntil")}`}>
        <div style={{ display: "flex", gap: 8 }}>
          <Input type="date" dir="ltr" value={editValidFrom} onChange={(e) => setEditValidFrom(e.target.value)} />
          <Input type="date" dir="ltr" value={editValidUntil} onChange={(e) => setEditValidUntil(e.target.value)} />
        </div>
      </Field>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <Button variant="primary" size="sm" disabled={savingId === row.id} onClick={() => saveEdit(row)}>
          {savingId === row.id ? "..." : t("saveChanges")}
        </Button>
        <Button variant="secondary" size="sm" onClick={cancelEdit}>{t("cancel")}</Button>
      </div>
    </>
  );

  const openMakeup = async (row) => {
    try {
      const data = await getEnrollmentUtilization(row.id, todayStr());
      setMakeupUtil(data);
      setMakeupRow({
        id: row.id,
        child_name: row.participant?.full_name,
        product_name: row.product?.name,
        participant: row.participant,
        product: row.product,
      });
    } catch (e) {
      toast.show(e.message || t("systemError"));
    }
  };

  const refreshUtilization = async () => {
    if (searchMode) await loadUtilization(searchRows);
    else await loadUtilization(rows, productId);
  };

  const renderUtilization = (row) => {
    const u = utilizationMap[row.id];
    if (!u || !row.active) return "—";
    return `${u.entitled}/${u.utilized} (${u.shortfall})`;
  };

  const renderRowActions = (row) => (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {row.active && (
        <>
          {seasonIsLive && utilizationMap[row.id]?.shortfall > 0 && (
            <Button variant="primary" size="sm" onClick={() => openMakeup(row)}>
              {t("bookMakeup")}
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={() => startEdit(row)}>{t("editEnrollment")}</Button>
          {seasonIsLive && billingTypeForTemplate(row.product?.product_templates?.code) && (
            <Button variant="primary" size="sm" onClick={() => setBillingRow(row)}>
              {t("billingRecordPayment")}
            </Button>
          )}
          {seasonIsLive && (
            <>
              <Button variant="secondary" size="sm" onClick={() => copyEnrollmentTicketLink(row.id, { toast, t })}>
                {t("copyTicketLink")}
              </Button>
              <Button variant="secondary" size="sm" disabled={savingId === row.id} onClick={() => handleRegeneratePasses(row)}>
                {t("regeneratePasses")}
              </Button>
            </>
          )}
          <Button variant="danger" size="sm" disabled={savingId === row.id} onClick={() => cancelEnrollment(row)}>
            {savingId === row.id ? "..." : t("cancelEnrollment")}
          </Button>
        </>
      )}
    </div>
  );

  const renderTableRow = (row) => {
    const isEditing = editingId === row.id;
    if (isEditing) {
      return (
        <tr key={row.id} className="data-table-edit-row">
          <td colSpan={colCount}>{renderEditFields(row)}</td>
        </tr>
      );
    }
    const childName = row.participant?.full_name || "—";
    const participantId = row.participant?.id;
    return (
      <tr key={row.id}>
        <td className="col-text">
          <div className="cell-primary">
            <Avatar name={childName} size={28} />
            <span
              role={participantId ? "button" : undefined}
              tabIndex={participantId ? 0 : undefined}
              onClick={participantId ? () => openProfile(participantId) : undefined}
              onKeyDown={participantId ? (e) => { if (e.key === "Enter") openProfile(participantId); } : undefined}
              style={participantId ? { cursor: "pointer", textDecoration: "underline" } : undefined}
            >
              {childName}
              {!row.active && (
                <Badge variant="neutral" style={{ marginInlineStart: 8 }}>{t("cancelled")}</Badge>
              )}
            </span>
          </div>
        </td>
        <td className="col-phone" dir="ltr">{row.participant?.family?.phone || "—"}</td>
        {showClassColumn && (
          <td className="col-text col-text--mid">{productLabel(row.product)}</td>
        )}
        <td className="col-badge">
          <Badge
            variant={PAYMENT_BADGE_VARIANT[row.payment_status] || "neutral"}
            dot={row.payment_status !== "waived"}
          >
            {paymentLabel(row.payment_status)}
          </Badge>
        </td>
        <td className="col-num">{renderUtilization(row)}</td>
        <td className="col-date">{fmtDateDay(row.valid_until)}</td>
        <td className="col-actions"><div className="actions-cell">{renderRowActions(row)}</div></td>
      </tr>
    );
  };

  const renderRow = (row) => {
    const isEditing = editingId === row.id;
    const childName = row.participant?.full_name || "—";
    const participantId = row.participant?.id;
    return (
      <div className="log-item" key={row.id} style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
        {isEditing ? renderEditFields(row) : (
          <>
            <div>
              <div className="log-name" style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <Avatar name={childName} size={28} />
                <span
                  role={participantId ? "button" : undefined}
                  onClick={participantId ? () => openProfile(participantId) : undefined}
                  style={participantId ? { cursor: "pointer", textDecoration: "underline" } : undefined}
                >
                  {childName}
                  {!row.active && (
                    <Badge variant="neutral" style={{ marginInlineStart: 8 }}>{t("cancelled")}</Badge>
                  )}
                </span>
              </div>
              {(showClassColumn || historyFilter !== "active") && (
                <div className="log-meta">{productLabel(row.product)}</div>
              )}
              <div className="log-meta">
                {t("parentPhone")}: {row.participant?.family?.phone || "—"}
              </div>
              <div className="log-meta" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {t("paymentStatus")}:
                <Badge
                  variant={PAYMENT_BADGE_VARIANT[row.payment_status] || "neutral"}
                  dot={row.payment_status !== "waived"}
                >
                  {paymentLabel(row.payment_status)}
                </Badge>
              </div>
              {row.active && utilizationMap[row.id] && (
                <div className="log-meta">
                  {t("utilizationBalance")}: {renderUtilization(row)}
                </div>
              )}
              <div className="log-meta">
                {t("validFrom")}: {fmtDateDay(row.valid_from)} · {t("validUntil")}: {fmtDateDay(row.valid_until)}
              </div>
            </div>
            {renderRowActions(row)}
          </>
        )}
      </div>
    );
  };

  if (!searchMode && !productId) {
    return null;
  }

  return (
    <div className="groups-enrollments-panel">
      {showAddButton && (
        <div style={{ marginBottom: 12, display: "flex", justifyContent: "flex-end" }}>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setShowAddForm((v) => !v)}
          >
            {showAddForm ? t("hideAddEnrollment") : t("addEnrollment")}
          </Button>
        </div>
      )}

      {showAddForm && (
        <Card style={{ marginBottom: 16 }}>
          <Field label={t("parentPhone")}>
            <Input type="tel" dir="ltr" value={parentPhone} onChange={(e) => setParentPhone(e.target.value)} />
          </Field>
          <Field label={t("parentNameOptional")}>
            <Input value={parentName} onChange={(e) => setParentName(e.target.value)} />
          </Field>
          <Field label={t("childName")}>
            <Input value={childName} onChange={(e) => setChildName(e.target.value)} />
          </Field>
          {renderParticipantFields(
            addGender, setAddGender, addGrade, setAddGrade, addBirthDate, setAddBirthDate,
          )}
          {!productId && (
            <Field label={t("selectClass")}>
              <Select value={addProductId} onChange={(e) => setAddProductId(e.target.value)}>
                <option value="">{t("selectClassPlaceholder")}</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>{productLabel(p)}</option>
                ))}
              </Select>
            </Field>
          )}
          <Field label={t("paymentStatus")}>
            <Select value={addPaymentStatus} onChange={(e) => setAddPaymentStatus(e.target.value)}>
              {PAYMENT_STATUSES.map((s) => (
                <option key={s} value={s}>{paymentLabel(s)}</option>
              ))}
            </Select>
          </Field>
          <Button onClick={addEnrollment} disabled={addSaving}>
            {addSaving ? <><Spinner size={16} /> {t("saving")}</> : t("saveEnrollment")}
          </Button>
        </Card>
      )}

      {displayLoading ? (
        <div style={{ textAlign: "center", padding: 32, color: "var(--ink-soft)" }}>{t("loading")}</div>
      ) : displayRows.length === 0 ? (
        <div style={{ padding: 24, color: "var(--ink-soft)", textAlign: "center" }}>
          {searchMode ? t("noEnrollmentsFound") : t("noEnrollmentsInClass")}
        </div>
      ) : isDesktop ? (
        <div className="data-table-wrap">
          {!searchMode && productId && (
            <div className="data-table-header">
              {historyFilter === "active" ? t("activeEnrollments") : t("enrollmentHistory")} ({displayRows.length})
            </div>
          )}
          <table className="data-table">
            <thead>
              <tr>
                <th className="col-text">{t("child")}</th>
                <th className="col-phone">{t("parentPhone")}</th>
                {showClassColumn && <th className="col-text">{t("sectionClass")}</th>}
                <th className="col-badge">{t("paymentStatus")}</th>
                <th className="col-num">{t("utilizationBalance")}</th>
                <th className="col-date">{t("validUntil")}</th>
                <th className="col-actions"></th>
              </tr>
            </thead>
            <tbody>
              {displayRows.map((row) => renderTableRow(row))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grouped-list">
          {!searchMode && productId && (
            <div className="grouped-list-header">
              {historyFilter === "active" ? t("activeEnrollments") : t("enrollmentHistory")} ({displayRows.length})
            </div>
          )}
          {displayRows.map(renderRow)}
        </div>
      )}

      {makeupRow && (
        <MakeupBookingModal
          enrollment={makeupRow}
          utilization={makeupUtil}
          toast={toast}
          onClose={() => { setMakeupRow(null); setMakeupUtil(null); }}
          onBooked={refreshUtilization}
        />
      )}

      {billingRow && (
        <BillingPaymentModal
          open
          toast={toast}
          participantId={billingRow.participant?.id}
          enrollmentId={billingRow.id}
          templateCode={billingRow.product?.product_templates?.code}
          seasonId={season?.id}
          onClose={() => setBillingRow(null)}
          onSaved={async () => {
            setBillingRow(null);
            await reload();
          }}
        />
      )}
    </div>
  );
}
