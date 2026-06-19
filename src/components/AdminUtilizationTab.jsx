import { useState, useEffect, useCallback } from "react";
import "./schedule/schedule.css";
import { supabase } from "../lib/supabase.js";
import { listUtilizationReport, getEnrollmentUtilization } from "../lib/utilization.js";
import { templateLabel } from "../lib/attendance.js";
import { useLang } from "../i18n.jsx";
import { fmt_time } from "../lib/lessonDates.js";
import { useIsDesktop } from "../lib/useBreakpoint.js";
import MakeupBookingModal from "./MakeupBookingModal.jsx";

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

  const filtersStyle = isDesktop ? undefined : { display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" };

  return (
    <div>
      <div className="section-sub">{t("utilizationSub")}</div>

      <div style={filtersStyle}>
        <div className="field">
          <label className="label">{t("utilizationAsOf")}</label>
          <input className="input" type="date" dir="ltr" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
        </div>
        <div className="field">
          <label className="label">{t("tabSeasons")}</label>
          <select className="input" value={seasonId} onChange={(e) => { setSeasonId(e.target.value); setProductId(""); }}>
            <option value="">{t("allSeasons")}</option>
            {seasons.map((s) => (
              <option key={s.id} value={s.id}>{s.name}{s.active ? ` (${t("active")})` : ""}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="label">{t("sectionClass")}</label>
          <select className="input" value={productId} onChange={(e) => setProductId(e.target.value)}>
            <option value="">{t("allProducts")}</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="label">{t("productType")}</label>
          <select className="input" value={templateCode} onChange={(e) => setTemplateCode(e.target.value)}>
            <option value="">{t("allTypes")}</option>
            <option value="annual_section">{t("productTypeAnnual")}</option>
            <option value="summer_course">{t("productTypeSummer")}</option>
          </select>
        </div>
        <div className="field" style={{ display: "flex", alignItems: "flex-end" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <input type="checkbox" checked={onlyShortfall} onChange={(e) => setOnlyShortfall(e.target.checked)} />
            {t("utilizationOnlyShortfall")}
          </label>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button type="button" className="btn btn-outline btn-sm" onClick={load} disabled={loading}>
          {loading ? t("loading") : t("refresh")}
        </button>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => exportCsv(rows, t)} disabled={!rows.length}>
          {t("exportCsv")}
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 32, color: "var(--ink-soft)" }}>{t("loading")}</div>
      ) : rows.length === 0 ? (
        <div style={{ color: "var(--ink-soft)", textAlign: "center", padding: 24 }}>{t("noUtilizationRows")}</div>
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
                      <button type="button" className="btn btn-sm btn-outline" onClick={() => openDetail(row)}>
                        {t("utilizationDetail")}
                      </button>
                      {row.shortfall > 0 && (
                        <button type="button" className="btn btn-sm btn-primary" onClick={() => openMakeup(row)}>
                          {t("bookMakeup")}
                        </button>
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
                <span className="badge badge-pending">{t("utilizationEntitled")}: {row.entitled}</span>
                <span className="badge badge-active">{t("utilizationUsed")}: {row.utilized}</span>
                <span className="badge badge-used">{t("utilizationShortfall")}: {row.shortfall}</span>
                {row.makeup_scheduled > 0 && (
                  <span className="badge badge-outline">{t("makeupScheduled")}: {row.makeup_scheduled}</span>
                )}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button type="button" className="btn btn-sm btn-outline" onClick={() => openDetail(row)}>
                  {t("utilizationDetail")}
                </button>
                {row.shortfall > 0 && (
                  <button type="button" className="btn btn-sm btn-primary" onClick={() => openMakeup(row)}>
                    {t("bookMakeup")}
                  </button>
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
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setDetailRow(null)}>{t("close")}</button>
            </div>
            <div className="log-meta" style={{ marginBottom: 12 }}>
              {detailRow.product_name} · {t("utilizationAsOf")}: {fmtDateDay(asOf)}
            </div>
            {detailLoading ? (
              <div style={{ textAlign: "center", padding: 24 }}>{t("loading")}</div>
            ) : (
              <div className="grouped-list" style={{ maxHeight: 400, overflowY: "auto" }}>
                {detailSessions.map((s) => (
                  <div className="user-row" key={`${s.session_id}-${s.attendee_id}`}>
                    <div className="user-info">
                      <div className="user-display">
                        {fmtDateDay(s.session_date)} · {fmt_time(s.start_time)}
                        {s.is_makeup && (
                          <span className="badge badge-active" style={{ marginInlineStart: 8 }}>{t("makeupBadge")}</span>
                        )}
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
              <button
                type="button"
                className="btn btn-primary btn-sm"
                style={{ marginTop: 12 }}
                onClick={() => { setDetailRow(null); openMakeup(detailRow); }}
              >
                {t("bookMakeup")}
              </button>
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
