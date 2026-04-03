import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(__dirname, '../.env.local') })

import { createReadStream } from 'fs'
import { parse } from 'csv-parse'
import { insertTransaction } from '../lib/db/transactions'
import { pool } from '../lib/db/client'
import { normalizeMerchantName } from '../lib/classifiers/merchant-normalizer'
import { categorize } from '../lib/classifiers/categorizer'

const CSV_PATH  = process.argv[2] ? resolve(process.argv[2]) : resolve(__dirname, '../sample.csv')
const USER_ID   = 'user_3Bmdppft46zBSlkhNNJw2ESmAMU'

async function ingest() {
  const rows: Record<string, string>[] = await new Promise((resolve, reject) => {
    const results: Record<string, string>[] = []
    createReadStream(CSV_PATH)
      .pipe(parse({ columns: true, skip_empty_lines: true, trim: true }))
      .on('data', (row: Record<string, string>) => results.push(row))
      .on('end', () => resolve(results))
      .on('error', reject)
  })

  console.log(`\nProcessing ${rows.length} rows from ${CSV_PATH}\n`)

  let success = 0
  const failed: { row: Record<string, string>; error: string }[] = []

  for (const row of rows) {
    const amount = Number(row.amount)

    if (isNaN(amount)) {
      failed.push({ row, error: 'Invalid amount' })
      continue
    }

    try {
      const normalized = normalizeMerchantName(row.merchant)
      const result     = categorize({
        date:        row.date     ?? '',
        description: row.merchant,
        merchant:    normalized,
        amount:      Math.abs(amount),
        direction:   amount >= 0 ? 'debit' : 'credit',
        raw:         row as never,
      })

      await insertTransaction({
        user_id:                   USER_ID,
        amount,
        transaction_date:          row.date || undefined,
        raw_merchant:              row.merchant,
        normalized_merchant:       normalized,
        category:                  result.category,
        classification_confidence: result.confidence,
        classification_reason:     result.reason,
      })
      success++
    } catch (err) {
      failed.push({ row, error: (err as Error).message })
    }
  }

  console.log(`✓ Inserted: ${success}`)
  console.log(`✗ Failed:   ${failed.length}`)

  if (failed.length > 0) {
    console.log('\nFailed rows:')
    for (const { row, error } of failed) {
      console.log(`  ${JSON.stringify(row)} → ${error}`)
    }
  }

  await pool.end()
}

ingest().catch(err => {
  console.error('Fatal:', err.message)
  process.exit(1)
})
