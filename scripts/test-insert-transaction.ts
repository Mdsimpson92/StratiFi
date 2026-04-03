import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(__dirname, '../.env.local') })

import { insertTransaction } from '../lib/db/transactions'
import { pool } from '../lib/db/client'

async function main() {
  const row = await insertTransaction({
    user_id:                   '00000000-0000-0000-0000-000000000001',
    amount:                    12.50,
    raw_merchant:              'SQ * BLUE BOTTLE COFFEE 1234',
    normalized_merchant:       'Blue Bottle Coffee',
    category:                  'food',
    classification_confidence: 0.85,
    classification_reason:     'named pattern match',
  })

  console.log('Inserted row:')
  console.log(JSON.stringify(row, null, 2))
  await pool.end()
}

main().catch(err => {
  console.error('Error:', err.message)
  process.exit(1)
})
