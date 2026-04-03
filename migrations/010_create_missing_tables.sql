-- Migration 010: Create tables that previously lived in Supabase
--
-- These tables were managed by the Supabase-hosted database and never
-- existed in the pg-direct database. Now that all auth is Clerk-based,
-- they need to exist here with TEXT user IDs (no RLS, no auth.users FK).

BEGIN;

-- ── profiles ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS profiles (
  id                   text    PRIMARY KEY,  -- Clerk user ID
  age                  int,
  household_size       int,
  annual_income        numeric(12, 2),
  monthly_expenses     numeric(12, 2),
  total_debt           numeric(12, 2),
  monthly_debt_payment numeric(12, 2),
  liquid_savings       numeric(12, 2),
  retirement_savings   numeric(12, 2),
  primary_goal         text,
  time_horizon         text,
  risk_tolerance       text,
  share_enabled        boolean DEFAULT false,
  created_at           timestamptz DEFAULT now(),
  updated_at           timestamptz DEFAULT now()
);

-- ── foundation_scores ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS foundation_scores (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              text        NOT NULL,
  emergency_fund_score numeric(5, 2),
  debt_ratio_score     numeric(5, 2),
  savings_rate_score   numeric(5, 2),
  overall_score        numeric(5, 2),
  calculated_at        timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_foundation_scores_user
  ON foundation_scores (user_id, calculated_at DESC);

-- ── recommendations ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS recommendations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       text NOT NULL,
  priority_rank int  NOT NULL,
  category      text,
  title         text NOT NULL,
  description   text,
  action        text,
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recommendations_user
  ON recommendations (user_id);

-- ── uploaded_files ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS uploaded_files (
  id               uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          text    NOT NULL,
  filename         text    NOT NULL,
  row_count        int     NOT NULL DEFAULT 0,
  date_range_start date,
  date_range_end   date,
  status           text    NOT NULL DEFAULT 'processing',
  error_message    text,
  s3_key           text,
  created_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_uploaded_files_user
  ON uploaded_files (user_id, created_at DESC);

-- ── merchant_overrides ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS merchant_overrides (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         text NOT NULL,
  description_key text NOT NULL,
  merchant_name   text,
  category        text,
  is_recurring    boolean,
  is_transfer     boolean,
  created_at      timestamptz DEFAULT now(),
  UNIQUE (user_id, description_key)
);

-- ── user_checkins (may already exist from migration 009) ─────────────────────

CREATE TABLE IF NOT EXISTS user_checkins (
  user_id        text        PRIMARY KEY,
  last_checkin_at timestamptz NOT NULL DEFAULT now()
);

-- ── Add columns to transactions that the app expects ─────────────────────────
-- The original migrations/001 schema is minimal. The app code writes these
-- additional columns (from the old Supabase schema).

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS file_id              uuid;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS date                 date;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS description          text;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS merchant             text;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS direction            text;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS is_recurring         boolean DEFAULT false;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS recurring_confidence text;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS is_transfer          boolean DEFAULT false;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS is_ignored           boolean DEFAULT false;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS account_label        text;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS raw_data             jsonb;

-- ── FK constraints (optional, profiles must exist first) ─────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
     WHERE constraint_name = 'foundation_scores_user_id_fkey'
  ) THEN
    ALTER TABLE foundation_scores
      ADD CONSTRAINT foundation_scores_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
     WHERE constraint_name = 'recommendations_user_id_fkey'
  ) THEN
    ALTER TABLE recommendations
      ADD CONSTRAINT recommendations_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
     WHERE constraint_name = 'uploaded_files_user_id_fkey'
  ) THEN
    ALTER TABLE uploaded_files
      ADD CONSTRAINT uploaded_files_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
     WHERE constraint_name = 'merchant_overrides_user_id_fkey'
  ) THEN
    ALTER TABLE merchant_overrides
      ADD CONSTRAINT merchant_overrides_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
  END IF;
END $$;

COMMIT;
