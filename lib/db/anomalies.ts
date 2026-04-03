import { query } from './client'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UnusualTransaction {
  id:                  string
  transaction_date:    string | null
  normalized_merchant: string
  amount:              number
  merchant_average:    number
  anomaly_ratio:       number
}

// ─── Query ────────────────────────────────────────────────────────────────────

export async function getUnusualTransactions(user_id: string): Promise<UnusualTransaction[]> {
  const rows = await query<{
    id:                  string
    transaction_date:    string | null
    normalized_merchant: string
    amount:              string
    merchant_average:    string
    anomaly_ratio:       string
  }>(
    `WITH merchant_stats AS (
       SELECT
         normalized_merchant,
         AVG(amount)   AS avg_amount,
         COUNT(*)      AS tx_count
       FROM transactions
       WHERE user_id = $1
         AND normalized_merchant IS NOT NULL
         AND amount IS NOT NULL
       GROUP BY normalized_merchant
       HAVING COUNT(*) >= 2
     )
     SELECT
       t.id,
       t.transaction_date,
       t.normalized_merchant,
       ROUND(t.amount::numeric, 2)                           AS amount,
       ROUND(s.avg_amount::numeric, 2)                       AS merchant_average,
       ROUND((t.amount / NULLIF(s.avg_amount, 0))::numeric, 2) AS anomaly_ratio
     FROM transactions t
     JOIN merchant_stats s USING (normalized_merchant)
     WHERE t.user_id = $1
       AND t.amount IS NOT NULL
       AND t.amount > s.avg_amount * 2
     ORDER BY anomaly_ratio DESC`,
    [user_id]
  )

  return rows.map(row => ({
    ...row,
    amount:           Number(row.amount),
    merchant_average: Number(row.merchant_average),
    anomaly_ratio:    Number(row.anomaly_ratio),
  }))
}
