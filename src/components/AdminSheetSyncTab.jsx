import { useState, useEffect, useCallback } from "react";
import { useLang } from "../i18n.jsx";
import { useIsDesktop } from "../lib/useBreakpoint.js";
import {
  listSheetSyncRuns,
  triggerMasterSheetSync,
  getMasterSheetConfig,
  MASTER_TAB,
} from "../lib/sheetSync.js";
import { Badge, Button, Card, EmptyState, Spinner } from "./ui/ds/index.js";

export default function AdminSheetSyncTab({ toast }) {
  const { t } = useLang();
  const isDesktop = useIsDesktop();
  const [runs, setRuns] = useState([]);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [runRows, cfg] = await Promise.all([
        listSheetSyncRuns(15),
        getMasterSheetConfig().catch(() => null),
      ]);
      setRuns(runRows);
      setConfig(cfg);
    } catch (e) {
      toast.show(e.message || t("systemError"));
    }
    setLoading(false);
  }, [t, toast]);

  useEffect(() => { load(); }, [load]);

  const runMasterSync = async () => {
    setSyncing(true);
    try {
      const result = await triggerMasterSheetSync();
      if (result?.results?.blocked) {
        toast.show(t("sheetSyncMasterHint"));
      } else {
        toast.show(result?.message || t("sheetSyncStarted"));
      }
      await load();
    } catch (e) {
      toast.show(e.message || t("sheetSyncFailed"));
    }
    setSyncing(false);
  };

  const masterRuns = runs.filter((r) => r.sheet_tab === MASTER_TAB);
  const lastMaster = masterRuns[0];

  return (
    <div>
      {!isDesktop && (
        <div className="page-header">
          <h1 className="page-title">{t("tabSheetSync")}</h1>
          <p className="page-sub">{t("sheetSyncSub")}</p>
        </div>
      )}

      <div className="filter-bar">
        <Button type="button" variant="primary" size="sm" disabled={syncing} onClick={runMasterSync}>
          {syncing ? <><Spinner size={14} color="var(--on-primary)" /> {t("sheetSyncRunning")}</> : t("sheetSyncMaster")}
        </Button>
      </div>

      <Card style={{ marginBottom: 16 }}>
        <div className="label" style={{ marginBottom: 8 }}>{MASTER_TAB}</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <Badge variant="info">{t("sheetSyncGlobalReady")}: {config?.global_ready ? "כן" : "לא"}</Badge>
          {config?.last_groups_sync_at && (
            <Badge variant="info">{t("sheetSyncGroupsLast")}: {new Date(config.last_groups_sync_at).toLocaleString()}</Badge>
          )}
          {config?.last_users_sync_at && (
            <Badge variant="info">{t("sheetSyncUsersLast")}: {new Date(config.last_users_sync_at).toLocaleString()}</Badge>
          )}
          {lastMaster && (
            <Badge variant={lastMaster.status === "ok" ? "success" : "warn"}>
              {t("sheetSyncLastRun")}: {new Date(lastMaster.started_at).toLocaleString()}
            </Badge>
          )}
        </div>
        <p className="schedule-session-hint">{t("sheetSyncMasterHint")}</p>
        <p className="schedule-session-hint" style={{ marginTop: 8 }}>{t("sheetSyncV2OrderHint")}</p>
        <p className="schedule-session-hint" style={{ marginTop: 8 }}>{t("sheetSyncBuildHint")}</p>
        <p className="schedule-session-hint" style={{ marginTop: 8 }}>{t("sheetResyncHint")}</p>
        {import.meta.env.VITE_SHEETS_SPREADSHEET_ID && (
          <p className="schedule-session-hint" style={{ marginTop: 8 }}>
            <a
              href={`https://docs.google.com/spreadsheets/d/${import.meta.env.VITE_SHEETS_SPREADSHEET_ID}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Google Sheet מאסטר
            </a>
          </p>
        )}
      </Card>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 24 }}>
          <Spinner />
        </div>
      ) : runs.length === 0 ? (
        <EmptyState title={t("sheetSyncNoRuns")} />
      ) : (
        <div className="grouped-list">
          {runs.map((run) => (
            <div className="log-item" key={run.id} style={{ flexDirection: "column", alignItems: "stretch", gap: 4 }}>
              <div className="log-name">{run.sheet_tab} · {run.direction} · {run.status}</div>
              <div className="log-meta">
                {new Date(run.started_at).toLocaleString()}
                {" · "}{t("sheetSyncRowsIn")}: {run.rows_in}
                {" · "}{t("sheetSyncRowsOut")}: {run.rows_out}
              </div>
              {Array.isArray(run.errors) && run.errors.length > 0 && (
                <div className="log-meta" style={{ color: "var(--danger)" }}>
                  {run.errors.slice(0, 3).map((e) => (typeof e === "object" ? e.error || JSON.stringify(e) : String(e))).join("; ")}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
