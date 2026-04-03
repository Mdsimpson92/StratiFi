CREATE TABLE IF NOT EXISTS plaid_items (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          text        NOT NULL,
  access_token     text        NOT NULL,
  item_id          text        NOT NULL UNIQUE,
  institution_name text,
  cursor           text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_plaid_items_user_id
  ON plaid_items (user_id);
