-- ── Backfill: slots from annual products ─────────────────────
INSERT INTO season_schedule_slots (season_id, layer, day_of_week, start_time, end_time, product_id, label)
SELECT
  p.season_id, 'annual', p.day_of_week, p.start_time, p.end_time, p.id, p.name
FROM products p
JOIN product_templates pt ON pt.id = p.template_id
WHERE pt.code = 'annual_section'
  AND p.day_of_week IS NOT NULL
ON CONFLICT (season_id, layer, day_of_week, start_time) DO NOTHING;

-- ── Backfill: intents from existing planning enrollments ─────
INSERT INTO participant_season_intents (
  season_id, participant_id, intent, target_product_id, enrollment_id
)
SELECT DISTINCT ON (p.season_id, e.participant_id)
  p.season_id, e.participant_id, 'confirmed', e.product_id, e.id
FROM enrollments e
JOIN products p ON p.id = e.product_id
JOIN product_templates pt ON pt.id = p.template_id
JOIN seasons s ON s.id = p.season_id
WHERE e.active = TRUE
  AND pt.code = 'annual_section'
  AND s.active = FALSE
  AND s.start_date > CURRENT_DATE
ON CONFLICT (season_id, participant_id) DO NOTHING;

REVOKE ALL ON FUNCTION public.sync_product_from_schedule_slot(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_product_from_schedule_slot(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.list_source_annual_products(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_source_annual_products(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.apply_participant_intent_enrollment(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_participant_intent_enrollment(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.set_participant_intent(uuid, uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_participant_intent(uuid, uuid, text, uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.carry_forward_intents(uuid, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.carry_forward_intents(uuid, uuid, boolean) TO authenticated;

REVOKE ALL ON FUNCTION public.get_annual_planning_summary(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_annual_planning_summary(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.get_summer_planning_summary(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_summer_planning_summary(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.get_season_master_schedule(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_season_master_schedule(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.upsert_schedule_slot(uuid, text, integer, time, time, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_schedule_slot(uuid, text, integer, time, time, text, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.assign_slot_product(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_slot_product(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.delete_schedule_slot(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_schedule_slot(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.enable_summer_planning(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enable_summer_planning(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.clone_season_products(uuid, uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.clone_season_products(uuid, uuid, uuid[]) TO authenticated;

SELECT 'Season planning v2 migration complete' AS status;
