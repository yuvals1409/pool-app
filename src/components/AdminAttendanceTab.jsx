import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase.js";
import { listAttendanceHistory, templateLabel } from "../lib/attendance.js";
import { useLang } from "../i18n.jsx";
import { fmt_time } from "../lib/lessonDates.js";
import { useIsDesktop } from "../lib/useBreakpoint.js";
import {
  Button,
  EmptyState,
  Field,
  Input,
  Select,
  Spinner,
} from "./ui/ds/index.js";

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
  const isDesktop = useIsDesktop();
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

  const filtersClass = isDesktop ? "attendance-filters--desktop filter-bar" : "filter-bar";

  return (
    <div>
      {!isDesktop && (
        <div className="page-header">
          <h1 className="page-title">{t("tabAttendance")}</h1>
          <p className="page-sub">{t("attendanceSub")}</p>
        </div>
      )}

      <div className={filtersClass}>
        <Field label={t("validFrom")} style={{ marginBottom: 0 }}>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} dir="ltr" />
        </Field>
        <Field label={t("validUntil")} style={{ marginBottom: 0 }}>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} dir="ltr" />
        </Field>
        <Field label={t("sectionClass")} style={{ marginBottom: 0 }}>
          <Select value={productId} onChange={(e) => setProductId(e.target.value)} style={{ minWidth: 140 }}>
            <option value="">{t("allProducts")}</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Select>
        </Field>
        <Field label={t("child")} style={{ marginBottom: 0 }}>
          <Input
            value={searchChild}
            onChange={(e) => setSearchChild(e.target.value)}
            placeholder={t("searchByChild")}
          />
        </Field>
        <Button type="button" variant="secondary" size="sm" onClick={() => exportCsv(rows, t)} disabled={!rows.length}>
          {t("exportCsv")}
        </Button>
      </div>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 32 }}>
          <Spinner />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState title={t("noAttendanceHistory")} />
      ) : isDesktop ? (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th className="col-date">{t("date")}</th>
                <th className="col-date">{t("startTime")}</th>
                <th className="col-text">{t("child")}</th>
                <th className="col-text">{t("sectionClass")}</th>
                <th className="col-text">{t("attendanceStatus")}</th>
                <th className="col-text">{t("attendanceSource")}</th>
                <th className="col-text">{t("notes")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="col-date">{fmtDateDay(row.session_date)}</td>
                  <td className="col-date" dir="ltr">{fmt_time(row.start_time)}</td>
                  <td className="col-text">{row.participant_name || row.child_name}</td>
                  <td className="col-text col-text--mid">{row.product_name || templateLabel(t, row.template_code) || "—"}</td>
                  <td className="col-text">{statusLabel(row.status)}</td>
                  <td className="col-text col-text--mid">{sourceLabel(row.source)}</td>
                  <td className="col-text col-text--mid">{row.notes || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
