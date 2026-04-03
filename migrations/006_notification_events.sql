CREATE TABLE IF NOT EXISTS notification_events (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      text        NOT NULL,
  alert_key    text        NOT NULL,
  event_type   text        NOT NULL,
  -- Snapshot of the alert at trigger time for future delivery rendering
  payload      jsonb       NOT NULL DEFAULT '{}',
  delivered    boolean     NOT NULL DEFAULT false,
  delivered_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- For GET /api/notifications (most recent first per user)
CREATE INDEX IF NOT EXISTS notification_events_user_recent_idx
  ON notification_events (user_id, created_at DESC);

-- For deduplication check (no duplicate undelivered events per alert)
CREATE INDEX IF NOT EXISTS notification_events_dedup_idx
  ON notification_events (user_id, alert_key, delivered);
