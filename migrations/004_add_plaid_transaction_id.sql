ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS plaid_transaction_id text UNIQUE;
