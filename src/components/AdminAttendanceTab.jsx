import { useState, useEffect, useCallback, useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { supabase } from "../lib/supabase.js";
import { listAttendanceHistory, templateLabel } from "../lib/attendance.js";
import { getAttendanceSummary } from "../lib/commandCenter.js";
import { exportCsv } from "../lib/analytics.js";
import { useLang } from "../i18n.jsx";
import { fmt_time } from "../lib/lessonDates.js";
import { useIsDesktop } from "../lib/useBreakpoint.js";
import {
  Button,
  EmptyState,
  Field,
  Input,
  Select,
  SegmentedControl,
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

function exportEventsCsv(rows, t) {
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
  const [viewMode, setViewMode] = useState("events");
  const [groupBy, setGroupBy] = useState("participant");
  const [from, setFrom] = useState(monthAgoStr());
  const [to, setTo] = useState(todayStr());
  const [productId, setProductId] = useState("");
  const [searchChild, setSearchChild] = useState("");
  const [products, setProducts] = useState([]);
  const [rows, setRows] = useState([]);
  const [summaryRows, setSummaryRows] = useState([]);
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

  const loadEvents = useCallback(async () => {
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
  }, [from, to, productId, searchChild]);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getAttendanceSummary(from, to, groupBy);
      setSummaryRows(data);
    } catch (e) {
      toast.show(e.message || t("systemError"));
    }
    setLoading(false);
  }, [from, to, groupBy]);

  useEffect(() => {
    if (viewMode === "events") loadEvents();
    else loadSummary();
  }, [viewMode, loadEvents, loadSummary]);

  const filteredSummary = useMemo(() => {
    let list = summaryRows;
    const q = searchChild.trim().toLowerCase();
    if (q && groupBy === "participant") {
      list = list.filter((r) => String(r.label || "").toLowerCase().includes(q));
    }
    if (productId && groupBy === "product") {
      list = list.filter((r) => r.entity_id === productId);
    }
    return list;
  }, [summaryRows, searchChild, groupBy, productId]);

  const chartData = useMemo(() => {
    return [...filteredSummary]
      .sort((a, b) => (Number(b.attendance_rate) || 0) - (Number(a.attendance_rate) || 0))
      .slice(0, 10)
      .map((r) => ({
        name: r.label?.length > 18 ? `${r.label.slice(0, 16)}…` : r.label,
        rate: Number(r.attendance_rate) || 0,
      }));
  }, [filteredSummary]);

  const exportSummaryCsv = () => {
    exportCsv(
      `attendance-summary-${todayStr()}.csv`,
      [summaryNameLabel, t("attendancePresent"), t("attendanceAbsent"), t("attendanceTotal"), t("attendanceRate")],
      filteredSummary.map((r) => [
        r.label,
        r.present_count ?? 0,
        r.absent_count ?? 0,
        r.total_marks ?? 0,
        r.attendance_rate ?? 0,
      ]),
    );
  };

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

  const viewOptions = [
    { value: "events", label: t("attendanceViewEvents") },
    { value: "summary", label: t("attendanceViewSummary") },
  ];

  const groupByOptions = [
    { value: "participant", label: t("child") },
    { value: "product", label: t("sectionClass") },
    { value: "instructor", label: t("instructor") },
  ];

  const summaryNameLabel = groupBy === "product"
    ? t("sectionClass")
    : groupBy === "instructor"
      ? t("instructor")
      : t("child");

  const filtersClass = isDesktop ? "attendance-filters--desktop filter-bar" : "filter-bar";

  return (
    <div>
      {!isDesktop && (
        <div className="page-header">
          <h1 className="page-title">{t("tabAttendance")}</h1>
          <p className="page-sub">{t("attendanceSub")}</p>
        </div>
      )}

      <div className={filtersClass} style={{ marginBottom: 12 }}>
        <Field label={t("attendanceViewMode")} style={{ marginBottom: 0 }}>
          <SegmentedControl options={viewOptions} value={viewMode} onChange={setViewMode} size="sm" />
        </Field>
      </div>

      <div className={filtersClass}>
        <Field label={t("validFrom")} style={{ marginBottom: 0 }}>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} dir="ltr" />
        </Field>
        <Field label={t("validUntil")} style={{ marginBottom: 0 }}>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} dir="ltr" />
        </Field>
        {viewMode === "summary" && (
          <Field label={t("attendanceSummaryBy")} style={{ marginBottom: 0 }}>
            <SegmentedControl options={groupByOptions} value={groupBy} onChange={setGroupBy} size="sm" />
          </Field>
        )}
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
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => (viewMode === "events" ? exportEventsCsv(rows, t) : exportSummaryCsv())}
          disabled={viewMode === "events" ? !rows.length : !filteredSummary.length}
        >
          {t("exportCsv")}
        </Button>
      </div>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 32 }}>
          <Spinner />
        </div>
      ) : viewMode === "events" ? (
        rows.length === 0 ? (
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
        )
      ) : filteredSummary.length === 0 ? (
        <EmptyState title={t("noAttendanceHistory")} />
      ) : (
        <>
          {chartData.length > 0 && (
            <div style={{ marginBottom: 24, height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" domain={[0, 100]} unit="%" />
                  <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => [`${v}%`, t("attendanceRate")]} />
                  <Bar dataKey="rate" fill="#0077B6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          {isDesktop ? (
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="col-text">{summaryNameLabel}</th>
                    <th className="col-num">{t("attendancePresent")}</th>
                    <th className="col-num">{t("attendanceAbsent")}</th>
                    <th className="col-num">{t("attendanceTotal")}</th>
                    <th className="col-num">{t("attendanceRate")}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSummary.map((row) => (
                    <tr key={row.entity_id}>
                      <td className="col-text">{row.label}</td>
                      <td className="col-num">{row.present_count ?? 0}</td>
                      <td className="col-num">{row.absent_count ?? 0}</td>
                      <td className="col-num">{row.total_marks ?? 0}</td>
                      <td className="col-num">{row.attendance_rate ?? 0}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="grouped-list">
              {filteredSummary.map((row) => (
                <div className="log-item" key={row.entity_id} style={{ flexDirection: "column", alignItems: "stretch", gap: 4 }}>
                  <div className="log-name">{row.label}</div>
                  <div className="log-meta">
                    {t("attendanceRate")}: {row.attendance_rate ?? 0}%
                    {" · "}{t("attendancePresent")}: {row.present_count ?? 0}
                    {" · "}{t("attendanceAbsent")}: {row.absent_count ?? 0}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
