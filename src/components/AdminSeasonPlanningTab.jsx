import { useState, useEffect, useCallback } from "react";
import { useLang } from "../i18n.jsx";
import { useIsDesktop } from "../lib/useBreakpoint.js";
import { getPlanningSeason, listSeasons } from "../lib/seasonPlanning.js";
import AdminSeasonPlanningAnnualTab from "./AdminSeasonPlanningAnnualTab.jsx";
import AdminSeasonPlanningSummerTab from "./AdminSeasonPlanningSummerTab.jsx";
import { SegmentedControl } from "./ui/ds/index.js";

export default function AdminSeasonPlanningTab({
  toast,
  initialSeasonId = null,
  initialMode = "annual",
}) {
  const { t } = useLang();
  const isDesktop = useIsDesktop();
  const [mode, setMode] = useState(initialMode);
  const [seasons, setSeasons] = useState([]);
  const [seasonId, setSeasonId] = useState(initialSeasonId || "");

  useEffect(() => {
    if (initialSeasonId) setSeasonId(initialSeasonId);
  }, [initialSeasonId]);

  useEffect(() => {
    if (initialMode) setMode(initialMode);
  }, [initialMode]);

  const loadMeta = useCallback(async () => {
    const rows = await listSeasons();
    setSeasons(rows);
    if (!seasonId) {
      const planning = await getPlanningSeason();
      const pick = initialSeasonId || planning?.id || rows.find((s) => !s.active)?.id || rows[0]?.id || "";
      if (pick) setSeasonId(pick);
    }
  }, [seasonId, initialSeasonId]);

  useEffect(() => { loadMeta(); }, [loadMeta]);

  const phaseOptions = [
    { value: "annual", label: t("seasonPlanningAnnual") },
    { value: "summer", label: t("seasonPlanningSummer") },
  ];

  return (
    <div>
      {!isDesktop && (
        <div className="page-header">
          <h1 className="page-title">{t("tabSeasonPlanning")}</h1>
          <p className="page-sub">{t("seasonPlanningSubV2")}</p>
        </div>
      )}

      {isDesktop && (
        <p className="page-sub" style={{ marginBottom: 16 }}>{t("seasonPlanningSubV2")}</p>
      )}

      <div style={{ marginBottom: 16 }}>
        <SegmentedControl options={phaseOptions} value={mode} onChange={setMode} size="sm" />
      </div>

      {mode === "annual" ? (
        <AdminSeasonPlanningAnnualTab
          toast={toast}
          seasonId={seasonId}
          onSeasonIdChange={setSeasonId}
          seasons={seasons}
        />
      ) : (
        <AdminSeasonPlanningSummerTab
          toast={toast}
          seasonId={seasonId}
          onSeasonIdChange={setSeasonId}
          seasons={seasons}
        />
      )}
    </div>
  );
}
