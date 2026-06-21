import { useState, useEffect, useCallback, useMemo } from "react";
import { AnimatePresence } from "framer-motion";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import { supabase } from "../../lib/supabase.js";
import { useLang } from "../../i18n.jsx";
import { useIsDesktop } from "../../lib/useBreakpoint.js";
import {
  getInstructorAnalytics,
  getAttendanceSummary,
  periodPresetRange,
} from "../../lib/commandCenter.js";
import { exportCsv } from "../../lib/analytics.js";
import {
  CHART_COLORS,
  CHART_MARGIN_Y_LABELS,
  AXIS_TICK,
  GRID_PROPS,
  categoryYAxisWidth,
  shortChartLabel,
  makeRtlCategoryYAxisTick,
} from "../../lib/chartTheme.js";
import ChartCanvas from "../charts/ChartCanvas.jsx";
import { AnimatedSheetOverlay, AnimatedSheetPanel } from "../ui/AnimatedSheet.jsx";
import {
  Button, Card, Field, Input, Select, SegmentedControl, Spinner,
} from "../ui/ds/index.js";

function yearToDateRange() {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const start = new Date(today.getFullYear(), 0, 1);
  return {
    from: start.toISOString().slice(0, 10),
    to: today.toISOString().slice(0, 10),
  };
}

function formatMoney(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "0";
  return v.toLocaleString("he-IL", { maximumFractionDigits: 0 });
}

export default function InstructorsInsightsPanel({ toast }) {
  const { t } = useLang();
  const isDesktop = useIsDesktop();
  const monthRange = periodPresetRange("month");
  const [periodPreset, setPeriodPreset] = useState("month");
  const [from, setFrom] = useState(monthRange.from);
  const [to, setTo] = useState(monthRange.to);
  const [filterInstructorId, setFilterInstructorId] = useState("");
  const [instructorProfiles, setInstructorProfiles] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detailRow, setDetailRow] = useState(null);

  useEffect(() => {
    if (periodPreset === "month") {
      const r = periodPresetRange("month");
      setFrom(r.from);
      setTo(r.to);
    } else if (periodPreset === "week") {
      const r = periodPresetRange("week");
      setFrom(r.from);
      setTo(r.to);
    } else if (periodPreset === "year") {
      const r = yearToDateRange();
      setFrom(r.from);
      setTo(r.to);
    }
  }, [periodPreset]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, email, hired_at")
        .eq("role", "instructor")
        .eq("status", "approved")
        .order("full_name");
      setInstructorProfiles(data || []);
    })();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getInstructorAnalytics(
        from,
        to,
        filterInstructorId || null,
      );
      setRows(data || []);
    } catch (e) {
      toast.show(e.message || t("systemError"));
    }
    setLoading(false);
  }, [from, to, filterInstructorId]);

  useEffect(() => { load(); }, [load]);

  const exportInstructorsCsv = () => {
    const date = new Date().toISOString().slice(0, 10);
    exportCsv(
      `instructors-analytics-${date}.csv`,
      [
        t("instructor"),
        t("instructorsStudentCount"),
        t("instructorsGroupCount"),
        t("instructorsOccupancy"),
        t("instructorsAttendance"),
        t("instructorsRevenueToSchool"),
        t("instructorsHiredAt"),
      ],
      rows.map((row) => [
        row.instructor_name,
        row.student_count ?? 0,
        row.group_count ?? 0,
        row.occupancy_pct ?? 0,
        row.attendance_pct ?? 0,
        row.revenue_to_school ?? 0,
        row.hired_at || "—",
      ]),
    );
  };

  const periodOptions = [
    { value: "week", label: t("ccPeriodWeek") },
    { value: "month", label: t("ccPeriodMonth") },
    { value: "year", label: t("financePeriodYear") },
  ];

  return (
    <div>

      <p className="schedule-session-hint" style={{ marginBottom: 4 }}>{t("instructorsOverview")}</p>
      <p className="schedule-session-hint" style={{ marginBottom: 12 }}>{t("instructorsPayrollHint")}</p>

      <div className="filter-bar" style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-end", marginBottom: 16 }}>
        <Field label={t("ccTrendPeriod")} style={{ marginBottom: 0 }}>
          <SegmentedControl options={periodOptions} value={periodPreset} onChange={setPeriodPreset} size="sm" />
        </Field>
        <Field label={t("validFrom")} style={{ marginBottom: 0, minWidth: 140 }}>
          <Input type="date" value={from} onChange={(e) => { setPeriodPreset("custom"); setFrom(e.target.value); }} dir="ltr" />
        </Field>
        <Field label={t("validUntil")} style={{ marginBottom: 0, minWidth: 140 }}>
          <Input type="date" value={to} onChange={(e) => { setPeriodPreset("custom"); setTo(e.target.value); }} dir="ltr" />
        </Field>
        <Field label={t("instructor")} style={{ marginBottom: 0, minWidth: 180 }}>
          <Select value={filterInstructorId} onChange={(e) => setFilterInstructorId(e.target.value)}>
            <option value="">{t("allInstructors")}</option>
            {instructorProfiles.map((p) => (
              <option key={p.id} value={p.id}>{p.full_name || p.email}</option>
            ))}
          </Select>
        </Field>
        <Button variant="secondary" size="sm" onClick={exportInstructorsCsv} disabled={!rows.length}>
          {t("instructorsExportCsv")}
        </Button>
      </div>

      {loading ? (
        <div className="loading-center">{t("loading")}</div>
      ) : rows.length === 0 ? (
        <div className="empty-text" style={{ padding: 24 }}>{t("noResults")}</div>
      ) : isDesktop ? (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t("instructor")}</th>
                <th>{t("instructorsStudentCount")}</th>
                <th>{t("instructorsGroupCount")}</th>
                <th>{t("instructorsOccupancy")}</th>
                <th>{t("instructorsAttendance")}</th>
                <th>{t("instructorsRevenueToSchool")}</th>
                <th>{t("instructorsHiredAt")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.instructor_id || row.instructor_name}
                  className="data-table-row--clickable"
                  style={{ cursor: "pointer" }}
                  onClick={() => setDetailRow(row)}
                >
                  <td className="col-text">{row.instructor_name}</td>
                  <td className="col-num">{row.student_count ?? 0}</td>
                  <td className="col-num">{row.group_count ?? 0}</td>
                  <td className="col-num">{row.occupancy_pct ?? 0}%</td>
                  <td className="col-num">{row.attendance_pct ?? 0}%</td>
                  <td className="col-num">₪{formatMoney(row.revenue_to_school)}</td>
                  <td className="col-date">{row.hired_at || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div>
          {rows.map((row) => (
            <Card
              key={row.instructor_id || row.instructor_name}
              style={{ marginBottom: 8, cursor: "pointer" }}
              onClick={() => setDetailRow(row)}
            >
              <div style={{ fontWeight: 600 }}>{row.instructor_name}</div>
              <div className="log-meta">
                {t("instructorsStudentCount")}: {row.student_count ?? 0}
                {" · "}{t("instructorsGroupCount")}: {row.group_count ?? 0}
              </div>
              <div className="log-meta">
                {t("instructorsOccupancy")}: {row.occupancy_pct ?? 0}%
                {" · "}{t("instructorsAttendance")}: {row.attendance_pct ?? 0}%
              </div>
              <div className="log-meta">
                {t("instructorsRevenueToSchool")}: ₪{formatMoney(row.revenue_to_school)}
              </div>
            </Card>
          ))}
        </div>
      )}

      <InstructorDetailPanel
        row={detailRow}
        from={from}
        to={to}
        open={!!detailRow}
        onClose={() => setDetailRow(null)}
        toast={toast}
        onSaved={load}
      />
    </div>
  );
}

function InstructorDetailPanel({ row, from, to, open, onClose, toast, onSaved }) {
  const { t } = useLang();
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState([]);
  const [attendanceByGroup, setAttendanceByGroup] = useState([]);
  const [editHiredAt, setEditHiredAt] = useState("");
  const [saving, setSaving] = useState(false);

  const loadDetail = useCallback(async () => {
    if (!row) return;
    setLoading(true);
    try {
      setEditHiredAt(row.hired_at || "");

      let productQuery = supabase
        .from("products")
        .select("id, name, instructor_id, instructor_name")
        .order("name");

      if (row.instructor_id) {
        productQuery = productQuery.eq("instructor_id", row.instructor_id);
      } else if (row.instructor_name) {
        productQuery = productQuery.eq("instructor_name", row.instructor_name);
      }

      const [{ data: prods }, summary] = await Promise.all([
        productQuery,
        getAttendanceSummary(from, to, "product"),
      ]);

      const productList = prods || [];
      setProducts(productList);
      const productIds = new Set(productList.map((p) => p.id));
      setAttendanceByGroup(
        (summary || []).filter((s) => productIds.has(s.entity_id)),
      );
    } catch (e) {
      toast?.show(e.message || t("systemError"));
    }
    setLoading(false);
  }, [row, from, to]);

  useEffect(() => {
    if (open && row) loadDetail();
    if (!open) {
      setProducts([]);
      setAttendanceByGroup([]);
    }
  }, [open, row, loadDetail]);

  const saveHiredAt = async () => {
    if (!row?.instructor_id) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ hired_at: editHiredAt || null })
        .eq("id", row.instructor_id);
      if (error) throw error;
      toast?.show(t("hiredAtUpdated"));
      onSaved?.();
      await loadDetail();
    } catch (e) {
      toast?.show(e.message || t("systemError"));
    }
    setSaving(false);
  };

  const attendanceChart = useMemo(
    () => attendanceByGroup.map((g) => ({
      name: shortChartLabel(g.label, 18),
      fullName: g.label,
      rate: g.attendance_rate ?? 0,
    })),
    [attendanceByGroup],
  );
  const attendanceYWidth = categoryYAxisWidth(attendanceChart.map((r) => r.name), 88, 130);
  const attendanceYTick = useMemo(() => makeRtlCategoryYAxisTick(attendanceYWidth), [attendanceYWidth]);

  return (
    <AnimatePresence>
      {open && row && (
        <AnimatedSheetOverlay onClose={onClose}>
          <AnimatedSheetPanel onClick={(e) => e.stopPropagation()}>
            <div className="section-title">{t("instructorsDetailTitle")}</div>
            <div className="section-sub" style={{ marginBottom: 12 }}>{row.instructor_name}</div>

            {loading ? (
              <div style={{ display: "flex", justifyContent: "center", padding: 24 }}>
                <Spinner />
              </div>
            ) : (
              <>
                <Card style={{ marginBottom: 12, padding: 12 }}>
                  <div className="log-meta">{t("instructorsStudentCount")}: {row.student_count ?? 0}</div>
                  <div className="log-meta">{t("instructorsGroupCount")}: {row.group_count ?? 0}</div>
                  <div className="log-meta">{t("instructorsOccupancy")}: {row.occupancy_pct ?? 0}%</div>
                  <div className="log-meta">{t("instructorsAttendance")}: {row.attendance_pct ?? 0}%</div>
                  <div className="log-meta">{t("instructorsRevenueToSchool")}: ₪{formatMoney(row.revenue_to_school)}</div>
                  <div className="log-meta">{t("instructorsPlannedHours")}: {row.weekly_hours ?? 0}</div>
                </Card>

                {row.instructor_id ? (
                  <>
                    <Field label={t("instructorsHiredAt")}>
                      <Input
                        type="date"
                        value={editHiredAt}
                        onChange={(e) => setEditHiredAt(e.target.value)}
                        dir="ltr"
                      />
                    </Field>
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      disabled={saving}
                      onClick={saveHiredAt}
                      style={{ marginBottom: 16 }}
                    >
                      {saving ? <Spinner size={14} /> : t("save")}
                    </Button>
                  </>
                ) : (
                  <p className="schedule-session-hint" style={{ marginBottom: 16 }}>
                    {t("instructorsNoProfileHint")}
                  </p>
                )}

                <div className="section-title" style={{ fontSize: 14 }}>{t("studentCurrentGroup")}</div>
                {products.length === 0 ? (
                  <p className="empty-text" style={{ marginBottom: 12 }}>{t("noResults")}</p>
                ) : (
                  <div style={{ marginBottom: 16 }}>
                    {products.map((p) => (
                      <div key={p.id} className="log-item" style={{ marginBottom: 4 }}>
                        <div className="log-name">{p.name}</div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="section-title" style={{ fontSize: 14 }}>{t("instructorsAttendanceByGroup")}</div>
                {attendanceChart.length === 0 ? (
                  <p className="empty-text" style={{ marginBottom: 12 }}>{t("noResults")}</p>
                ) : (
                  <ChartCanvas height={200}>
                    <BarChart data={attendanceChart} layout="vertical" margin={CHART_MARGIN_Y_LABELS}>
                      <CartesianGrid {...GRID_PROPS} horizontal={false} />
                      <XAxis type="number" domain={[0, 100]} unit="%" tick={AXIS_TICK} />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={attendanceYWidth}
                        tick={attendanceYTick}
                      />
                      <Tooltip
                        formatter={(v) => [`${v}%`, t("instructorsAttendance")]}
                        labelFormatter={(_, items) => items?.[0]?.payload?.fullName || ""}
                      />
                      <Bar dataKey="rate" name={t("instructorsAttendance")} fill={CHART_COLORS[0]} radius={[0, 4, 4, 0]} maxBarSize={18} />
                    </BarChart>
                  </ChartCanvas>
                )}

                <p className="schedule-session-hint">{t("instructorsRevenueHint")}</p>

                <Button type="button" variant="secondary" fullWidth style={{ marginTop: 16 }} onClick={onClose}>
                  {t("close")}
                </Button>
              </>
            )}
          </AnimatedSheetPanel>
        </AnimatedSheetOverlay>
      )}
    </AnimatePresence>
  );
}
