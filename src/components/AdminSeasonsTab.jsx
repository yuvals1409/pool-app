import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase.js";
import { useLang } from "../i18n.jsx";
import { useIsDesktop } from "../lib/useBreakpoint.js";
import {
  Badge,
  Card,
  EmptyState,
  Spinner,
} from "./ui/ds/index.js";

async function loadSeasonStats(seasonId) {
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

export default function AdminSeasonsTab({ toast }) {
  const { t, fmtDateDay } = useLang();
  const isDesktop = useIsDesktop();
  const [rows, setRows] = useState([]);
  const [statsById, setStatsById] = useState({});
  const [loading, setLoading] = useState(true);

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

  const templateLabel = (code) => {
    const key = `seasonTemplate_${code}`;
    const label = t(key);
    return label !== key ? label : code;
  };

  return (
    <div>
      {!isDesktop && (
        <div className="page-header">
          <h1 className="page-title">{t("tabSeasons")}</h1>
          <p className="page-sub">{t("seasonsSub")}</p>
        </div>
      )}

      {isDesktop && (
        <p className="page-sub" style={{ marginBottom: 16 }}>{t("seasonsSub")}</p>
      )}

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 24 }}>
          <Spinner />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState title={t("noSeasons")} />
      ) : (
        <div className="grouped-list">
          {rows.map((s) => {
            const stats = statsById[s.id] || {};
            return (
              <Card key={s.id} style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <div style={{ fontWeight: 600, fontSize: "var(--text-lg)", color: "var(--ink)" }}>{s.name}</div>
                  {s.active && <Badge variant="success">{t("active")}</Badge>}
                </div>
                <div style={{ color: "var(--ink-soft)", marginBottom: 12 }}>
                  {fmtDateDay(s.start_date)} – {fmtDateDay(s.end_date)}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  <Badge variant="neutral">{t("seasonStatProducts", { count: stats.products || 0 })}</Badge>
                  <Badge variant="neutral">{t("seasonStatEnrollments", { count: stats.enrollments || 0 })}</Badge>
                  <Badge variant="neutral">{t("seasonStatPackages", { count: stats.annualPackages || 0 })}</Badge>
                  <Badge variant="neutral">{t("seasonStatBilling", { count: stats.billing || 0 })}</Badge>
                </div>
                {stats.byTemplate && Object.keys(stats.byTemplate).length > 0 && (
                  <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {Object.entries(stats.byTemplate).map(([code, count]) => (
                      <Badge key={code} variant="info">
                        {templateLabel(code)}: {count}
                      </Badge>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
