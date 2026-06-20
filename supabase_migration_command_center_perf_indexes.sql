-- Command Center — performance indexes for analytics RPCs

CREATE INDEX IF NOT EXISTS enrollments_active_product_idx
  ON enrollments (product_id)
  WHERE active = TRUE;

CREATE INDEX IF NOT EXISTS enrollments_cancelled_at_idx
  ON enrollments (cancelled_at)
  WHERE cancelled_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS scheduled_sessions_date_product_idx
  ON scheduled_sessions (session_date, product_id);

CREATE INDEX IF NOT EXISTS attendance_events_status_idx
  ON attendance_events (status, enrollment_id);

CREATE INDEX IF NOT EXISTS assessment_leads_created_at_idx
  ON assessment_leads (created_at);
