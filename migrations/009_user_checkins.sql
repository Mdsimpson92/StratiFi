-- Weekly check-in cadence tracker.
-- One row per user. Upserted on every generated check-in.
-- The API reads last_checkin_at to enforce the 7-day minimum interval.

CREATE TABLE IF NOT EXISTS user_checkins (
  user_id          TEXT        PRIMARY KEY,
  last_checkin_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
