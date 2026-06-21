import { useState, useEffect, useCallback } from "react";
import { useLang } from "../i18n.jsx";
import { useIsDesktop } from "../lib/useBreakpoint.js";
import {
  enableSummerPlanning,
  getSummerPlanningSummary,
  listSummerProducts,
  seasonLifecycle,
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

export default function AdminSeasonPlanningSummerTab({ toast, seasonId, onSeasonIdChange, seasons }) {
  const { t } = useLang();
  const isDesktop = useIsDesktop();
  const [summary, setSummary] = useState(null);
  const [summerProducts, setSummerProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    if (!seasonId) {
      setSummary(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [data, products] = await Promise.all([
        getSummerPlanningSummary(seasonId),
        listSummerProducts(seasonId),
      ]);
      setSummary(data);
      setSummerProducts(products);
    } catch (e) {
      toast.show(e.message || t("systemError"));
      setSummary(null);
    }
    setLoading(false);
  }, [seasonId, toast, t]);

  useEffect(() => { load(); }, [load]);

  const season = summary?.season;
  const enabled = season?.summer_planning_enabled;

  const runEnable = async () => {
    if (!confirm(t("seasonSummerEnableConfirm"))) return;
    setBusy("enable");
    try {
      await enableSummerPlanning(seasonId);
      toast.show(t("seasonSummerEnabled"));
      await load();
    } catch (e) {
      toast.show(e.message || t("systemError"));
    }
    setBusy("");
  };

  const seasonRow = seasons.find((s) => s.id === seasonId);
  const lifecycle = seasonRow ? seasonLifecycle(seasonRow) : "unknown";

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
      </div>

      {season && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <strong>{season.name}</strong>
            {enabled ? (
              <Badge variant="success">{t("seasonSummerOpen")}</Badge>
            ) : (
              <Badge variant="warn">{t("seasonSummerLocked")}</Badge>
            )}
          </div>
        </Card>
      )}

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 32 }}>
          <Spinner />
        </div>
      ) : !summary ? (
        <EmptyState title={t("seasonPlanningPickSeason")} />
      ) : !enabled ? (
        <Card>
          <p className="page-sub" style={{ marginBottom: 16 }}>{t("seasonSummerLockedBody")}</p>
          <Button variant="primary" size="sm" onClick={runEnable} disabled={!!busy || lifecycle === "ended"}>
            {busy === "enable" ? t("loading") : t("seasonSummerEnable")}
          </Button>
        </Card>
      ) : (
        <>
          <div className="dashboard-kpi-grid" style={{ marginBottom: 16 }}>
            <KpiCard label={t("seasonSummerCourses")} value={summary.courses ?? 0} />
            <KpiCard label={t("seasonSummerEnrolled")} value={summary.enrolled ?? 0} />
            <KpiCard label={t("seasonSummerSlots")} value={summary.summer_slots ?? 0} />
            <KpiCard label={t("seasonSummerEmptySlots")} value={summary.empty_summer_slots ?? 0} />
          </div>

          <p className="page-sub" style={{ marginBottom: 12 }}>{t("seasonSummerNoClone")}</p>

          <SeasonMasterScheduleGrid
            seasonId={seasonId}
            mode="summer"
            products={summerProducts}
            toast={toast}
            onUpdated={load}
          />
        </>
      )}
    </div>
  );
}
