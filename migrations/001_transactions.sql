-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Transactions table
CREATE TABLE IF NOT EXISTS transactions (
  id                        uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   uuid            NOT NULL,
  amount                    numeric         NOT NULL,
  raw_merchant              text,
  normalized_merchant       text,
  category                  text,
  classification_confidence numeric(4, 3)   CHECK (classification_confidence >= 0 AND classification_confidence <= 1),
  classification_reason     text,
  created_at                timestamptz     NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_transactions_user_id
  ON transactions (user_id);

CREATE INDEX IF NOT EXISTS idx_transactions_category
  ON transactions (category);

CREATE INDEX IF NOT EXISTS idx_transactions_normalized_merchant
  ON transactions (normalized_merchant);
