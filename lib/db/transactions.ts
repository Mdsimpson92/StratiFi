import { query } from './client'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TransactionInput {
  user_id:                    string
  amount:                     number
  transaction_date?:          string   // ISO date string: 'YYYY-MM-DD'
  raw_merchant?:              string
  normalized_merchant?:       string
  category?:                  string
  classification_confidence?: number
  classification_reason?:     string
}

export interface TransactionRecord extends TransactionInput {
  id:         string
  created_at: Date
}

// ─── Insert ───────────────────────────────────────────────────────────────────

export async function insertTransaction(input: TransactionInput): Promise<TransactionRecord> {
  if (!input.user_id) throw new Error('user_id is required')
  if (typeof input.amount !== 'number' || isNaN(input.amount)) throw new Error('amount must be a valid number')

  if (
    input.classification_confidence !== undefined &&
    (input.classification_confidence < 0 || input.classification_confidence > 1)
  ) {
    throw new Error('classification_confidence must be between 0 and 1')
  }

  const normalizedMerchant = input.normalized_merchant != null
    ? input.normalized_merchant.trim().toLowerCase()
    : null

  const rows = await query<TransactionRecord>(
    `INSERT INTO transactions
       (user_id, amount, transaction_date, raw_merchant, normalized_merchant, category, classification_confidence, classification_reason)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      input.user_id,
      input.amount,
      input.transaction_date          ?? null,
      input.raw_merchant              ?? null,
      normalizedMerchant,
      input.category                  ?? null,
      input.classification_confidence ?? null,
      input.classification_reason     ?? null,
    ]
  )

  const row = rows[0]
  return {
    ...row,
    amount:                    Number(row.amount),
    classification_confidence: row.classification_confidence != null
      ? Number(row.classification_confidence)
      : undefined,
  }
}
