/**
 * Run a SQL migration file against the database using the project's pg pool.
 *
 * Usage:  npx tsx scripts/run-migration.ts migrations/010_standardize_user_ids.sql
 */

import { config } from 'dotenv'
config({ path: '.env.local' })
import { readFileSync } from 'fs'
import { Pool } from 'pg'

const file = process.argv[2]
if (!file) {
  console.error('Usage: npx tsx scripts/run-migration.ts <path-to-sql>')
  process.exit(1)
}

const sql = readFileSync(file, 'utf-8')

// Support DATABASE_URL (Neon/cloud) or individual DB_* vars (local dev)
const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
  : new Pool({
      host:     process.env.DB_HOST,
      port:     Number(process.env.DB_PORT ?? 5432),
      database: process.env.DB_NAME,
      user:     process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      ssl:      process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false },
    })

async function run() {
  console.log(`\n── Running: ${file} ──\n`)
  try {
    const result = await pool.query(sql)
    // pg returns an array of results for multi-statement queries
    const results = Array.isArray(result) ? result : [result]
    for (const r of results) {
      if (r.rows && r.rows.length > 0) {
        console.table(r.rows)
      }
      if (r.command) {
        console.log(`  ${r.command}${r.rowCount != null ? ` (${r.rowCount} rows)` : ''}`)
      }
    }
    console.log(`\n── Done: ${file} ──\n`)
  } catch (err) {
    console.error(`\n── FAILED: ${file} ──\n`)
    console.error((err as Error).message)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

run()
