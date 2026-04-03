import { query, queryOne } from './client'

export async function getLastCheckinAt(user_id: string): Promise<Date | null> {
  const row = await queryOne<{ last_checkin_at: string }>(
    `SELECT last_checkin_at::text FROM user_checkins WHERE user_id = $1`,
    [user_id]
  )
  return row ? new Date(row.last_checkin_at) : null
}

export async function recordCheckin(user_id: string): Promise<void> {
  await query(
    `INSERT INTO user_checkins (user_id, last_checkin_at)
     VALUES ($1, now())
     ON CONFLICT (user_id) DO UPDATE SET last_checkin_at = now()`,
    [user_id]
  )
}
