import { useState, useEffect, useCallback } from "react";
import { supabase, ensureWeeklySessionsGenerated, ensureAccessPassesGenerated } from "../lib/supabase.js";
import { useLang } from "../i18n.jsx";
import { fmt_time } from "../lib/lessonDates.js";

const PAYMENT_STATUSES = ["unpaid", "paid", "waived"];

function formatProductLabel(product, days) {
  if (!product) return "";
  const day = days[product.day_of_week] ?? "";
  return `${day} ${fmt_time(product.start_time)} · ${product.name}`;
}

function normalizePhone(phone) {
  return phone.replace(/\s/g, "").trim();
}

export default function AdminEnrollmentsTab({ toast }) {
  const { t, days, fmtDateDay } = useLang();
  const [products, setProducts] = useState([]);
  const [season, setSeason] = useState(null);
  const [selectedProductId, setSelectedProductId] = useState("");
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

  const paymentLabel = (status) => ({
    paid: t("paymentPaid"),
    unpaid: t("paymentUnpaid"),
    waived: t("paymentWaived"),
  }[status] || status);

  const enrollmentSelect = `
    id, payment_status, valid_until, active,
    participant:participants(id, full_name, family:families(phone, parent_name)),
    product:products(id, name, day_of_week, start_time, end_time, instructor_name)
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
        .select("id, name, day_of_week, start_time, end_time, instructor_name")
        .eq("season_id", seasonRow.id)
        .order("day_of_week")
        .order("start_time");
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

  const loadByProduct = useCallback(async (productId) => {
    if (!productId) {
      setRows([]);
      return;
    }
    setListLoading(true);
    const { data, error } = await supabase
      .from("enrollments")
      .select(enrollmentSelect)
      .eq("product_id", productId)
      .eq("active", true)
      .order("created_at", { ascending: true });
    if (error) toast.show(error.message);
    else setRows(data || []);
    setListLoading(false);
  }, [toast]);

  useEffect(() => {
    if (!searchMode) loadByProduct(selectedProductId);
  }, [selectedProductId, searchMode, loadByProduct]);

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

      const { data: enrollments, error } = await supabase
        .from("enrollments")
        .select(enrollmentSelect)
        .in("participant_id", [...participantIds])
        .eq("active", true)
        .order("valid_until", { ascending: true });
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
    if (searchMode) {
      setSearchRows((prev) => prev.filter((r) => r.id !== row.id));
    } else {
      setRows((prev) => prev.filter((r) => r.id !== row.id));
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

      await ensureWeeklySessionsGenerated();
      await ensureAccessPassesGenerated();

      toast.show(t("enrollmentAdded"));
      setParentPhone("");
      setParentName("");
      setChildName("");
      setShowAddForm(false);
      if (searchMode) await runSearch();
      else if (productId === selectedProductId) await loadByProduct(selectedProductId);
    } catch (e) {
      toast.show(e.message || t("systemError"));
    }
    setAddSaving(false);
  };

  const displayRows = searchMode ? searchRows : rows;
  const displayLoading = searchMode ? searchLoading : listLoading;

  const renderRow = (row) => (
    <div className="log-item" key={row.id} style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
      <div>
        <div className="log-name">{row.participant?.full_name}</div>
        {searchMode && (
          <div className="log-meta">{formatProductLabel(row.product, days)}</div>
        )}
        <div className="log-meta">
          {t("parentPhone")}: {row.participant?.family?.phone || "—"}
        </div>
        <div className="log-meta">{t("paymentStatus")}: {paymentLabel(row.payment_status)}</div>
        <div className="log-meta">{t("validUntil")}: {fmtDateDay(row.valid_until)}</div>
      </div>
      <div>
        <button
          type="button"
          className="btn btn-sm btn-danger"
          disabled={savingId === row.id}
          onClick={() => cancelEnrollment(row)}
        >
          {savingId === row.id ? "..." : t("cancelEnrollment")}
        </button>
      </div>
    </div>
  );

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
              <option key={p.id} value={p.id}>{formatProductLabel(p, days)}</option>
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
            <input
              className="input"
              type="tel"
              dir="ltr"
              value={parentPhone}
              onChange={(e) => setParentPhone(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="label">{t("parentNameOptional")}</label>
            <input
              className="input"
              value={parentName}
              onChange={(e) => setParentName(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="label">{t("childName")}</label>
            <input
              className="input"
              value={childName}
              onChange={(e) => setChildName(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="label">{t("selectClass")}</label>
            <select
              className="input"
              value={addProductId}
              onChange={(e) => setAddProductId(e.target.value)}
            >
              <option value="">{t("selectClassPlaceholder")}</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{formatProductLabel(p, days)}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="label">{t("paymentStatus")}</label>
            <select
              className="input"
              value={addPaymentStatus}
              onChange={(e) => setAddPaymentStatus(e.target.value)}
            >
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
              {t("activeEnrollments")} ({displayRows.length})
            </div>
          )}
          {displayRows.map(renderRow)}
        </div>
      )}
    </div>
  );
}
