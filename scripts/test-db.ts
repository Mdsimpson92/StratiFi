import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(__dirname, '../.env.local') })

import { query, pool } from '../lib/db/client'

async function main() {
  try {
    console.log('Connecting to database...')
    const rows = await query<{ now: string; version: string }>(
      "SELECT NOW() AS now, version() AS version"
    )
    console.log('✓ Connected')
    console.log('  Time:   ', rows[0].now)
    console.log('  Version:', rows[0].version.split(',')[0])
  } catch (err) {
    const e = err as NodeJS.ErrnoException
    console.error('✗ Connection failed:', e.message || '(no message)')
    if (e.code)  console.error('  Code:   ', e.code)
    console.error('  Host:   ', process.env.DB_HOST ?? '(not set)')
    console.error('  DB:     ', process.env.DB_NAME ?? '(not set)')
    console.error('  User:   ', process.env.DB_USER ?? '(not set)')
    process.exit(1)
  } finally {
    await pool.end()
  }
}

main()
