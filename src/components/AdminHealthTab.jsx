import { useState, useEffect, useCallback } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useLang } from "../i18n.jsx";
import { useIsDesktop } from "../lib/useBreakpoint.js";
import {
  getHealthSettings,
  updateHealthSettings,
  loadHealthHistory,
  getHealthScoreForMonth,
  prevMonthValue,
  validateHealthSettings,
} from "../lib/schoolHealth.js";
import { Badge, Button, Card, Field, Input, KpiCard, Spinner } from "./ui/ds/index.js";

const HEALTH_VARIANT = { green: "success", yellow: "warn", red: "danger" };

function currentMonthValue() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function AdminHealthTab({ toast }) {
  const { t } = useLang();
  const isDesktop = useIsDesktop();
  const [month, setMonth] = useState(currentMonthValue());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [score, setScore] = useState({});
  const [prevScore, setPrevScore] = useState({});
  const [history, setHistory] = useState([]);
  const [settings, setSettings] = useState(null);
  const [form, setForm] = useState({
    occupancy_weight: 60,
    growth_ratio_weight: 40,
    green_min: 80,
    yellow_min: 60,
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [current, settingsRow, hist] = await Promise.all([
        getHealthScoreForMonth(month),
        getHealthSettings(),
        loadHealthHistory(12),
      ]);
      const prev = await getHealthScoreForMonth(prevMonthValue(month));
      setScore(current || {});
      setPrevScore(prev || {});
      setHistory(hist);
      if (settingsRow) {
        setSettings(settingsRow);
        setForm({
          occupancy_weight: settingsRow.occupancy_weight ?? 60,
          growth_ratio_weight: settingsRow.growth_ratio_weight ?? 40,
          green_min: settingsRow.green_min ?? 80,
          yellow_min: settingsRow.yellow_min ?? 60,
        });
      }
    } catch (e) {
      toast.show(e.message || t("systemError"));
    }
    setLoading(false);
  }, [month, toast, t]);

  useEffect(() => { load(); }, [load]);

  const scoreDelta = (Number(score.score) || 0) - (Number(prevScore.score) || 0);
  const deltaLabel = scoreDelta > 0 ? `+${scoreDelta}` : String(scoreDelta);

  const handleSaveSettings = async () => {
    if (!settings?.id) return;
    const err = validateHealthSettings(form);
    if (err === "weights") {
      toast.show(t("healthWeightsMustSum100"));
      return;
    }
    if (err) {
      toast.show(t("systemError"));
      return;
    }
    setSaving(true);
    try {
      await updateHealthSettings(settings.id, form);
      toast.show(t("healthSettingsSaved"));
      await load();
    } catch (e) {
      toast.show(e.message || t("systemError"));
    }
    setSaving(false);
  };

  return (
    <div>
      {!isDesktop && (
        <div className="page-header">
          <h1 className="page-title">{t("tabHealth")}</h1>
        </div>
      )}

      <p className="schedule-session-hint" style={{ marginBottom: 12 }}>{t("healthOverview")}</p>

      <div className="filter-bar" style={{ marginBottom: 16 }}>
        <Field label={t("month")} style={{ marginBottom: 0, minWidth: 160 }}>
          <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} dir="ltr" />
        </Field>
      </div>

      {loading ? (
        <div className="loading-center">{t("loading")}</div>
      ) : (
        <>
          <Card style={{ padding: 16, marginBottom: 16, display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{t("healthScore")}</div>
            <Badge variant={HEALTH_VARIANT[score.color] || "neutral"} style={{ fontSize: 22, padding: "10px 18px" }}>
              {score.score ?? "—"}
            </Badge>
            <div className="log-meta">
              {t("healthVsPrevMonth")}: {deltaLabel}
            </div>
          </Card>

          <div className="dashboard-kpi-grid" style={{ marginBottom: 16 }}>
            <KpiCard label={t("ccOccupancy")} value={`${score.occupancy_pct ?? 0}%`} />
            <KpiCard label={t("healthOccupancyComponent")} value={score.occupancy_component ?? 0} />
            <KpiCard label={t("healthGrowthRatio")} value={`${score.growth_ratio ?? 0}%`} />
            <KpiCard label={t("healthGrowthComponent")} value={score.growth_component ?? 0} />
            <KpiCard label={t("healthNewCount")} value={score.new_count ?? 0} />
            <KpiCard label={t("healthChurnCount")} value={score.churn_count ?? 0} />
          </div>

          <Card style={{ minHeight: 280, marginBottom: 16, padding: 12 }}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>{t("healthHistory")}</div>
            {history.length === 0 ? (
              <div className="empty-text" style={{ padding: 24 }}>{t("noResults")}</div>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={history}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} />
                  <Tooltip />
                  <Line type="monotone" dataKey="score" name={t("healthScore")} stroke="#0077B6" strokeWidth={2} />
                  <Line type="monotone" dataKey="occupancy_pct" name={t("ccOccupancy")} stroke="#00B894" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </Card>

          <Card style={{ padding: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>{t("healthSettingsTitle")}</div>
            <div className="filter-bar" style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-end" }}>
              <Field label={t("healthWeightOccupancy")} style={{ marginBottom: 0, minWidth: 120 }}>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={form.occupancy_weight}
                  onChange={(e) => setForm((f) => ({ ...f, occupancy_weight: e.target.value }))}
                  dir="ltr"
                />
              </Field>
              <Field label={t("healthWeightGrowth")} style={{ marginBottom: 0, minWidth: 120 }}>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={form.growth_ratio_weight}
                  onChange={(e) => setForm((f) => ({ ...f, growth_ratio_weight: e.target.value }))}
                  dir="ltr"
                />
              </Field>
              <Field label={t("healthThresholdGreen")} style={{ marginBottom: 0, minWidth: 120 }}>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={form.green_min}
                  onChange={(e) => setForm((f) => ({ ...f, green_min: e.target.value }))}
                  dir="ltr"
                />
              </Field>
              <Field label={t("healthThresholdYellow")} style={{ marginBottom: 0, minWidth: 120 }}>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={form.yellow_min}
                  onChange={(e) => setForm((f) => ({ ...f, yellow_min: e.target.value }))}
                  dir="ltr"
                />
              </Field>
              <Button variant="primary" size="sm" onClick={handleSaveSettings} disabled={saving || !settings?.id}>
                {saving ? <Spinner size={14} /> : t("save")}
              </Button>
            </div>
            <p className="schedule-session-hint" style={{ marginTop: 12, marginBottom: 0 }}>
              {t("healthSettingsHint")}
            </p>
          </Card>
        </>
      )}
    </div>
  );
}
