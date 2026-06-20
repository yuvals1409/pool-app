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
import { cancelEnrollment as cancelEnrollmentRpc } from "../lib/waitlist.js";
import { useIsDesktop } from "../lib/useBreakpoint.js";
import { getEnrollmentUtilization, listUtilizationReport } from "../lib/utilization.js";
import MakeupBookingModal from "./MakeupBookingModal.jsx";
import {
  Avatar,
  Badge,
  Button,
  Card,
  Field,
  Input,
  SegmentedControl,
  Select,
  Spinner,
} from "./ui/ds/index.js";

const PAYMENT_STATUSES = ["unpaid", "paid", "waived"];
const HISTORY_FILTERS = ["active", "all", "cancelled"];
const PAYMENT_BADGE_VARIANT = { paid: "success", unpaid: "warn", waived: "neutral" };

function normalizePhone(phone) {
  return phone.replace(/\s/g, "").trim();
}

export default function AdminEnrollmentsTab({ toast }) {
  const { t, days, fmtDateDay } = useLang();
  const isDesktop = useIsDesktop();
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
  const [utilizationMap, setUtilizationMap] = useState({});
  const [makeupRow, setMakeupRow] = useState(null);
  const [makeupUtil, setMakeupUtil] = useState(null);

  const todayStr = () => new Date().toISOString().slice(0, 10);

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

  const loadUtilization = useCallback(async (enrollmentRows, productId = null) => {
    const active = (enrollmentRows || []).filter((r) => r.active);
    if (!active.length) {
      setUtilizationMap({});
      return;
    }
    try {
      if (productId) {
        const report = await listUtilizationReport({
          asOf: todayStr(),
          productId,
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

  const loadByProduct = useCallback(async (productId, filter) => {
    if (!productId) {
      setRows([]);
      setUtilizationMap({});
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
    else {
      setRows(data || []);
      await loadUtilization(data || [], productId);
    }
    setListLoading(false);
  }, [toast, loadUtilization]);

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
      await loadUtilization(enrollments || []);
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
        if (searchMode) await runSearch();
        else await loadByProduct(selectedProductId, historyFilter);
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

  const renderEditFields = (row) => (
    <>
      <Field label={t("childName")}>
        <Input value={editChildName} onChange={(e) => setEditChildName(e.target.value)} />
      </Field>
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
    else await loadUtilization(rows, selectedProductId);
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
          {utilizationMap[row.id]?.shortfall > 0 && (
            <Button variant="primary" size="sm" onClick={() => openMakeup(row)}>
              {t("bookMakeup")}
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={() => startEdit(row)}>{t("editEnrollment")}</Button>
          <Button variant="secondary" size="sm" onClick={() => copyEnrollmentTicketLink(row.id, { toast, t })}>
            {t("copyTicketLink")}
          </Button>
          <Button variant="secondary" size="sm" disabled={savingId === row.id} onClick={() => handleRegeneratePasses(row)}>
            {t("regeneratePasses")}
          </Button>
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
          <td colSpan={7}>{renderEditFields(row)}</td>
        </tr>
      );
    }
    const childName = row.participant?.full_name || "—";
    return (
      <tr key={row.id}>
        <td className="col-text">
          <div className="cell-primary">
            <Avatar name={childName} size={28} />
            <span>
              {childName}
              {!row.active && (
                <Badge variant="neutral" style={{ marginInlineStart: 8 }}>{t("cancelled")}</Badge>
              )}
            </span>
          </div>
        </td>
        <td className="col-phone" dir="ltr">{row.participant?.family?.phone || "—"}</td>
        <td className="col-text col-text--mid">{productLabel(row.product)}</td>
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
    return (
      <div className="log-item" key={row.id} style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
        {isEditing ? renderEditFields(row) : (
          <>
            <div>
              <div className="log-name" style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <Avatar name={childName} size={28} />
                <span>
                  {childName}
                  {!row.active && (
                    <Badge variant="neutral" style={{ marginInlineStart: 8 }}>{t("cancelled")}</Badge>
                  )}
                </span>
              </div>
              {(searchMode || historyFilter !== "active") && (
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

  const historyFilterOptions = HISTORY_FILTERS.map((f) => ({
    value: f,
    label: t(`enrollmentFilter${f.charAt(0).toUpperCase()}${f.slice(1)}`),
  }));

  return (
    <div>
      {!isDesktop && (
        <div className="page-header">
          <h1 className="page-title">{t("tabEnrollments")}</h1>
        </div>
      )}

      <div
        style={isDesktop ? {
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 16,
          flexWrap: "wrap",
        } : { marginBottom: 12 }}
      >
        <SegmentedControl
          options={historyFilterOptions}
          value={historyFilter}
          onChange={setHistoryFilter}
          size="sm"
        />
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", flex: isDesktop ? "none" : 1 }}>
          <div style={{ width: isDesktop ? 220 : "100%", minWidth: 0, flex: isDesktop ? "none" : 1 }}>
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("searchByPhoneOrChild")}
              onKeyDown={(e) => e.key === "Enter" && runSearch()}
            />
          </div>
          <Button variant="primary" size="sm" onClick={runSearch} disabled={searchLoading}>
            {searchLoading ? "..." : t("search")}
          </Button>
          {searchMode && (
            <Button variant="secondary" size="sm" onClick={clearSearch}>
              {t("clearSearch")}
            </Button>
          )}
          {isDesktop && (
            <Button variant="primary" size="md" onClick={() => setShowAddForm((v) => !v)}>
              {showAddForm ? t("hideAddEnrollment") : t("addEnrollment")}
            </Button>
          )}
        </div>
      </div>

      {!searchMode && (
        <Field label={t("selectClass")} style={{ marginBottom: 16, maxWidth: isDesktop ? 420 : undefined }}>
          <Select
            value={selectedProductId}
            onChange={(e) => setSelectedProductId(e.target.value)}
          >
            <option value="">{t("selectClassPlaceholder")}</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>{productLabel(p)}</option>
            ))}
          </Select>
        </Field>
      )}

      {!isDesktop && (
        <div style={{ marginBottom: 16 }}>
          <Button variant="secondary" size="sm" onClick={() => setShowAddForm((v) => !v)}>
            {showAddForm ? t("hideAddEnrollment") : t("addEnrollment")}
          </Button>
        </div>
      )}

      {showAddForm && (
        <Card style={{ marginBottom: 20 }}>
          <Field label={t("parentPhone")}>
            <Input type="tel" dir="ltr" value={parentPhone} onChange={(e) => setParentPhone(e.target.value)} />
          </Field>
          <Field label={t("parentNameOptional")}>
            <Input value={parentName} onChange={(e) => setParentName(e.target.value)} />
          </Field>
          <Field label={t("childName")}>
            <Input value={childName} onChange={(e) => setChildName(e.target.value)} />
          </Field>
          <Field label={t("selectClass")}>
            <Select value={addProductId} onChange={(e) => setAddProductId(e.target.value)}>
              <option value="">{t("selectClassPlaceholder")}</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{productLabel(p)}</option>
              ))}
            </Select>
          </Field>
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
        <div style={{ marginTop: 24, color: "var(--ink-soft)", textAlign: "center" }}>
          {searchMode && searchQuery.trim() ? t("noEnrollmentsFound") : t("noEnrollmentsInClass")}
        </div>
      ) : isDesktop ? (
        <div className="data-table-wrap">
          {!searchMode && selectedProductId && (
            <div className="data-table-header">
              {historyFilter === "active" ? t("activeEnrollments") : t("enrollmentHistory")} ({displayRows.length})
            </div>
          )}
          <table className="data-table">
            <thead>
              <tr>
                <th className="col-text">{t("child")}</th>
                <th className="col-phone">{t("parentPhone")}</th>
                <th className="col-text">{t("sectionClass")}</th>
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
        <div className="grouped-list" style={{ marginTop: 12 }}>
          {!searchMode && selectedProductId && (
            <div className="grouped-list-header">
              {historyFilter === "active" ? t("activeEnrollments") : t("enrollmentHistory")} ({displayRows.length})
            </div>
          )}
          {displayRows.map(renderRow)}
        </div>
      )}

      {!displayLoading && displayRows.length > 0 && season && (
        <div style={{ marginTop: 10, fontSize: 12, color: "var(--ink-soft)" }}>
          {displayRows.length} · {season.name}
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
    </div>
  );
}
