import { useState, useEffect, useCallback } from "react";
import { useLang } from "../i18n.jsx";
import { listSheetSyncRuns, triggerSheetSync, MONTHLY_TABS } from "../lib/sheetSync.js";

export default function AdminSheetSyncTab({ toast }) {
  const { t } = useLang();
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRuns(await listSheetSyncRuns());
    } catch (e) {
      toast.show(e.message || t("systemError"));
    }
    setLoading(false);
  }, [toast, t]);

  useEffect(() => { load(); }, [load]);

  const runSync = async (direction) => {
    setSyncing(true);
    try {
      const result = await triggerSheetSync(direction);
      toast.show(result?.message || t("sheetSyncStarted"));
      await load();
    } catch (e) {
      toast.show(e.message || t("sheetSyncFailed"));
    }
    setSyncing(false);
  };

  return (
    <div>
      <div className="section-sub" style={{ marginBottom: 16 }}>{t("sheetSyncSub")}</div>

      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        <button type="button" className="btn btn-primary btn-sm" disabled={syncing} onClick={() => runSync("both")}>
          {syncing ? <><div className="spinner" /> {t("sheetSyncRunning")}</> : t("sheetSyncNow")}
        </button>
        <button type="button" className="btn btn-outline btn-sm" disabled={syncing} onClick={() => runSync("pull")}>
          {t("sheetSyncPull")}
        </button>
        <button type="button" className="btn btn-outline btn-sm" disabled={syncing} onClick={() => runSync("push")}>
          {t("sheetSyncPush")}
        </button>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="label" style={{ marginBottom: 8 }}>{t("sheetSyncTabs")}</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {MONTHLY_TABS.map((tab) => (
            <span key={tab} className="badge badge-pending">{tab}</span>
          ))}
        </div>
        <p className="schedule-session-hint" style={{ marginTop: 12 }}>{t("sheetSyncCliHint")}</p>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 24, color: "var(--ink-soft)" }}>{t("loading")}</div>
      ) : runs.length === 0 ? (
        <div className="empty"><div className="empty-icon">📑</div><div className="empty-text">{t("sheetSyncNoRuns")}</div></div>
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
                  {run.errors.slice(0, 3).map((e) => String(e)).join("; ")}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
