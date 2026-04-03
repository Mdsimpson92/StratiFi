import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(__dirname, '../.env.local') })

import { query, pool } from '../lib/db/client'
import { normalizeMerchantName } from '../lib/classifiers/merchant-normalizer'
import { categorize } from '../lib/classifiers/categorizer'

const BATCH_SIZE = 500

interface RawTx {
  id:          string
  raw_merchant: string | null
  amount:      string
}

async function backfill() {
  let offset      = 0
  let totalUpdated = 0

  console.log('\nStarting classification backfill…\n')

  while (true) {
    // ── Fetch batch ──────────────────────────────────────────────────────────
    const rows = await query<RawTx>(
      `SELECT id, raw_merchant, amount
       FROM transactions
       WHERE category = 'uncategorized'
         AND raw_merchant IS NOT NULL
       ORDER BY id
       LIMIT $1 OFFSET $2`,
      [BATCH_SIZE, offset]
    )

    if (rows.length === 0) break

    // ── Classify each row ────────────────────────────────────────────────────
    const updates = rows.map(row => {
      const normalized = normalizeMerchantName(row.raw_merchant!)
      const amount     = Number(row.amount)
      const result     = categorize({
        date:        '',
        description: row.raw_merchant!,
        merchant:    normalized,
        amount:      Math.abs(amount),
        direction:   amount >= 0 ? 'debit' : 'credit',
        raw:         row as never,
      })

      return {
        id:                       row.id,
        normalized_merchant:      normalized,
        category:                 result.category,
        classification_confidence: result.confidence,
        classification_reason:    result.reason,
      }
    })

    // ── Bulk UPDATE using unnest ─────────────────────────────────────────────
    const ids            = updates.map(u => u.id)
    const merchants      = updates.map(u => u.normalized_merchant)
    const categories     = updates.map(u => u.category)
    const confidences    = updates.map(u => u.classification_confidence)
    const reasons        = updates.map(u => u.classification_reason)

    await query(
      `UPDATE transactions AS t
       SET
         normalized_merchant       = v.normalized_merchant,
         category                  = v.category,
         classification_confidence = v.confidence::numeric,
         classification_reason     = v.reason
       FROM (
         SELECT
           UNNEST($1::uuid[])    AS id,
           UNNEST($2::text[])    AS normalized_merchant,
           UNNEST($3::text[])    AS category,
           UNNEST($4::text[])    AS confidence,
           UNNEST($5::text[])    AS reason
       ) AS v
       WHERE t.id = v.id`,
      [ids, merchants, categories, confidences.map(String), reasons]
    )

    totalUpdated += rows.length
    console.log(`  Processed ${totalUpdated} rows…`)

    if (rows.length < BATCH_SIZE) break
    offset += BATCH_SIZE
  }

  // ── Sample output ────────────────────────────────────────────────────────────
  const sample = await query<{
    raw_merchant:             string
    normalized_merchant:      string
    category:                 string
    classification_confidence: string
  }>(
    `SELECT raw_merchant, normalized_merchant, category, classification_confidence
     FROM transactions
     WHERE category != 'uncategorized'
     ORDER BY created_at DESC
     LIMIT 10`
  )

  console.log(`\n✓ Total updated: ${totalUpdated}`)
  console.log('\nSample of classified rows:')
  console.table(sample.map(r => ({
    merchant:    r.raw_merchant,
    normalized:  r.normalized_merchant,
    category:    r.category,
    confidence:  Number(r.classification_confidence),
  })))

  await pool.end()
}

backfill().catch(err => {
  console.error('Fatal:', err.message)
  process.exit(1)
})
