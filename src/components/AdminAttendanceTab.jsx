import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase.js";
import { listAttendanceHistory, templateLabel } from "../lib/attendance.js";
import { useLang } from "../i18n.jsx";
import { fmt_time } from "../lib/lessonDates.js";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function monthAgoStr() {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 10);
}

function exportCsv(rows, t) {
  const header = [
    t("date"),
    t("startTime"),
    t("child"),
    t("sectionClass"),
    t("attendanceStatus"),
    t("attendanceSource"),
    t("notes"),
  ];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push([
      r.session_date,
      String(r.start_time || "").slice(0, 5),
      `"${(r.participant_name || r.child_name || "").replace(/"/g, '""')}"`,
      `"${(r.product_name || templateLabel(t, r.template_code) || "").replace(/"/g, '""')}"`,
      r.status,
      r.source,
      `"${(r.notes || "").replace(/"/g, '""')}"`,
    ].join(","));
  }
  const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `attendance-${todayStr()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AdminAttendanceTab({ toast }) {
  const { t, fmtDateDay } = useLang();
  const [from, setFrom] = useState(monthAgoStr());
  const [to, setTo] = useState(todayStr());
  const [productId, setProductId] = useState("");
  const [searchChild, setSearchChild] = useState("");
  const [products, setProducts] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: season } = await supabase.from("seasons").select("id").eq("active", true).maybeSingle();
      if (!season) return;
      const { data } = await supabase
        .from("products")
        .select("id, name, product_templates(code)")
        .eq("season_id", season.id)
        .order("name");
      setProducts(data || []);
    })();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let participantId = null;
      const q = searchChild.trim();
      if (q) {
        const { data: parts } = await supabase
          .from("participants")
          .select("id")
          .ilike("full_name", `%${q}%`)
          .limit(1);
        participantId = parts?.[0]?.id || null;
      }
      const data = await listAttendanceHistory({
        from,
        to,
        productId: productId || null,
        participantId,
      });
      setRows(data);
    } catch (e) {
      toast.show(e.message || t("systemError"));
    }
    setLoading(false);
  }, [from, to, productId, searchChild, toast, t]);

  useEffect(() => { load(); }, [load]);

  const statusLabel = (s) => ({
    present: t("attendancePresent"),
    absent: t("attendanceAbsent"),
    excused: t("attendanceExcused"),
    late: t("attendanceLate"),
  }[s] || s);

  const sourceLabel = (s) => ({
    instructor: t("attendanceSourceInstructor"),
    guard_scan: t("attendanceSourceScan"),
    system: t("attendanceSourceSystem"),
  }[s] || s);

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} dir="ltr" />
        <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} dir="ltr" />
        <select className="input" value={productId} onChange={(e) => setProductId(e.target.value)} style={{ minWidth: 140 }}>
          <option value="">{t("allProducts")}</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <input
          className="input"
          value={searchChild}
          onChange={(e) => setSearchChild(e.target.value)}
          placeholder={t("searchByChild")}
        />
        <button type="button" className="btn btn-outline btn-sm" onClick={() => exportCsv(rows, t)} disabled={!rows.length}>
          {t("exportCsv")}
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 32, color: "var(--ink-soft)" }}>{t("loading")}</div>
      ) : rows.length === 0 ? (
        <div className="empty"><div className="empty-icon">📊</div><div className="empty-text">{t("noAttendanceHistory")}</div></div>
      ) : (
        <div className="grouped-list">
          {rows.map((row) => (
            <div className="log-item" key={row.id} style={{ flexDirection: "column", alignItems: "stretch", gap: 4 }}>
              <div className="log-name">{row.participant_name || row.child_name}</div>
              <div className="log-meta">
                {fmtDateDay(row.session_date)} · {fmt_time(row.start_time)}
                {row.product_name ? ` · ${row.product_name}` : row.template_code ? ` · ${templateLabel(t, row.template_code)}` : ""}
              </div>
              <div className="log-meta">
                {t("attendanceStatus")}: {statusLabel(row.status)}
                {" · "}{sourceLabel(row.source)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
