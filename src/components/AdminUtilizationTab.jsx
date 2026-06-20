import { useState, useEffect, useCallback } from "react";
import "./schedule/schedule.css";
import { supabase } from "../lib/supabase.js";
import { listUtilizationReport, getEnrollmentUtilization } from "../lib/utilization.js";
import { templateLabel } from "../lib/attendance.js";
import { useLang } from "../i18n.jsx";
import { fmt_time } from "../lib/lessonDates.js";
import { useIsDesktop } from "../lib/useBreakpoint.js";
import MakeupBookingModal from "./MakeupBookingModal.jsx";
import { Badge, Button, EmptyState, Field, Input, Select, Spinner } from "./ui/ds/index.js";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function exportCsv(rows, t) {
  const header = [
    t("child"),
    t("parentPhone"),
    t("sectionClass"),
    t("productType"),
    t("utilizationEntitled"),
    t("utilizationUsed"),
    t("utilizationShortfall"),
    t("makeupScheduled"),
  ];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push([
      `"${(r.child_name || "").replace(/"/g, '""')}"`,
      `"${(r.parent_phone || "").replace(/"/g, '""')}"`,
      `"${(r.product_name || "").replace(/"/g, '""')}"`,
      r.template_code || "",
      r.entitled ?? 0,
      r.utilized ?? 0,
      r.shortfall ?? 0,
      r.makeup_scheduled ?? 0,
    ].join(","));
  }
  const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `utilization-${todayStr()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AdminUtilizationTab({ toast }) {
  const { t, fmtDateDay } = useLang();
  const isDesktop = useIsDesktop();
  const [asOf, setAsOf] = useState(todayStr());
  const [seasonId, setSeasonId] = useState("");
  const [productId, setProductId] = useState("");
  const [templateCode, setTemplateCode] = useState("");
  const [onlyShortfall, setOnlyShortfall] = useState(true);
  const [seasons, setSeasons] = useState([]);
  const [products, setProducts] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [detailRow, setDetailRow] = useState(null);
  const [detailSessions, setDetailSessions] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [makeupRow, setMakeupRow] = useState(null);
  const [makeupUtil, setMakeupUtil] = useState(null);

  useEffect(() => {
    (async () => {
      const { data: seasonRows } = await supabase
        .from("seasons")
        .select("id, name, active")
        .order("start_date", { ascending: false });
      setSeasons(seasonRows || []);
      const active = seasonRows?.find((s) => s.active) || seasonRows?.[0];
      if (active) setSeasonId(active.id);
    })();
  }, []);

  useEffect(() => {
    if (!seasonId) return;
    (async () => {
      const { data } = await supabase
        .from("products")
        .select("id, name, product_templates(code)")
        .eq("season_id", seasonId)
        .order("name");
      setProducts(data || []);
    })();
  }, [seasonId]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listUtilizationReport({
        asOf,
        seasonId: seasonId || null,
        productId: productId || null,
        templateCode: templateCode || null,
        minShortfall: onlyShortfall ? 1 : 0,
      });
      setRows(data);
    } catch (e) {
      toast.show(e.message || t("systemError"));
    }
    setLoading(false);
  }, [asOf, seasonId, productId, templateCode, onlyShortfall, toast, t]);

  useEffect(() => { load(); }, [load]);

  const openDetail = async (row) => {
    setDetailRow(row);
    setDetailLoading(true);
    try {
      const data = await getEnrollmentUtilization(row.enrollment_id, asOf);
      setDetailSessions(Array.isArray(data?.sessions) ? data.sessions : []);
      setMakeupUtil(data);
    } catch (e) {
      toast.show(e.message || t("systemError"));
    }
    setDetailLoading(false);
  };

  const openMakeup = async (row) => {
    try {
      const data = await getEnrollmentUtilization(row.enrollment_id, asOf);
      setMakeupUtil(data);
      setMakeupRow(row);
    } catch (e) {
      toast.show(e.message || t("systemError"));
    }
  };

  const statusLabel = (s) => ({
    pending: t("attendancePending"),
    present: t("attendancePresent"),
    absent: t("attendanceAbsent"),
    excused: t("attendanceExcused"),
    late: t("attendanceLate"),
  }[s] || s);

  return (
    <div>
      {!isDesktop && (
        <div className="page-header">
          <h1 className="page-title">{t("tabUtilization")}</h1>
          <p className="page-sub">{t("utilizationSub")}</p>
        </div>
      )}

      <div className="filter-bar">
        <Field label={t("utilizationAsOf")} style={{ marginBottom: 0 }}>
          <Input type="date" dir="ltr" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
        </Field>
        <Field label={t("tabSeasons")} style={{ marginBottom: 0 }}>
          <Select value={seasonId} onChange={(e) => { setSeasonId(e.target.value); setProductId(""); }}>
            <option value="">{t("allSeasons")}</option>
            {seasons.map((s) => (
              <option key={s.id} value={s.id}>{s.name}{s.active ? ` (${t("active")})` : ""}</option>
            ))}
          </Select>
        </Field>
        <Field label={t("sectionClass")} style={{ marginBottom: 0 }}>
          <Select value={productId} onChange={(e) => setProductId(e.target.value)}>
            <option value="">{t("allProducts")}</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Select>
        </Field>
        <Field label={t("productType")} style={{ marginBottom: 0 }}>
          <Select value={templateCode} onChange={(e) => setTemplateCode(e.target.value)}>
            <option value="">{t("allTypes")}</option>
            <option value="annual_section">{t("productTypeAnnual")}</option>
            <option value="summer_course">{t("productTypeSummer")}</option>
          </Select>
        </Field>
        <Field style={{ marginBottom: 0, display: "flex", alignItems: "flex-end" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <input type="checkbox" checked={onlyShortfall} onChange={(e) => setOnlyShortfall(e.target.checked)} />
            {t("utilizationOnlyShortfall")}
          </label>
        </Field>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <Button type="button" variant="secondary" size="sm" onClick={load} disabled={loading}>
          {loading ? t("loading") : t("refresh")}
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={() => exportCsv(rows, t)} disabled={!rows.length}>
          {t("exportCsv")}
        </Button>
      </div>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 32 }}>
          <Spinner />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState title={t("noUtilizationRows")} />
      ) : isDesktop ? (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t("child")}</th>
                <th>{t("parentPhone")}</th>
                <th>{t("sectionClass")}</th>
                <th>{t("utilizationEntitled")}</th>
                <th>{t("utilizationUsed")}</th>
                <th>{t("utilizationShortfall")}</th>
                <th>{t("makeupScheduled")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.enrollment_id}>
                  <td>{row.child_name}</td>
                  <td dir="ltr">{row.parent_phone || "—"}</td>
                  <td>{row.product_name}</td>
                  <td>{row.entitled}</td>
                  <td>{row.utilized}</td>
                  <td><strong>{row.shortfall}</strong></td>
                  <td>{row.makeup_scheduled}</td>
                  <td>
                    <div className="actions-cell">
                      <Button type="button" size="sm" variant="secondary" onClick={() => openDetail(row)}>
                        {t("utilizationDetail")}
                      </Button>
                      {row.shortfall > 0 && (
                        <Button type="button" size="sm" variant="primary" onClick={() => openMakeup(row)}>
                          {t("bookMakeup")}
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grouped-list">
          {rows.map((row) => (
            <div className="log-item" key={row.enrollment_id} style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
              <div className="log-name">{row.child_name}</div>
              <div className="log-meta">{row.product_name} · {templateLabel(t, row.template_code)}</div>
              <div className="log-meta" dir="ltr">{row.parent_phone}</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Badge variant="warn">{t("utilizationEntitled")}: {row.entitled}</Badge>
                <Badge variant="success">{t("utilizationUsed")}: {row.utilized}</Badge>
                <Badge variant="danger">{t("utilizationShortfall")}: {row.shortfall}</Badge>
                {row.makeup_scheduled > 0 && (
                  <Badge variant="neutral">{t("makeupScheduled")}: {row.makeup_scheduled}</Badge>
                )}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <Button type="button" size="sm" variant="secondary" onClick={() => openDetail(row)}>
                  {t("utilizationDetail")}
                </Button>
                {row.shortfall > 0 && (
                  <Button type="button" size="sm" variant="primary" onClick={() => openMakeup(row)}>
                    {t("bookMakeup")}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {detailRow && (
        <div className="schedule-panel-overlay" onClick={() => setDetailRow(null)}>
          <div className="schedule-panel" onClick={(e) => e.stopPropagation()}>
            <div className="schedule-panel-handle" />
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
              <div className="section-title" style={{ margin: 0 }}>{detailRow.child_name}</div>
              <Button type="button" variant="secondary" size="sm" onClick={() => setDetailRow(null)}>{t("close")}</Button>
            </div>
            <div className="log-meta" style={{ marginBottom: 12 }}>
              {detailRow.product_name} · {t("utilizationAsOf")}: {fmtDateDay(asOf)}
            </div>
            {detailLoading ? (
              <div style={{ display: "flex", justifyContent: "center", padding: 24 }}>
                <Spinner />
              </div>
            ) : (
              <div className="grouped-list" style={{ maxHeight: 400, overflowY: "auto" }}>
                {detailSessions.map((s) => (
                  <div className="user-row" key={`${s.session_id}-${s.attendee_id}`}>
                    <div className="user-info">
                      <div className="user-display" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        {fmtDateDay(s.session_date)} · {fmt_time(s.start_time)}
                        {s.is_makeup && <Badge variant="success">{t("makeupBadge")}</Badge>}
                      </div>
                      <div className="user-email">
                        {s.product_name} · {statusLabel(s.attendance_status)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {detailRow.shortfall > 0 && (
              <Button
                type="button"
                variant="primary"
                size="sm"
                style={{ marginTop: 12 }}
                onClick={() => { setDetailRow(null); openMakeup(detailRow); }}
              >
                {t("bookMakeup")}
              </Button>
            )}
          </div>
        </div>
      )}

      {makeupRow && (
        <MakeupBookingModal
          enrollment={makeupRow}
          utilization={makeupUtil}
          toast={toast}
          onClose={() => { setMakeupRow(null); setMakeupUtil(null); }}
          onBooked={() => { load(); setMakeupRow(null); }}
        />
      )}
    </div>
  );
}
