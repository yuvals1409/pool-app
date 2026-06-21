import { useState, useEffect, useCallback, useMemo } from "react";
import { useLang } from "../i18n.jsx";
import { useIsDesktop } from "../lib/useBreakpoint.js";
import { useStudentProfile } from "../lib/StudentProfileContext.jsx";
import { exportCsv } from "../lib/analytics.js";
import {
  activateSeason,
  carryForwardEnrollments,
  cloneSeasonProducts,
  getPlanningSeason,
  getSeasonPlanningSummary,
  listSeasons,
  seasonLifecycle,
} from "../lib/seasonPlanning.js";
import { fmt_time } from "../lib/lessonDates.js";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  KpiCard,
  Select,
  Spinner,
} from "./ui/ds/index.js";

const DAY_NAMES = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

function dayLabel(day) {
  if (day == null || day === "") return "—";
  const n = Number(day);
  return DAY_NAMES[n] ?? String(day);
}

export default function AdminSeasonPlanningTab({ toast, initialSeasonId = null }) {
  const { t } = useLang();
  const isDesktop = useIsDesktop();
  const { openProfile } = useStudentProfile();
  const [seasons, setSeasons] = useState([]);
  const [seasonId, setSeasonId] = useState(initialSeasonId || "");
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    if (initialSeasonId) setSeasonId(initialSeasonId);
  }, [initialSeasonId]);

  const loadMeta = useCallback(async () => {
    const rows = await listSeasons();
    setSeasons(rows);
    if (!seasonId) {
      const planning = await getPlanningSeason();
      const pick = initialSeasonId || planning?.id || rows.find((s) => !s.active)?.id || rows[0]?.id || "";
      if (pick) setSeasonId(pick);
    }
  }, [seasonId, initialSeasonId]);

  const loadSummary = useCallback(async () => {
    if (!seasonId) {
      setSummary(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await getSeasonPlanningSummary(seasonId);
      setSummary(data);
    } catch (e) {
      toast.show(e.message || t("systemError"));
      setSummary(null);
    }
    setLoading(false);
  }, [seasonId, toast, t]);

  useEffect(() => { loadMeta(); }, [loadMeta]);
  useEffect(() => { loadSummary(); }, [loadSummary]);

  const targetSeason = summary?.target_season;
  const sourceSeason = summary?.source_season;
  const rows = useMemo(() => {
    const list = summary?.rows || [];
    if (statusFilter === "missing") return list.filter((r) => r.status === "missing");
    if (statusFilter === "planned") return list.filter((r) => r.status === "planned");
    return list;
  }, [summary?.rows, statusFilter]);

  const runClone = async () => {
    if (!sourceSeason?.id || !seasonId) return toast.show(t("seasonPlanningNoSource"));
    if (!confirm(t("seasonPlanningCloneConfirm", { name: sourceSeason.name }))) return;
    setBusy("clone");
    try {
      const result = await cloneSeasonProducts(sourceSeason.id, seasonId);
      toast.show(t("seasonPlanningCloneDone", { created: result.created, skipped: result.skipped }));
      await loadSummary();
    } catch (e) {
      toast.show(e.message || t("systemError"));
    }
    setBusy("");
  };

  const runCarryForward = async (dryRun) => {
    if (!sourceSeason?.id || !seasonId) return toast.show(t("seasonPlanningNoSource"));
    const msg = dryRun ? t("seasonPlanningPreviewConfirm") : t("seasonPlanningCarryConfirm");
    if (!confirm(msg)) return;
    setBusy(dryRun ? "preview" : "carry");
    try {
      const result = await carryForwardEnrollments(sourceSeason.id, seasonId, dryRun);
      if (dryRun) {
        toast.show(t("seasonPlanningPreviewDone", {
          count: result.created,
          unmatched: result.unmatched,
        }));
      } else {
        toast.show(t("seasonPlanningCarryDone", {
          created: result.created,
          skipped: result.skipped_duplicate,
          unmatched: result.unmatched,
        }));
        await loadSummary();
      }
    } catch (e) {
      toast.show(e.message || t("systemError"));
    }
    setBusy("");
  };

  const runActivate = async () => {
    if (!seasonId || !targetSeason) return;
    if (!confirm(t("seasonPlanningActivateConfirm", { name: targetSeason.name }))) return;
    setBusy("activate");
    try {
      const result = await activateSeason(seasonId);
      toast.show(t("seasonPlanningActivateDone", { sessions: result.sessions_generated || 0 }));
      await loadMeta();
      await loadSummary();
    } catch (e) {
      toast.show(e.message || t("systemError"));
    }
    setBusy("");
  };

  const exportPlanningCsv = () => {
    const date = new Date().toISOString().slice(0, 10);
    exportCsv(
      `season-planning-${targetSeason?.name || date}.csv`,
      [
        t("childName"),
        t("seasonPlanningStatus"),
        t("seasonPlanningCurrentClass"),
        t("seasonPlanningPlannedClass"),
      ],
      rows.map((row) => [
        row.participant_name || "—",
        row.status === "planned" ? t("seasonPlanningStatusPlanned") : t("seasonPlanningStatusMissing"),
        row.current_product_name || "—",
        row.planned_product_name || "—",
      ]),
    );
  };

  const canActivate = targetSeason && !targetSeason.active && seasonLifecycle(targetSeason) !== "ended";

  return (
    <div>
      {!isDesktop && (
        <div className="page-header">
          <h1 className="page-title">{t("tabSeasonPlanning")}</h1>
          <p className="page-sub">{t("seasonPlanningSub")}</p>
        </div>
      )}

      {isDesktop && (
        <p className="page-sub" style={{ marginBottom: 16 }}>{t("seasonPlanningSub")}</p>
      )}

      <div className="filter-bar" style={{ marginBottom: 16, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-end" }}>
        <Field label={t("seasonPlanningTarget")} style={{ marginBottom: 0, minWidth: 180 }}>
          <Select value={seasonId} onChange={(e) => setSeasonId(e.target.value)}>
            {seasons.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </Select>
        </Field>
        {sourceSeason && (
          <span className="page-sub" style={{ marginBottom: 8 }}>
            {t("seasonPlanningFromSource", { name: sourceSeason.name })}
          </span>
        )}
      </div>

      {targetSeason && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <strong>{targetSeason.name}</strong>
            {targetSeason.active ? (
              <Badge variant="success">{t("active")}</Badge>
            ) : (
              <Badge variant="warn">{t("seasonPlanning")}</Badge>
            )}
            <span className="page-sub">
              {targetSeason.start_date} – {targetSeason.end_date}
            </span>
          </div>
        </Card>
      )}

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 32 }}>
          <Spinner />
        </div>
      ) : !summary ? (
        <EmptyState title={t("seasonPlanningPickSeason")} />
      ) : (
        <>
          <div className="dashboard-kpi-grid" style={{ marginBottom: 16 }}>
            <KpiCard label={t("seasonPlanningActiveCurrent")} value={summary.active_current ?? 0} />
            <KpiCard label={t("seasonPlanningPlannedCount")} value={summary.planned ?? 0} />
            <KpiCard label={t("seasonPlanningMissingCount")} value={summary.missing ?? 0} />
            <KpiCard label={t("seasonPlanningRenewalPct")} value={`${summary.renewal_pct ?? 0}%`} />
          </div>

          <div className="filter-bar" style={{ marginBottom: 16, display: "flex", flexWrap: "wrap", gap: 8 }}>
            <Button
              variant="secondary"
              size="sm"
              disabled={!!busy || !sourceSeason}
              onClick={runClone}
            >
              {busy === "clone" ? t("loading") : t("seasonPlanningCloneProducts")}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={!!busy || !sourceSeason}
              onClick={() => runCarryForward(true)}
            >
              {busy === "preview" ? t("loading") : t("seasonPlanningPreview")}
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={!!busy || !sourceSeason}
              onClick={() => runCarryForward(false)}
            >
              {busy === "carry" ? t("loading") : t("seasonPlanningCarryForward")}
            </Button>
            <Button variant="secondary" size="sm" onClick={exportPlanningCsv} disabled={!rows.length}>
              {t("financeExportCsv")}
            </Button>
            {canActivate && (
              <Button
                variant="primary"
                size="sm"
                disabled={!!busy}
                onClick={runActivate}
              >
                {busy === "activate" ? t("loading") : t("seasonPlanningActivate")}
              </Button>
            )}
          </div>

          <div className="filter-bar" style={{ marginBottom: 12 }}>
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ minWidth: 160 }}>
              <option value="all">{t("seasonPlanningFilterAll")}</option>
              <option value="missing">{t("seasonPlanningFilterMissing")}</option>
              <option value="planned">{t("seasonPlanningFilterPlanned")}</option>
            </Select>
          </div>

          {rows.length === 0 ? (
            <EmptyState title={t("noResults")} />
          ) : isDesktop ? (
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="col-text">{t("childName")}</th>
                    <th className="col-badge">{t("seasonPlanningStatus")}</th>
                    <th className="col-text">{t("seasonPlanningCurrentClass")}</th>
                    <th className="col-text">{t("seasonPlanningPlannedClass")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.participant_id}>
                      <td className="col-text">
                        <button
                          type="button"
                          className="link-button"
                          onClick={() => openProfile(row.participant_id)}
                          style={{ background: "none", border: "none", cursor: "pointer", textDecoration: "underline", padding: 0, font: "inherit" }}
                        >
                          {row.participant_name}
                        </button>
                      </td>
                      <td className="col-badge">
                        <Badge variant={row.status === "planned" ? "success" : "warn"}>
                          {row.status === "planned" ? t("seasonPlanningStatusPlanned") : t("seasonPlanningStatusMissing")}
                        </Badge>
                      </td>
                      <td className="col-text">
                        {row.current_product_name || "—"}
                        <div className="log-meta">
                          {dayLabel(row.current_day)} · {fmt_time(row.current_start)} · {row.current_instructor || ""}
                        </div>
                      </td>
                      <td className="col-text">{row.planned_product_name || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="grouped-list">
              {rows.map((row) => (
                <Card key={row.participant_id} style={{ marginBottom: 8 }}>
                  <button
                    type="button"
                    onClick={() => openProfile(row.participant_id)}
                    style={{ background: "none", border: "none", cursor: "pointer", fontWeight: 600, padding: 0, font: "inherit", textAlign: "start" }}
                  >
                    {row.participant_name}
                  </button>
                  <div style={{ marginTop: 6 }}>
                    <Badge variant={row.status === "planned" ? "success" : "warn"}>
                      {row.status === "planned" ? t("seasonPlanningStatusPlanned") : t("seasonPlanningStatusMissing")}
                    </Badge>
                  </div>
                  <div className="log-meta" style={{ marginTop: 8 }}>{row.current_product_name}</div>
                  <div className="log-meta">{row.planned_product_name || t("seasonPlanningStatusMissing")}</div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
