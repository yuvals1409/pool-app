-- ── Grants ────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.cc_active_student_ids(date, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cc_active_student_ids(date, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.get_school_overview_kpis(date, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_school_overview_kpis(date, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.get_student_demographics(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_student_demographics(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.get_revenue_breakdown(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_revenue_breakdown(date, date) TO authenticated;

REVOKE ALL ON FUNCTION public.get_instructor_analytics(date, date, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_instructor_analytics(date, date, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.get_attendance_summary(date, date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_attendance_summary(date, date, text) TO authenticated;

REVOKE ALL ON FUNCTION public.get_marketing_funnel(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_marketing_funnel(date, date) TO authenticated;

REVOKE ALL ON FUNCTION public.get_operations_daily(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_operations_daily(date) TO authenticated;

REVOKE ALL ON FUNCTION public.get_school_health_score(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_school_health_score(date) TO authenticated;

REVOKE ALL ON FUNCTION public.get_occupancy_trend(date, date, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_occupancy_trend(date, date, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.generate_operational_alerts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_operational_alerts() TO authenticated;

SELECT 'Command Center analytics migration complete' AS status;
