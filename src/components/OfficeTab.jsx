import { useState } from "react";
import { supabase } from "../lib/supabase.js";
import { useLang } from "../i18n.jsx";
import { fmt_time } from "../lib/lessonDates.js";
import { getPublicPassUrl } from "../lib/accessPass.js";

const PAYMENT_STATUSES = ["paid", "unpaid", "waived"];

function formatProductLabel(product, days) {
  if (!product) return "";
  const day = days[product.day_of_week] ?? "";
  return `${day} ${fmt_time(product.start_time)} · ${product.name}`;
}

export default function OfficeTab({ toast }) {
  const { t, days, fmtDateDay } = useLang();
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
          product:products(id, name, day_of_week, start_time, end_time, instructor_name)
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

  const copyTicketLink = async (enrollmentId) => {
    const today = new Date().toISOString().slice(0, 10);
    const { data: passes, error } = await supabase
      .from("access_passes")
      .select("public_token, scheduled_sessions(session_date)")
      .eq("enrollment_id", enrollmentId);
    if (error) {
      toast.show(error.message);
      return;
    }
    const upcoming = (passes || [])
      .filter((p) => p.scheduled_sessions?.session_date >= today)
      .sort((a, b) => a.scheduled_sessions.session_date.localeCompare(b.scheduled_sessions.session_date))[0];
    if (!upcoming?.public_token) {
      toast.show(t("ticketNotFound"));
      return;
    }
    const url = getPublicPassUrl(upcoming.public_token);
    try {
      await navigator.clipboard.writeText(url);
      toast.show(t("linkCopied"));
    } catch {
      toast.show(url);
    }
  };

  const paymentLabel = (status) => ({
    paid: t("paymentPaid"),
    unpaid: t("paymentUnpaid"),
    waived: t("paymentWaived"),
  }[status] || status);

  return (
    <div>
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

      <div className="grouped-list" style={{ marginTop: 20 }}>
        {rows.map((row) => (
          <div className="log-item" key={row.id} style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
            <div>
              <div className="log-name">{row.participant?.full_name}</div>
              <div className="log-meta">{formatProductLabel(row.product, days)}</div>
              <div className="log-meta">{t("paymentStatus")}: {paymentLabel(row.payment_status)}</div>
              <div className="log-meta">{t("validUntil")}: {fmtDateDay(row.valid_until)}</div>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
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
          </div>
        ))}
      </div>
    </div>
  );
}
