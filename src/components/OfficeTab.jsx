import { useState } from "react";
import { supabase } from "../lib/supabase.js";
import { useLang } from "../i18n.jsx";
import { copyEnrollmentTicketLink } from "../lib/accessPass.js";
import { formatProductLabel } from "../lib/productLabel.js";
import { useIsDesktop } from "../lib/useBreakpoint.js";

const PAYMENT_STATUSES = ["paid", "unpaid", "waived"];

export default function OfficeTab({ toast }) {
  const { t, days, fmtDateDay } = useLang();
  const isDesktop = useIsDesktop();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [savingId, setSavingId] = useState(null);

  const search = async () => {
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    try {
      const participantIds = new Set();
      const phoneNorm = q.replace(/\s/g, "");

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
        setRows([]);
        setLoading(false);
        return;
      }

      const { data: enrollments, error } = await supabase
        .from("enrollments")
        .select(`
          id, payment_status, valid_until, active,
          participant:participants(id, full_name),
          product:products(id, name, day_of_week, start_time, end_time, instructor_name, schedule_pattern, product_templates(code))
        `)
        .in("participant_id", [...participantIds])
        .eq("active", true)
        .order("valid_until", { ascending: true });
      if (error) throw error;
      setRows(enrollments || []);
    } catch (e) {
      toast.show(e.message || t("systemError"));
    }
    setLoading(false);
  };

  const setPayment = async (enrollmentId, paymentStatus) => {
    setSavingId(enrollmentId);
    const { error } = await supabase
      .from("enrollments")
      .update({ payment_status: paymentStatus })
      .eq("id", enrollmentId);
    if (error) toast.show(error.message);
    else {
      setRows((prev) => prev.map((r) => (r.id === enrollmentId ? { ...r, payment_status: paymentStatus } : r)));
      toast.show(t("save"));
    }
    setSavingId(null);
  };

  const copyTicketLink = (enrollmentId) => copyEnrollmentTicketLink(enrollmentId, { toast, t });

  const paymentLabel = (status) => ({
    paid: t("paymentPaid"),
    unpaid: t("paymentUnpaid"),
    waived: t("paymentWaived"),
  }[status] || status);

  const renderPaymentActions = (row) => (
    <div className="actions-cell">
      {PAYMENT_STATUSES.map((status) => (
        <button
          key={status}
          type="button"
          className={`btn btn-sm ${row.payment_status === status ? "btn-primary" : "btn-outline"}`}
          disabled={savingId === row.id}
          onClick={() => setPayment(row.id, status)}
        >
          {paymentLabel(status)}
        </button>
      ))}
      <button type="button" className="btn btn-sm btn-outline" onClick={() => copyTicketLink(row.id)}>
        {t("copyTicketLink")}
      </button>
    </div>
  );

  return (
    <div className="office-layout">
      <div className="section-title">{t("tabOffice")}</div>
      <div className="section-sub">{t("searchByPhoneOrChild")}</div>

      <div className="name-edit" style={{ marginTop: 12 }}>
        <input
          className="name-edit-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("searchByPhoneOrChild")}
          onKeyDown={(e) => e.key === "Enter" && search()}
        />
        <button className="name-edit-btn" onClick={search} disabled={loading}>
          {loading ? "..." : t("search")}
        </button>
      </div>

      {!loading && rows.length === 0 && query.trim() && (
        <div style={{ marginTop: 24, color: "var(--ink-soft)", textAlign: "center" }}>{t("noEnrollmentsFound")}</div>
      )}

      {isDesktop && rows.length > 0 ? (
        <div className="data-table-wrap office-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t("child")}</th>
                <th>{t("sectionClass")}</th>
                <th>{t("paymentStatus")}</th>
                <th>{t("validUntil")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.participant?.full_name}</td>
                  <td>{formatProductLabel(row.product, days, row.product?.product_templates?.code)}</td>
                  <td>{paymentLabel(row.payment_status)}</td>
                  <td>{fmtDateDay(row.valid_until)}</td>
                  <td>{renderPaymentActions(row)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grouped-list" style={{ marginTop: 20 }}>
          {rows.map((row) => (
            <div className="log-item" key={row.id} style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
              <div>
                <div className="log-name">{row.participant?.full_name}</div>
                <div className="log-meta">{formatProductLabel(row.product, days, row.product?.product_templates?.code)}</div>
                <div className="log-meta">{t("paymentStatus")}: {paymentLabel(row.payment_status)}</div>
                <div className="log-meta">{t("validUntil")}: {fmtDateDay(row.valid_until)}</div>
              </div>
              {renderPaymentActions(row)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
