import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../lib/supabase.js";
import { useLang } from "../../i18n.jsx";
import { useIsDesktop } from "../../lib/useBreakpoint.js";
import { createPlanningSeason, seasonLifecycle } from "../../lib/seasonPlanning.js";
import SeasonListPanel, { SeasonOverviewPanel, loadSeasonStats } from "./SeasonListPanel.jsx";
import SeasonPlanningPanel from "./SeasonPlanningPanel.jsx";
import {
  Button,
  EmptyState,
  SegmentedControl,
} from "../ui/ds/index.js";

export default function AdminSeasonsTab({ toast }) {
  const { t } = useLang();
  const isDesktop = useIsDesktop();
  const [rows, setRows] = useState([]);
  const [statsById, setStatsById] = useState({});
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [selectedSeasonId, setSelectedSeasonId] = useState("");
  const [detailTab, setDetailTab] = useState("overview");
  const [planningMode, setPlanningMode] = useState("annual");
  const [mobileView, setMobileView] = useState("list");

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from("seasons").select("*").order("start_date", { ascending: false });
    if (error) {
      toast.show(error.message);
      setLoading(false);
      return;
    }
    const seasons = data || [];
    setRows(seasons);

    const statsEntries = await Promise.all(
      seasons.map(async (season) => [season.id, await loadSeasonStats(season.id)]),
    );
    setStatsById(Object.fromEntries(statsEntries));
    setLoading(false);
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const hasPlanningSeason = rows.some((s) => seasonLifecycle(s) === "planning");
  const selectedSeason = rows.find((s) => s.id === selectedSeasonId) || null;

  const selectSeason = (seasonId, tab = "overview") => {
    setSelectedSeasonId(seasonId);
    setDetailTab(tab);
    if (!isDesktop) setMobileView("detail");
  };

  const openPlanning = (seasonId, mode) => {
    setSelectedSeasonId(seasonId);
    setPlanningMode(mode);
    setDetailTab(mode === "summer" ? "summer" : "annual");
    if (!isDesktop) setMobileView("detail");
  };

  const handleCreateNext = async () => {
    if (!confirm(t("seasonCreateNextConfirm"))) return;
    setCreating(true);
    try {
      const result = await createPlanningSeason();
      toast.show(t("seasonCreated", { name: result.name }));
      await load();
      openPlanning(result.season_id, "annual");
    } catch (e) {
      if (e.message === "duplicate_season_name") toast.show(t("seasonDuplicateName"));
      else toast.show(e.message || t("systemError"));
    }
    setCreating(false);
  };

  const detailTabOptions = [
    { value: "overview", label: t("seasonPanelOverview") },
    { value: "annual", label: t("seasonPlanningAnnual") },
    { value: "summer", label: t("seasonPlanningSummer") },
  ];

  const renderDetailPanel = () => {
    if (!selectedSeasonId) {
      return <EmptyState title={t("seasonSelectPrompt")} />;
    }

    return (
      <div className="seasons-detail-panel">
        <SegmentedControl
          options={detailTabOptions}
          value={detailTab}
          onChange={setDetailTab}
          size="sm"
        />

        <div style={{ marginTop: 16 }}>
          {detailTab === "overview" && (
            <SeasonOverviewPanel
              season={selectedSeason}
              stats={statsById[selectedSeasonId]}
            />
          )}
          {(detailTab === "annual" || detailTab === "summer") && (
            <SeasonPlanningPanel
              toast={toast}
              seasonId={selectedSeasonId}
              planningMode={detailTab}
            />
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="seasons-tab">
      {!isDesktop && mobileView === "list" && (
        <div className="page-header">
          <h1 className="page-title">{t("tabSeasons")}</h1>
          <p className="page-sub">{t("seasonsSub")}</p>
        </div>
      )}

      {(!isDesktop && mobileView === "list") || isDesktop ? (
        <>
          {isDesktop && (
            <p className="page-sub" style={{ marginBottom: 16 }}>{t("seasonsSub")}</p>
          )}
          <div className="filter-bar" style={{ marginBottom: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button variant="primary" size="sm" onClick={handleCreateNext} disabled={creating || hasPlanningSeason}>
              {creating ? t("loading") : t("seasonCreateNext")}
            </Button>
          </div>
        </>
      ) : null}

      {isDesktop ? (
        <div className="seasons-master-detail">
          <div className="seasons-list-panel">
            <SeasonListPanel
              rows={rows}
              statsById={statsById}
              loading={loading}
              selectedSeasonId={selectedSeasonId}
              onSelectSeason={selectSeason}
              onOpenPlanning={openPlanning}
            />
          </div>
          {renderDetailPanel()}
        </div>
      ) : mobileView === "list" ? (
        <SeasonListPanel
          rows={rows}
          statsById={statsById}
          loading={loading}
          selectedSeasonId={selectedSeasonId}
          onSelectSeason={selectSeason}
          onOpenPlanning={openPlanning}
        />
      ) : (
        <div className="seasons-mobile-detail">
          <div className="seasons-mobile-detail-header">
            <Button variant="secondary" size="sm" onClick={() => setMobileView("list")}>
              {t("groupBackToList")}
            </Button>
            {selectedSeason && (
              <span className="seasons-detail-title">{selectedSeason.name}</span>
            )}
          </div>
          {renderDetailPanel()}
        </div>
      )}
    </div>
  );
}
