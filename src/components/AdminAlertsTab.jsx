import { useState, useEffect, useCallback, useMemo } from "react";
import { useLang } from "../i18n.jsx";
import { useIsDesktop } from "../lib/useBreakpoint.js";
import {
  listOpenAlerts,
  acknowledgeAlert,
  refreshOperationalAlerts,
} from "../lib/operationalAlerts.js";
import { useStudentProfile } from "../lib/StudentProfileContext.jsx";
import { Badge, Button, Card, Field, Select, Spinner } from "./ui/ds/index.js";

const SEVERITY_VARIANT = { info: "info", warn: "warn", critical: "danger" };

function alertTypeLabel(t, type) {
  const key = `alertsType_${type}`;
  const label = t(key);
  return label !== key ? label : type;
}

export default function AdminAlertsTab({ toast }) {
  const { t, fmtDateDay } = useLang();
  const isDesktop = useIsDesktop();
  const { openProfile } = useStudentProfile();
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [ackId, setAckId] = useState(null);
  const [typeFilter, setTypeFilter] = useState("");
  const [severityFilter, setSeverityFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setAlerts(await listOpenAlerts());
    } catch (e) {
      toast.show(e.message || t("systemError"));
    }
    setLoading(false);
  }, [toast, t]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    return alerts.filter((a) => {
      if (typeFilter && a.alert_type !== typeFilter) return false;
      if (severityFilter && a.severity !== severityFilter) return false;
      return true;
    });
  }, [alerts, typeFilter, severityFilter]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const result = await refreshOperationalAlerts();
      if (result?.result === "forbidden") {
        toast.show(t("noPermission"));
      } else {
        toast.show(t("alertsRefreshed", { n: result?.inserted ?? 0 }));
      }
      await load();
    } catch (e) {
      toast.show(e.message || t("systemError"));
    }
    setRefreshing(false);
  };

  const handleAck = async (id) => {
    setAckId(id);
    try {
      await acknowledgeAlert(id);
      toast.show(t("alertsAcknowledged"));
      await load();
    } catch (e) {
      toast.show(e.message || t("systemError"));
    }
    setAckId(null);
  };

  const alertTypes = [...new Set(alerts.map((a) => a.alert_type))];

  return (
    <div>
      {!isDesktop && (
        <div className="page-header">
          <h1 className="page-title">{t("tabAlerts")}</h1>
        </div>
      )}

      <div className="filter-bar" style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-end", marginBottom: 16 }}>
        <Field label={t("alertsFilterType")} style={{ marginBottom: 0, minWidth: 160 }}>
          <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="">{t("allTypes")}</option>
            {alertTypes.map((type) => (
              <option key={type} value={type}>{alertTypeLabel(t, type)}</option>
            ))}
          </Select>
        </Field>
        <Field label={t("alertsFilterSeverity")} style={{ marginBottom: 0, minWidth: 120 }}>
          <Select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)}>
            <option value="">{t("allStatuses")}</option>
            <option value="info">info</option>
            <option value="warn">warn</option>
            <option value="critical">critical</option>
          </Select>
        </Field>
        <Button variant="secondary" size="sm" onClick={handleRefresh} disabled={refreshing}>
          {refreshing ? <Spinner size={14} /> : t("alertsRefresh")}
        </Button>
      </div>

      {loading ? (
        <div className="loading-center">{t("loading")}</div>
      ) : filtered.length === 0 ? (
        <div className="empty-text" style={{ padding: 24 }}>{t("alertsEmpty")}</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map((alert) => {
            const participantId = alert.payload?.participant_id;
            return (
              <Card key={alert.id} style={{ padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                  <div style={{ fontWeight: 600 }}>{alert.title}</div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <Badge variant={SEVERITY_VARIANT[alert.severity] || "neutral"}>
                      {alert.severity}
                    </Badge>
                    <Badge variant="neutral">{alertTypeLabel(t, alert.alert_type)}</Badge>
                  </div>
                </div>
                <div className="log-meta" style={{ marginBottom: 8 }}>
                  {fmtDateDay(String(alert.created_at).slice(0, 10))}
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {participantId && (
                    <Button size="sm" variant="outline" onClick={() => openProfile(participantId)}>
                      {t("openFullProfile")}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={ackId === alert.id}
                    onClick={() => handleAck(alert.id)}
                  >
                    {ackId === alert.id ? <Spinner size={14} /> : t("alertsAcknowledge")}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
