import { useState, useEffect, useCallback } from "react";
import { getPlanningSeason, listSeasons } from "../../lib/seasonPlanning.js";
import AdminSeasonPlanningAnnualTab from "../AdminSeasonPlanningAnnualTab.jsx";
import AdminSeasonPlanningSummerTab from "../AdminSeasonPlanningSummerTab.jsx";

export default function SeasonPlanningPanel({ toast, seasonId, planningMode = "annual" }) {
  const [mode, setMode] = useState(planningMode);
  const [seasons, setSeasons] = useState([]);
  const [activeSeasonId, setActiveSeasonId] = useState(seasonId || "");

  useEffect(() => {
    if (seasonId) setActiveSeasonId(seasonId);
  }, [seasonId]);

  useEffect(() => {
    if (planningMode) setMode(planningMode);
  }, [planningMode]);

  const loadMeta = useCallback(async () => {
    const rows = await listSeasons();
    setSeasons(rows);
    if (!activeSeasonId) {
      const planning = await getPlanningSeason();
      const pick = seasonId || planning?.id || rows.find((s) => !s.active)?.id || rows[0]?.id || "";
      if (pick) setActiveSeasonId(pick);
    }
  }, [activeSeasonId, seasonId]);

  useEffect(() => { loadMeta(); }, [loadMeta]);

  if (mode === "summer") {
    return (
      <AdminSeasonPlanningSummerTab
        toast={toast}
        seasonId={activeSeasonId}
        onSeasonIdChange={setActiveSeasonId}
        seasons={seasons}
      />
    );
  }

  return (
    <AdminSeasonPlanningAnnualTab
      toast={toast}
      seasonId={activeSeasonId}
      onSeasonIdChange={setActiveSeasonId}
      seasons={seasons}
    />
  );
}
