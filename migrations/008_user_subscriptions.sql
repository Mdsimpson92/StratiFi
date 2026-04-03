CREATE TABLE IF NOT EXISTS user_subscriptions (
  user_id            text        PRIMARY KEY,
  stripe_customer_id text        UNIQUE,
  stripe_price_id    text,
  status             text        NOT NULL DEFAULT 'free',
  -- 'free' | 'active' | 'canceled' | 'past_due'
  is_pro             boolean     NOT NULL DEFAULT false,
  current_period_end timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
