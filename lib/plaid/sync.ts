import { plaidClient } from './client'
import { query } from '@/lib/db/client'
import { normalizeMerchantName } from '@/lib/classifiers/merchant-normalizer'
import { categorize } from '@/lib/classifiers/categorizer'

interface PlaidItem {
  id:           string
  access_token: string
  item_id:      string
  cursor:       string | null
}

export async function syncTransactionsForUser(
  userId: string
): Promise<{ added: number; errors: number }> {
  const items = await query<PlaidItem>(
    'SELECT id, access_token, item_id, cursor FROM plaid_items WHERE user_id = $1',
    [userId]
  )

  let totalAdded  = 0
  let totalErrors = 0

  for (const item of items) {
    let cursor:  string | undefined = item.cursor ?? undefined
    let hasMore: boolean            = true

    while (hasMore) {
      const response = await plaidClient.transactionsSync({
        access_token: item.access_token,
        ...(cursor ? { cursor } : {}),
      })

      const { added, next_cursor, has_more } = response.data

      for (const tx of added) {
        // Skip pending transactions — they may not settle
        if (tx.pending) continue

        try {
          const rawMerchant  = tx.merchant_name ?? tx.name
          const normalized   = normalizeMerchantName(rawMerchant)
          const result       = categorize({
            date:        tx.date,
            description: tx.name,
            merchant:    normalized,
            amount:      Math.abs(tx.amount),
            // Plaid: amount > 0 = debit (expense), amount < 0 = credit (income)
            // Our DB convention matches: positive = expense, negative = income
            direction:   tx.amount > 0 ? 'debit' : 'credit',
            raw:         tx as never,
          })

          await query(
            `INSERT INTO transactions
               (user_id, amount, transaction_date, raw_merchant, normalized_merchant,
                category, classification_confidence, classification_reason, plaid_transaction_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             ON CONFLICT (plaid_transaction_id) DO NOTHING`,
            [
              userId,
              tx.amount,
              tx.date,
              tx.name,
              normalized,
              result.category,
              result.confidence,
              result.reason,
              tx.transaction_id,
            ]
          )
          totalAdded++
        } catch (err) {
          console.error('[plaid/sync] failed to insert tx:', tx.transaction_id, err)
          totalErrors++
        }
      }

      cursor  = next_cursor
      hasMore = has_more

      // Persist cursor after each page so we can resume on failure
      await query(
        'UPDATE plaid_items SET cursor = $1 WHERE id = $2',
        [next_cursor, item.id]
      )
    }
  }

  return { added: totalAdded, errors: totalErrors }
}
