import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(__dirname, '../.env.local') })

import { getInsights } from '../lib/db/insights'
import { pool } from '../lib/db/client'

const USER_ID = '00000000-0000-0000-0000-000000000001'

async function main() {
  const insights = await getInsights(USER_ID)

  if (insights.length === 0) {
    console.log('No insights generated — not enough data yet.')
  } else {
    console.log(`\n${insights.length} insight(s):\n`)
    insights.forEach((msg, i) => console.log(`  ${i + 1}. ${msg}`))
  }

  await pool.end()
}

main().catch(err => {
  console.error('Error:', err.message)
  process.exit(1)
})
