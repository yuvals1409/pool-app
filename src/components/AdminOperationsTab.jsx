import { useState, useEffect, useCallback, useMemo } from "react";
import { useLang } from "../i18n.jsx";
import { useIsDesktop } from "../lib/useBreakpoint.js";
import { periodPresetRange } from "../lib/commandCenter.js";
import {
  getOperationsDaily,
  listWeeklyCancelledSessions,
  listScheduledMakeups,
} from "../lib/operationsDaily.js";
import { fmt_time } from "../lib/lessonDates.js";
import { Badge, Button, Card, EmptyState, Field, Input, KpiCard } from "./ui/ds/index.js";

const FILL_VARIANT = {
  full: "danger",
  high: "warn",
  low: "info",
  normal: "neutral",
};

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function shiftDateStr(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function AdminOperationsTab({ toast, onOpenUtilization }) {
  const { t, fmtDateDay } = useLang();
  const isDesktop = useIsDesktop();
  const [date, setDate] = useState(todayStr());
  const [sessions, setSessions] = useState([]);
  const [cancelled, setCancelled] = useState([]);
  const [makeups, setMakeups] = useState([]);
  const [loading, setLoading] = useState(true);

  const weekRange = useMemo(() => periodPresetRange("week"), []);

  const fillLabel = (status) => {
    const key = `operationsFill${status.charAt(0).toUpperCase()}${status.slice(1)}`;
    const label = t(key);
    return label !== key ? label : status;
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [daily, cancels, makeupRows] = await Promise.all([
        getOperationsDaily(date),
        listWeeklyCancelledSessions(weekRange.from, weekRange.to),
        listScheduledMakeups(weekRange.from, weekRange.to),
      ]);
      setSessions(daily);
      setCancelled(cancels);
      setMakeups(makeupRows);
    } catch (e) {
      toast.show(e.message || t("systemError"));
    }
    setLoading(false);
  }, [date, weekRange.from, weekRange.to, toast, t]);

  useEffect(() => { load(); }, [load]);

  const kpis = useMemo(() => ({
    total: sessions.length,
    full: sessions.filter((s) => s.fill_status === "full").length,
    low: sessions.filter((s) => s.fill_status === "low").length,
  }), [sessions]);

  return (
    <div>
      {!isDesktop && (
        <div className="page-header">
          <h1 className="page-title">{t("tabOperations")}</h1>
        </div>
      )}

      <p className="schedule-session-hint" style={{ marginBottom: 12 }}>{t("operationsOverview")}</p>

      <div className="filter-bar" style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-end", marginBottom: 16 }}>
        <Field label={t("operationsToday")} style={{ marginBottom: 0, minWidth: 160 }}>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} dir="ltr" />
        </Field>
        <Button size="sm" variant="outline" onClick={() => setDate(shiftDateStr(-1))}>{t("yesterday")}</Button>
        <Button size="sm" variant="outline" onClick={() => setDate(todayStr())}>{t("today")}</Button>
        <Button size="sm" variant="outline" onClick={() => setDate(shiftDateStr(1))}>{t("tomorrow")}</Button>
      </div>

      {loading ? (
        <div className="loading-center">{t("loading")}</div>
      ) : (
        <>
          <div className="dashboard-kpi-grid" style={{ marginBottom: 16 }}>
            <KpiCard label={t("operationsSessions")} value={kpis.total} />
            <KpiCard label={t("operationsFillFull")} value={kpis.full} />
            <KpiCard label={t("operationsFillLow")} value={kpis.low} />
          </div>

          {sessions.length === 0 ? (
            <EmptyState title={t("operationsNoSessions")} style={{ marginBottom: 24 }} />
          ) : isDesktop ? (
            <div className="data-table-wrap" style={{ marginBottom: 24 }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="col-date">{t("startTime")}</th>
                    <th className="col-text">{t("sectionClass")}</th>
                    <th className="col-text">{t("instructor")}</th>
                    <th className="col-num">{t("operationsEnrolled")}</th>
                    <th className="col-badge">{t("operationsFillStatus")}</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((row) => (
                    <tr key={row.session_id}>
                      <td className="col-date" dir="ltr">{fmt_time(row.start_time)}</td>
                      <td className="col-text">{row.product_name}</td>
                      <td className="col-text">
                        {row.instructor_name || "—"}
                        {row.is_substitute && (
                          <Badge variant="info" style={{ marginInlineStart: 6 }}>{t("operationsSubstitute")}</Badge>
                        )}
                      </td>
                      <td className="col-num">
                        {row.enrolled ?? 0}{row.capacity != null ? ` / ${row.capacity}` : ""}
                      </td>
                      <td className="col-badge">
                        <Badge variant={FILL_VARIANT[row.fill_status] || "neutral"}>
                          {fillLabel(row.fill_status || "normal")}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="grouped-list" style={{ marginBottom: 24 }}>
              {sessions.map((row) => (
                <Card key={row.session_id} style={{ padding: 12 }}>
                  <div style={{ fontWeight: 600 }}>{row.product_name}</div>
                  <div className="log-meta" dir="ltr">{fmt_time(row.start_time)}</div>
                  <div className="log-meta">
                    {t("instructor")}: {row.instructor_name || "—"}
                    {row.is_substitute ? ` · ${t("operationsSubstitute")}` : ""}
                  </div>
                  <div className="log-meta">
                    {t("operationsEnrolled")}: {row.enrolled ?? 0}
                    {row.capacity != null ? ` / ${row.capacity}` : ""}
                    {" · "}
                    <Badge variant={FILL_VARIANT[row.fill_status] || "neutral"}>
                      {fillLabel(row.fill_status || "normal")}
                    </Badge>
                  </div>
                </Card>
              ))}
            </div>
          )}

          <div className="dashboard-charts" style={{ marginBottom: 24 }}>
            <Card style={{ padding: 12 }}>
              <div className="crm-card-title">{t("operationsWeeklyCancellations")}</div>
              {cancelled.length === 0 ? (
                <EmptyState title={t("noResults")} style={{ padding: "16px 0" }} />
              ) : (
                <div className="grouped-list">
                  {cancelled.map((row) => (
                    <div className="log-item" key={row.id} style={{ flexDirection: "column", alignItems: "stretch", gap: 4 }}>
                      <div className="log-name">{row.product?.name || "—"}</div>
                      <div className="log-meta">
                        {fmtDateDay(row.session_date)} · {fmt_time(row.start_time)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card style={{ padding: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <div className="crm-card-title" style={{ marginBottom: 0 }}>{t("operationsScheduledMakeups")}</div>
                {onOpenUtilization && (
                  <Button size="sm" variant="outline" onClick={onOpenUtilization}>
                    {t("tabUtilization")}
                  </Button>
                )}
              </div>
              {makeups.length === 0 ? (
                <EmptyState title={t("noResults")} style={{ padding: "16px 0" }} />
              ) : (
                <div className="grouped-list">
                  {makeups.map((row) => (
                    <div className="log-item" key={row.id} style={{ flexDirection: "column", alignItems: "stretch", gap: 4 }}>
                      <div className="log-name">{row.enrollment?.participant?.full_name || "—"}</div>
                      <div className="log-meta">
                        {row.target_session?.product?.name || "—"}
                        {row.target_session?.session_date
                          ? ` · ${fmtDateDay(row.target_session.session_date)}`
                          : ""}
                        {row.target_session?.start_time
                          ? ` · ${fmt_time(row.target_session.start_time)}`
                          : ""}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
