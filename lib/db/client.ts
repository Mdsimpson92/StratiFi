import { Pool, QueryResultRow } from 'pg'

// ─── Connection Pool ──────────────────────────────────────────────────────────
//
// A single Pool instance is reused across requests (module-level singleton).
// Next.js hot-reload in dev can create multiple module instances, so we attach
// the pool to globalThis to prevent exhausting connections.

declare global {
  // eslint-disable-next-line no-var
  var _pgPool: Pool | undefined
}

function createPool(): Pool {
  // Prefer DATABASE_URL (Neon/cloud) — falls back to individual DB_* vars (local dev)
  if (process.env.DATABASE_URL) {
    return new Pool({
      connectionString:       process.env.DATABASE_URL,
      ssl:                    { rejectUnauthorized: false },
      max:                    10,
      idleTimeoutMillis:      30_000,
      connectionTimeoutMillis: 5_000,
    })
  }

  return new Pool({
    host:     process.env.DB_HOST,
    port:     Number(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME,
    user:     process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl:      process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false },
    max:      10,
    idleTimeoutMillis:      30_000,
    connectionTimeoutMillis: 5_000,
  })
}

function getPool(): Pool {
  if (process.env.NODE_ENV === 'production') {
    return (globalThis._pgPool ??= createPool())
  }
  return (globalThis._pgPool ??= createPool())
}

// ─── Query Helper ─────────────────────────────────────────────────────────────

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const result = await getPool().query<T>(text, params)
  return result.rows
}

// ─── Single-row convenience ───────────────────────────────────────────────────

export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<T | null> {
  const rows = await query<T>(text, params)
  return rows[0] ?? null
}

export const pool = { end: () => getPool().end() }
