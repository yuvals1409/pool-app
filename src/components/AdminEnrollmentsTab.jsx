import { useState, useEffect, useCallback } from "react";
import {
  supabase,
  ensureWeeklySessionsGenerated,
  ensureAccessPassesGenerated,
  ensureCourseSeriesSessions,
} from "../lib/supabase.js";
import { copyEnrollmentTicketLink } from "../lib/accessPass.js";
import { regenerateEnrollmentPasses } from "../lib/summerCourse.js";
import { formatProductLabel } from "../lib/productLabel.js";
import { useLang } from "../i18n.jsx";
import { fmt_time } from "../lib/lessonDates.js";

const PAYMENT_STATUSES = ["unpaid", "paid", "waived"];
const HISTORY_FILTERS = ["active", "all", "cancelled"];

function normalizePhone(phone) {
  return phone.replace(/\s/g, "").trim();
}

export default function AdminEnrollmentsTab({ toast }) {
  const { t, days, fmtDateDay } = useLang();
  const [products, setProducts] = useState([]);
  const [season, setSeason] = useState(null);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [historyFilter, setHistoryFilter] = useState("active");
  const [rows, setRows] = useState([]);
  const [listLoading, setListLoading] = useState(false);
  const [savingId, setSavingId] = useState(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchRows, setSearchRows] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchMode, setSearchMode] = useState(false);

  const [showAddForm, setShowAddForm] = useState(false);
  const [addSaving, setAddSaving] = useState(false);
  const [parentPhone, setParentPhone] = useState("");
  const [parentName, setParentName] = useState("");
  const [childName, setChildName] = useState("");
  const [addProductId, setAddProductId] = useState("");
  const [addPaymentStatus, setAddPaymentStatus] = useState("unpaid");

  const [editingId, setEditingId] = useState(null);
  const [editChildName, setEditChildName] = useState("");
  const [editParentPhone, setEditParentPhone] = useState("");
  const [editProductId, setEditProductId] = useState("");
  const [editPaymentStatus, setEditPaymentStatus] = useState("unpaid");
  const [editValidFrom, setEditValidFrom] = useState("");
  const [editValidUntil, setEditValidUntil] = useState("");

  const paymentLabel = (status) => ({
    paid: t("paymentPaid"),
    unpaid: t("paymentUnpaid"),
    waived: t("paymentWaived"),
  }[status] || status);

  const enrollmentSelect = `
    id, payment_status, valid_from, valid_until, active,
    participant:participants(id, full_name, family:families(id, phone, parent_name)),
    product:products(id, name, day_of_week, start_time, end_time, instructor_name, schedule_pattern, product_templates(code))
  `;

  useEffect(() => {
    (async () => {
      const { data: seasonRow } = await supabase
        .from("seasons")
        .select("id, name, start_date, end_date")
        .eq("active", true)
        .order("start_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      setSeason(seasonRow);
      if (!seasonRow) return;
      const { data: prods, error } = await supabase
        .from("products")
        .select("id, name, day_of_week, start_time, end_time, instructor_name, schedule_pattern, product_templates(code)")
        .eq("season_id", seasonRow.id)
        .order("name");
      if (error) toast.show(error.message);
      else {
        setProducts(prods || []);
        if (prods?.length === 1) {
          setSelectedProductId(prods[0].id);
          setAddProductId(prods[0].id);
        }
      }
    })();
  }, [toast]);

  const loadByProduct = useCallback(async (productId, filter) => {
    if (!productId) {
      setRows([]);
      return;
    }
    setListLoading(true);
    let q = supabase
      .from("enrollments")
      .select(enrollmentSelect)
      .eq("product_id", productId)
      .order("created_at", { ascending: true });
    if (filter === "active") q = q.eq("active", true);
    else if (filter === "cancelled") q = q.eq("active", false);
    const { data, error } = await q;
    if (error) toast.show(error.message);
    else setRows(data || []);
    setListLoading(false);
  }, [toast]);

  useEffect(() => {
    if (!searchMode) loadByProduct(selectedProductId, historyFilter);
  }, [selectedProductId, searchMode, historyFilter, loadByProduct]);

  const runSearch = async () => {
    const q = searchQuery.trim();
    if (!q) return;
    setSearchMode(true);
    setSearchLoading(true);
    try {
      const participantIds = new Set();
      const phoneNorm = normalizePhone(q);

      const { data: byPhone } = await supabase
        .from("families")
        .select("id")
        .ilike("phone", `%${phoneNorm}%`);
      if (byPhone?.length) {
        const familyIds = byPhone.map((f) => f.id);
        const { data: parts } = await supabase
          .from("participants")
          .select("id")
          .in("family_id", familyIds);
        parts?.forEach((p) => participantIds.add(p.id));
      }

      const { data: byName } = await supabase
        .from("participants")
        .select("id")
        .ilike("full_name", `%${q}%`);
      byName?.forEach((p) => participantIds.add(p.id));

      if (!participantIds.size) {
        setSearchRows([]);
        setSearchLoading(false);
        return;
      }

      let eq = supabase
        .from("enrollments")
        .select(enrollmentSelect)
        .in("participant_id", [...participantIds])
        .order("valid_until", { ascending: true });
      if (historyFilter === "active") eq = eq.eq("active", true);
      else if (historyFilter === "cancelled") eq = eq.eq("active", false);
      const { data: enrollments, error } = await eq;
      if (error) throw error;
      setSearchRows(enrollments || []);
    } catch (e) {
      toast.show(e.message || t("systemError"));
    }
    setSearchLoading(false);
  };

  const clearSearch = () => {
    setSearchMode(false);
    setSearchQuery("");
    setSearchRows([]);
  };

  const productTemplateCode = (productId) => {
    const p = products.find((x) => x.id === productId);
    return p?.product_templates?.code;
  };

  const syncSessionsForProduct = async (productId) => {
    const code = productTemplateCode(productId);
    if (code === "summer_course") {
      await ensureCourseSeriesSessions(productId);
    } else {
      await ensureWeeklySessionsGenerated();
      await ensureAccessPassesGenerated();
    }
  };

  const cancelFuturePasses = async (enrollmentId) => {
    const today = new Date().toISOString().slice(0, 10);
    const { data: passes, error } = await supabase
      .from("access_passes")
      .select("id, scheduled_sessions(session_date)")
      .eq("enrollment_id", enrollmentId)
      .eq("status", "active");
    if (error) return;
    const ids = (passes || [])
      .filter((p) => p.scheduled_sessions?.session_date >= today)
      .map((p) => p.id);
    if (ids.length) {
      await supabase.from("access_passes").update({ status: "cancelled" }).in("id", ids);
    }
  };

  const cancelEnrollment = async (row) => {
    const name = row.participant?.full_name || "—";
    if (!confirm(t("cancelEnrollmentConfirm", { name }))) return;
    setSavingId(row.id);
    const { error } = await supabase
      .from("enrollments")
      .update({ active: false })
      .eq("id", row.id);
    if (error) {
      toast.show(error.message);
      setSavingId(null);
      return;
    }
    await cancelFuturePasses(row.id);
    toast.show(t("enrollmentCancelled"));
    if (searchMode) await runSearch();
    else await loadByProduct(selectedProductId, historyFilter);
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
        await supabase.from("participants").update({ full_name: editChildName.trim() }).eq("id", row.participant.id);
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
      if (searchMode) await runSearch();
      else await loadByProduct(selectedProductId, historyFilter);
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

  const findOrCreateParticipant = async (familyId, fullName) => {
    const trimmed = fullName.trim();
    const { data: siblings } = await supabase
      .from("participants")
      .select("id, full_name")
      .eq("family_id", familyId);
    const match = (siblings || []).find(
      (p) => p.full_name.trim().toLowerCase() === trimmed.toLowerCase(),
    );
    if (match) return match.id;
    const { data: created, error } = await supabase
      .from("participants")
      .insert({ family_id: familyId, full_name: trimmed })
      .select("id")
      .single();
    if (error) throw error;
    return created.id;
  };

  const addEnrollment = async () => {
    const phone = normalizePhone(parentPhone);
    const child = childName.trim();
    const productId = addProductId || selectedProductId;
    if (!phone) return toast.show(t("phoneRequired"));
    if (!child) return toast.show(t("childRequired"));
    if (!productId) return toast.show(t("selectClassRequired"));
    if (!season) return toast.show(t("systemError"));

    setAddSaving(true);
    try {
      const familyId = await findOrCreateFamily(phone, parentName.trim());
      const participantId = await findOrCreateParticipant(familyId, child);

      const { data: existingEnr } = await supabase
        .from("enrollments")
        .select("id")
        .eq("participant_id", participantId)
        .eq("product_id", productId)
        .eq("active", true)
        .maybeSingle();
      if (existingEnr) {
        toast.show(t("duplicateEnrollment"));
        setAddSaving(false);
        return;
      }

      const { error: enrErr } = await supabase.from("enrollments").insert({
        product_id: productId,
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

      await syncSessionsForProduct(productId);

      toast.show(t("enrollmentAdded"));
      setParentPhone("");
      setParentName("");
      setChildName("");
      setShowAddForm(false);
      if (searchMode) await runSearch();
      else if (productId === selectedProductId) await loadByProduct(selectedProductId, historyFilter);
    } catch (e) {
      toast.show(e.message || t("systemError"));
    }
    setAddSaving(false);
  };

  const displayRows = searchMode ? searchRows : rows;
  const displayLoading = searchMode ? searchLoading : listLoading;

  const productLabel = (p) => formatProductLabel(p, days, p?.product_templates?.code);

  const renderRow = (row) => {
    const isEditing = editingId === row.id;
    return (
      <div className="log-item" key={row.id} style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
        {isEditing ? (
          <>
            <div className="field">
              <label className="label">{t("childName")}</label>
              <input className="input" value={editChildName} onChange={(e) => setEditChildName(e.target.value)} />
            </div>
            <div className="field">
              <label className="label">{t("parentPhone")}</label>
              <input className="input" type="tel" dir="ltr" value={editParentPhone} onChange={(e) => setEditParentPhone(e.target.value)} />
            </div>
            <div className="field">
              <label className="label">{t("selectClass")}</label>
              <select className="input" value={editProductId} onChange={(e) => setEditProductId(e.target.value)}>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>{productLabel(p)}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label className="label">{t("paymentStatus")}</label>
              <select className="input" value={editPaymentStatus} onChange={(e) => setEditPaymentStatus(e.target.value)}>
                {PAYMENT_STATUSES.map((s) => (
                  <option key={s} value={s}>{paymentLabel(s)}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label className="label">{t("validFrom")} / {t("validUntil")}</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input className="input" type="date" dir="ltr" value={editValidFrom} onChange={(e) => setEditValidFrom(e.target.value)} />
                <input className="input" type="date" dir="ltr" value={editValidUntil} onChange={(e) => setEditValidUntil(e.target.value)} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button type="button" className="btn btn-primary btn-sm" disabled={savingId === row.id} onClick={() => saveEdit(row)}>
                {savingId === row.id ? "..." : t("saveChanges")}
              </button>
              <button type="button" className="btn btn-outline btn-sm" onClick={cancelEdit}>{t("cancel")}</button>
            </div>
          </>
        ) : (
          <>
            <div>
              <div className="log-name">
                {row.participant?.full_name}
                {!row.active && <span className="badge badge-used" style={{ marginInlineStart: 8 }}>{t("cancelled")}</span>}
              </div>
              {(searchMode || historyFilter !== "active") && (
                <div className="log-meta">{productLabel(row.product)}</div>
              )}
              <div className="log-meta">
                {t("parentPhone")}: {row.participant?.family?.phone || "—"}
              </div>
              <div className="log-meta">{t("paymentStatus")}: {paymentLabel(row.payment_status)}</div>
              <div className="log-meta">
                {t("validFrom")}: {fmtDateDay(row.valid_from)} · {t("validUntil")}: {fmtDateDay(row.valid_until)}
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {row.active && (
                <>
                  <button type="button" className="btn btn-sm btn-outline" onClick={() => startEdit(row)}>{t("editEnrollment")}</button>
                  <button type="button" className="btn btn-sm btn-outline" onClick={() => copyEnrollmentTicketLink(row.id, { toast, t })}>
                    {t("copyTicketLink")}
                  </button>
                  <button type="button" className="btn btn-sm btn-outline" disabled={savingId === row.id} onClick={() => handleRegeneratePasses(row)}>
                    {t("regeneratePasses")}
                  </button>
                  <button type="button" className="btn btn-sm btn-danger" disabled={savingId === row.id} onClick={() => cancelEnrollment(row)}>
                    {savingId === row.id ? "..." : t("cancelEnrollment")}
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <div>
      <div className="name-edit" style={{ marginTop: 12 }}>
        <input
          className="name-edit-input"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t("searchByPhoneOrChild")}
          onKeyDown={(e) => e.key === "Enter" && runSearch()}
        />
        <button className="name-edit-btn" onClick={runSearch} disabled={searchLoading}>
          {searchLoading ? "..." : t("search")}
        </button>
        {searchMode && (
          <button type="button" className="btn btn-sm btn-outline" onClick={clearSearch}>
            {t("clearSearch")}
          </button>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
        {HISTORY_FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            className={`btn btn-sm ${historyFilter === f ? "btn-primary" : "btn-outline"}`}
            onClick={() => setHistoryFilter(f)}
          >
            {t(`enrollmentFilter${f.charAt(0).toUpperCase()}${f.slice(1)}`)}
          </button>
        ))}
      </div>

      {!searchMode && (
        <div className="field" style={{ marginTop: 16 }}>
          <label className="label">{t("selectClass")}</label>
          <select
            className="input"
            value={selectedProductId}
            onChange={(e) => setSelectedProductId(e.target.value)}
          >
            <option value="">{t("selectClassPlaceholder")}</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>{productLabel(p)}</option>
            ))}
          </select>
        </div>
      )}

      <div style={{ marginTop: 16, marginBottom: 8 }}>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          onClick={() => setShowAddForm((v) => !v)}
        >
          {showAddForm ? t("hideAddEnrollment") : t("addEnrollment")}
        </button>
      </div>

      {showAddForm && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="field">
            <label className="label">{t("parentPhone")}</label>
            <input className="input" type="tel" dir="ltr" value={parentPhone} onChange={(e) => setParentPhone(e.target.value)} />
          </div>
          <div className="field">
            <label className="label">{t("parentNameOptional")}</label>
            <input className="input" value={parentName} onChange={(e) => setParentName(e.target.value)} />
          </div>
          <div className="field">
            <label className="label">{t("childName")}</label>
            <input className="input" value={childName} onChange={(e) => setChildName(e.target.value)} />
          </div>
          <div className="field">
            <label className="label">{t("selectClass")}</label>
            <select className="input" value={addProductId} onChange={(e) => setAddProductId(e.target.value)}>
              <option value="">{t("selectClassPlaceholder")}</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{productLabel(p)}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="label">{t("paymentStatus")}</label>
            <select className="input" value={addPaymentStatus} onChange={(e) => setAddPaymentStatus(e.target.value)}>
              {PAYMENT_STATUSES.map((s) => (
                <option key={s} value={s}>{paymentLabel(s)}</option>
              ))}
            </select>
          </div>
          <button className="btn btn-primary" onClick={addEnrollment} disabled={addSaving}>
            {addSaving ? <><div className="spinner" /> {t("saving")}</> : t("saveEnrollment")}
          </button>
        </div>
      )}

      {displayLoading ? (
        <div style={{ textAlign: "center", padding: 32, color: "var(--ink-soft)" }}>{t("loading")}</div>
      ) : displayRows.length === 0 ? (
        <div style={{ marginTop: 24, color: "var(--ink-soft)", textAlign: "center" }}>
          {searchMode && searchQuery.trim() ? t("noEnrollmentsFound") : t("noEnrollmentsInClass")}
        </div>
      ) : (
        <div className="grouped-list" style={{ marginTop: 12 }}>
          {!searchMode && selectedProductId && (
            <div className="grouped-list-header">
              {historyFilter === "active" ? t("activeEnrollments") : t("enrollmentHistory")} ({displayRows.length})
            </div>
          )}
          {displayRows.map(renderRow)}
        </div>
      )}
    </div>
  );
}
