ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS transaction_date date;
