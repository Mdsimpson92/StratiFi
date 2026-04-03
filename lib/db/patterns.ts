import { query } from './client'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RecurringPattern {
  normalized_merchant:      string
  transaction_count:        number
  average_amount:           number
  last_transaction_date:    string | null
  estimated_frequency_days: number | null
}

// ─── Query ────────────────────────────────────────────────────────────────────

export async function getRecurringTransactions(user_id: string): Promise<RecurringPattern[]> {
  const rows = await query<{
    normalized_merchant:      string
    transaction_count:        string
    average_amount:           string
    last_transaction_date:    string | null
    estimated_frequency_days: string | null
  }>(
    `SELECT
       normalized_merchant,
       COUNT(*)                                                    AS transaction_count,
       ROUND(AVG(amount)::numeric, 2)                             AS average_amount,
       MAX(transaction_date)::text                                AS last_transaction_date,
       ROUND(
         (
           (MAX(transaction_date) - MIN(transaction_date))::numeric
           / NULLIF(COUNT(*) - 1, 0)
         )::numeric,
         1
       )                                                          AS estimated_frequency_days
     FROM transactions
     WHERE user_id = $1
       AND normalized_merchant IS NOT NULL
       AND amount IS NOT NULL
     GROUP BY normalized_merchant
     HAVING COUNT(*) >= 3
     ORDER BY transaction_count DESC, average_amount DESC`,
    [user_id]
  )

  return rows.map(row => ({
    ...row,
    transaction_count:        Number(row.transaction_count),
    average_amount:           Number(row.average_amount),
    estimated_frequency_days: row.estimated_frequency_days !== null
      ? Number(row.estimated_frequency_days)
      : null,
  }))
}
