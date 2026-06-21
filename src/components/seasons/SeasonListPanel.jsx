import { supabase } from "../../lib/supabase.js";
import { useLang } from "../../i18n.jsx";
import { seasonLifecycle } from "../../lib/seasonPlanning.js";
import { Badge, Button, EmptyState, Spinner } from "../ui/ds/index.js";

export async function loadSeasonStats(seasonId) {
  const { data: productRows } = await supabase
    .from("products")
    .select("id, product_templates(code)")
    .eq("season_id", seasonId);

  const products = productRows?.length || 0;
  const productIds = productRows?.map((p) => p.id) || [];

  const [
    { count: enrollments },
    { count: annualPackages },
    { count: billing },
  ] = await Promise.all([
    productIds.length
      ? supabase.from("enrollments").select("id", { count: "exact", head: true }).in("product_id", productIds)
      : Promise.resolve({ count: 0 }),
    supabase.from("participant_annual_packages").select("id", { count: "exact", head: true }).eq("season_id", seasonId),
    supabase.from("billing_records").select("id", { count: "exact", head: true }).eq("season_id", seasonId),
  ]);

  const byTemplate = {};
  for (const row of productRows || []) {
    const code = row.product_templates?.code || "other";
    byTemplate[code] = (byTemplate[code] || 0) + 1;
  }

  return {
    products,
    enrollments: enrollments || 0,
    annualPackages: annualPackages || 0,
    billing: billing || 0,
    byTemplate,
  };
}

export function seasonStatusBadge(t, season) {
  const lifecycle = seasonLifecycle(season);
  if (lifecycle === "active") return <Badge variant="success">{t("active")}</Badge>;
  if (lifecycle === "planning") return <Badge variant="warn">{t("seasonPlanning")}</Badge>;
  return <Badge variant="neutral">{t("seasonEnded")}</Badge>;
}

export default function SeasonListPanel({
  rows,
  statsById,
  loading,
  selectedSeasonId,
  onSelectSeason,
  onOpenPlanning,
}) {
  const { t, fmtDateDay } = useLang();

  const templateLabel = (code) => {
    const key = `seasonTemplate_${code}`;
    const label = t(key);
    return label !== key ? label : code;
  };

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: 24 }}>
        <Spinner />
      </div>
    );
  }

  if (rows.length === 0) {
    return <EmptyState title={t("noSeasons")} />;
  }

  return (
    <div className="seasons-list">
      {rows.map((s) => {
        const stats = statsById[s.id] || {};
        const lifecycle = seasonLifecycle(s);
        return (
          <button
            type="button"
            key={s.id}
            className={`seasons-list-item${selectedSeasonId === s.id ? " seasons-list-item--selected" : ""}`}
            onClick={() => onSelectSeason(s.id, "overview")}
          >
            <div className="seasons-list-item__header">
              <span className="seasons-list-item__name">{s.name}</span>
              {seasonStatusBadge(t, s)}
            </div>
            <div className="seasons-list-item__dates">
              {fmtDateDay(s.start_date)} – {fmtDateDay(s.end_date)}
            </div>
            <div className="seasons-list-item__stats">
              <Badge variant="neutral">{t("seasonStatProducts", { count: stats.products || 0 })}</Badge>
              <Badge variant="neutral">{t("seasonStatEnrollments", { count: stats.enrollments || 0 })}</Badge>
            </div>
            {(lifecycle === "planning" || !s.active) && onOpenPlanning && (
              <div className="seasons-list-item__actions" onClick={(e) => e.stopPropagation()}>
                <Button variant="secondary" size="sm" onClick={() => onOpenPlanning(s.id, "annual")}>
                  {t("seasonOpenPlanningAnnual")}
                </Button>
                <Button variant="secondary" size="sm" onClick={() => onOpenPlanning(s.id, "summer")}>
                  {t("seasonOpenPlanningSummer")}
                </Button>
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function SeasonOverviewPanel({ season, stats }) {
  const { t, fmtDateDay } = useLang();

  if (!season) return null;

  const templateLabel = (code) => {
    const key = `seasonTemplate_${code}`;
    const label = t(key);
    return label !== key ? label : code;
  };

  return (
    <div className="seasons-overview-panel">
      <div className="seasons-detail-header">
        <h2 className="seasons-detail-title">{season.name}</h2>
        {seasonStatusBadge(t, season)}
      </div>
      <div style={{ color: "var(--ink-soft)", marginBottom: 16 }}>
        {fmtDateDay(season.start_date)} – {fmtDateDay(season.end_date)}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        <Badge variant="neutral">{t("seasonStatProducts", { count: stats?.products || 0 })}</Badge>
        <Badge variant="neutral">{t("seasonStatEnrollments", { count: stats?.enrollments || 0 })}</Badge>
        <Badge variant="neutral">{t("seasonStatPackages", { count: stats?.annualPackages || 0 })}</Badge>
        <Badge variant="neutral">{t("seasonStatBilling", { count: stats?.billing || 0 })}</Badge>
      </div>
      {stats?.byTemplate && Object.keys(stats.byTemplate).length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {Object.entries(stats.byTemplate).map(([code, count]) => (
            <Badge key={code} variant="info">
              {templateLabel(code)}: {count}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
