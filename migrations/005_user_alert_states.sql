CREATE TABLE IF NOT EXISTS user_alert_states (
  user_id    text    NOT NULL,
  alert_key  text    NOT NULL,
  read       boolean NOT NULL DEFAULT false,
  dismissed  boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, alert_key)
);
