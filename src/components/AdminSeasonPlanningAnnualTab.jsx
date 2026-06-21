import { useState, useEffect, useCallback, useMemo } from "react";
import { useLang } from "../i18n.jsx";
import { useIsDesktop } from "../lib/useBreakpoint.js";
import { useStudentProfile } from "../lib/StudentProfileContext.jsx";
import { exportCsv } from "../lib/analytics.js";
import { fmt_time } from "../lib/lessonDates.js";
import {
  activateSeason,
  carryForwardEnrollments,
  cloneSeasonProducts,
  getSeasonPlanningSummary,
  listAnnualProducts,
  listSeasons,
  listSourceAnnualProducts,
  seasonLifecycle,
  setParticipantIntent,
} from "../lib/seasonPlanning.js";
import SeasonMasterScheduleGrid from "./season/SeasonMasterScheduleGrid.jsx";
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

function intentLabelKey(intent) {
  if (!intent || intent === "no_intent") return "intent_no_status";
  return `intent_${intent}`;
}

export default function AdminSeasonPlanningAnnualTab({ toast, seasonId, onSeasonIdChange, seasons }) {
  const { t } = useLang();
  const isDesktop = useIsDesktop();
  const { openProfile } = useStudentProfile();
  const [summary, setSummary] = useState(null);
  const [annualProducts, setAnnualProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [cloneOpen, setCloneOpen] = useState(false);
  const [cloneProducts, setCloneProducts] = useState([]);
  const [selectedCloneIds, setSelectedCloneIds] = useState(new Set());
  const [intentBusy, setIntentBusy] = useState("");

  const loadSummary = useCallback(async () => {
    if (!seasonId) {
      setSummary(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [data, products] = await Promise.all([
        getSeasonPlanningSummary(seasonId),
        listAnnualProducts(seasonId),
      ]);
      setSummary(data);
      setAnnualProducts(products);
    } catch (e) {
      toast.show(e.message || t("systemError"));
      setSummary(null);
    }
    setLoading(false);
  }, [seasonId, toast, t]);

  useEffect(() => { loadSummary(); }, [loadSummary]);

  const targetSeason = summary?.target_season;
  const sourceSeason = summary?.source_season;

  const rows = useMemo(() => {
    const list = summary?.rows || [];
    if (statusFilter === "all") return list;
    return list.filter((r) => (r.intent || r.status) === statusFilter);
  }, [summary?.rows, statusFilter]);

  const openCloneModal = async () => {
    if (!sourceSeason?.id) return toast.show(t("seasonPlanningNoSource"));
    setBusy("clone-load");
    try {
      const products = await listSourceAnnualProducts(sourceSeason.id);
      setCloneProducts(products);
      setSelectedCloneIds(new Set(products.map((p) => p.id)));
      setCloneOpen(true);
    } catch (e) {
      toast.show(e.message || t("systemError"));
    }
    setBusy("");
  };

  const runClone = async () => {
    const ids = [...selectedCloneIds];
    if (!ids.length) return toast.show(t("seasonPlanningCloneNone"));
    if (!confirm(t("seasonPlanningCloneSelectConfirm", { count: ids.length, name: sourceSeason.name }))) return;
    setBusy("clone");
    try {
      const result = await cloneSeasonProducts(sourceSeason.id, seasonId, ids);
      toast.show(t("seasonPlanningCloneDone", { created: result.created, skipped: result.skipped }));
      setCloneOpen(false);
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
        toast.show(t("seasonPlanningCarryIntentsDone", {
          created: result.created,
          skipped: result.skipped,
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
      await loadSummary();
    } catch (e) {
      toast.show(e.message || t("systemError"));
    }
    setBusy("");
  };

  const handleIntentChange = async (row, intent) => {
    setIntentBusy(row.participant_id);
    try {
      await setParticipantIntent({
        seasonId,
        participantId: row.participant_id,
        intent,
        targetProductId: row.target_product_id,
        sourceProductId: row.source_product_id,
      });
      await loadSummary();
    } catch (e) {
      toast.show(e.message || t("systemError"));
    }
    setIntentBusy("");
  };

  const exportPlanningCsv = () => {
    const date = new Date().toISOString().slice(0, 10);
    exportCsv(
      `season-planning-annual-${targetSeason?.name || date}.csv`,
      [
        t("childName"),
        t("seasonPlanningStatus"),
        t("seasonPlanningCurrentClass"),
        t("seasonPlanningPlannedClass"),
      ],
      rows.map((row) => [
        row.participant_name || "—",
        t(`intent_${row.intent || row.status}`),
        row.current_product_name || "—",
        row.planned_product_name || "—",
      ]),
    );
  };

  const canActivate = targetSeason && !targetSeason.active && seasonLifecycle(targetSeason) !== "ended";

  const intentLabel = (intent) => {
    const key = intentLabelKey(intent);
    const label = t(key);
    return label !== key ? label : intent;
  };

  return (
    <div>
      <div className="filter-bar" style={{ marginBottom: 16, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-end" }}>
        <Field label={t("seasonPlanningTarget")} style={{ marginBottom: 0, minWidth: 180 }}>
          <Select value={seasonId} onChange={(e) => onSeasonIdChange(e.target.value)}>
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
            <KpiCard label={t("intent_confirmed")} value={summary.confirmed ?? 0} />
            <KpiCard label={t("intent_refused")} value={summary.refused ?? 0} />
            <KpiCard label={t("intent_undecided")} value={(summary.undecided ?? 0) + (summary.no_intent ?? 0)} />
            <KpiCard label={t("seasonPlanningRenewalPct")} value={`${summary.renewal_pct ?? 0}%`} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: isDesktop ? "1fr 1fr" : "1fr", gap: 16, marginBottom: 16 }}>
            <div>
              <div className="filter-bar" style={{ marginBottom: 12, display: "flex", flexWrap: "wrap", gap: 8 }}>
                <Button variant="secondary" size="sm" disabled={!!busy || !sourceSeason} onClick={openCloneModal}>
                  {busy === "clone-load" ? t("loading") : t("seasonPlanningCloneSelect")}
                </Button>
                <Button variant="secondary" size="sm" disabled={!!busy || !sourceSeason} onClick={() => runCarryForward(true)}>
                  {busy === "preview" ? t("loading") : t("seasonPlanningPreview")}
                </Button>
                <Button variant="primary" size="sm" disabled={!!busy || !sourceSeason} onClick={() => runCarryForward(false)}>
                  {busy === "carry" ? t("loading") : t("seasonPlanningCarryForward")}
                </Button>
                <Button variant="secondary" size="sm" onClick={exportPlanningCsv} disabled={!rows.length}>
                  {t("financeExportCsv")}
                </Button>
                {canActivate && (
                  <Button variant="primary" size="sm" disabled={!!busy} onClick={runActivate}>
                    {busy === "activate" ? t("loading") : t("seasonPlanningActivate")}
                  </Button>
                )}
              </div>
            </div>
            <SeasonMasterScheduleGrid
              seasonId={seasonId}
              mode="annual"
              products={annualProducts}
              toast={toast}
              onUpdated={loadSummary}
            />
          </div>

          <div className="filter-bar" style={{ marginBottom: 12 }}>
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ minWidth: 180 }}>
              <option value="all">{t("seasonPlanningFilterAll")}</option>
              <option value="confirmed">{t("intent_confirmed")}</option>
              <option value="refused">{t("intent_refused")}</option>
              <option value="undecided">{t("intent_undecided")}</option>
              <option value="no_intent">{t("intent_no_status")}</option>
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
                    <th className="col-text">{t("seasonPlanningCurrentClass")}</th>
                    <th className="col-text">{t("seasonPlanningPlannedClass")}</th>
                    <th className="col-badge">{t("seasonPlanningStatus")}</th>
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
                      <td className="col-text">
                        {row.current_product_name || "—"}
                        <div className="log-meta">
                          {dayLabel(row.current_day)} · {fmt_time(row.current_start)} · {row.current_instructor || ""}
                        </div>
                      </td>
                      <td className="col-text">{row.planned_product_name || "—"}</td>
                      <td className="col-badge">
                        <Select
                          value={row.intent === "no_intent" ? "undecided" : row.intent}
                          onChange={(e) => handleIntentChange(row, e.target.value)}
                          disabled={intentBusy === row.participant_id || (row.intent === "no_intent" && !row.target_product_id)}
                          style={{ minWidth: 130 }}
                        >
                          <option value="confirmed">{t("intent_confirmed")}</option>
                          <option value="refused">{t("intent_refused")}</option>
                          <option value="undecided">{t("intent_undecided")}</option>
                        </Select>
                      </td>
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
                  <div style={{ marginTop: 8 }}>
                    <Select
                      value={row.intent === "no_intent" ? "undecided" : row.intent}
                      onChange={(e) => handleIntentChange(row, e.target.value)}
                      disabled={intentBusy === row.participant_id}
                    >
                      <option value="confirmed">{t("intent_confirmed")}</option>
                      <option value="refused">{t("intent_refused")}</option>
                      <option value="undecided">{t("intent_undecided")}</option>
                    </Select>
                  </div>
                  <div className="log-meta" style={{ marginTop: 8 }}>{row.current_product_name}</div>
                  <div className="log-meta">{row.planned_product_name || "—"}</div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {cloneOpen && (
        <div className="modal-overlay" onClick={() => setCloneOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480, width: "100%", maxHeight: "80vh", overflow: "auto" }}>
            <div style={{ fontWeight: 600, marginBottom: 12 }}>{t("seasonPlanningCloneSelect")}</div>
            <p className="page-sub">{t("seasonPlanningCloneSelectSub", { name: sourceSeason?.name })}</p>
            <div style={{ marginBottom: 16 }}>
              {cloneProducts.map((p) => (
                <label key={p.id} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={selectedCloneIds.has(p.id)}
                    onChange={(e) => {
                      setSelectedCloneIds((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(p.id);
                        else next.delete(p.id);
                        return next;
                      });
                    }}
                  />
                  <span>
                    {p.name} · {dayLabel(p.day_of_week)} {fmt_time(p.start_time)}
                    {p.instructor_name ? ` · ${p.instructor_name}` : ""}
                  </span>
                </label>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Button variant="secondary" size="sm" onClick={() => setCloneOpen(false)}>{t("cancel")}</Button>
              <Button variant="primary" size="sm" onClick={runClone} disabled={busy === "clone"}>
                {busy === "clone" ? t("loading") : t("seasonPlanningCloneRun")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
