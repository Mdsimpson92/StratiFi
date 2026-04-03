import { query } from './client'
import { sendPushForAlerts } from '../push/send'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NotificationEvent {
  id:           string
  alert_key:    string
  event_type:   string
  payload:      { message: string; severity: string }
  delivered:    boolean
  delivered_at: string | null
  created_at:   string
}

// ─── Dedup + create ───────────────────────────────────────────────────────────
//
// For each alert, insert a notification_event only if there is no existing
// undelivered event for that (user_id, alert_key) pair. This ensures exactly
// one pending event per active alert across repeated getAlerts() calls.
// When an alert is dismissed and later re-fires, a new event will be created
// because the old one will have been delivered (or the alert_key was cleared).

export async function createPendingNotifications(
  user_id: string,
  alerts: { alert_key: string; type: string; message: string; severity: string }[]
): Promise<void> {
  if (alerts.length === 0) return

  const alert_keys = alerts.map(a => a.alert_key)

  // Find which keys already have an undelivered event
  const existing = await query<{ alert_key: string }>(
    `SELECT DISTINCT alert_key
     FROM notification_events
     WHERE user_id = $1 AND alert_key = ANY($2) AND delivered = false`,
    [user_id, alert_keys]
  )
  const existingSet = new Set(existing.map(r => r.alert_key))

  const newAlerts = alerts.filter(a => !existingSet.has(a.alert_key))
  if (newAlerts.length === 0) return

  // Bulk insert — one row per new alert
  for (const a of newAlerts) {
    await query(
      `INSERT INTO notification_events (user_id, alert_key, event_type, payload)
       VALUES ($1, $2, $3, $4)`,
      [user_id, a.alert_key, a.type, { message: a.message, severity: a.severity }]
    )
  }

  // Fire push for high-severity new alerts — don't await, doesn't block alert response
  const highSeverity = newAlerts.filter(a => a.severity === 'high')
  if (highSeverity.length > 0) {
    sendPushForAlerts(user_id, highSeverity).catch(err =>
      console.error('[push] Failed to send push notifications:', err)
    )
  }
}

// ─── Fetch states for alert merge ─────────────────────────────────────────────
//
// Returns the most recent notification_event per alert_key so that
// getAlerts() can attach triggered_at and sent to each Alert.

export async function fetchNotificationStates(
  user_id: string,
  alert_keys: string[]
): Promise<Map<string, { triggered_at: string; sent: boolean }>> {
  if (alert_keys.length === 0) return new Map()

  const rows = await query<{
    alert_key:    string
    created_at:   string
    delivered:    boolean
  }>(
    `SELECT DISTINCT ON (alert_key)
       alert_key, created_at, delivered
     FROM notification_events
     WHERE user_id = $1 AND alert_key = ANY($2)
     ORDER BY alert_key, created_at DESC`,
    [user_id, alert_keys]
  )

  return new Map(rows.map(r => [
    r.alert_key,
    { triggered_at: r.created_at, sent: r.delivered },
  ]))
}

// ─── GET /api/notifications ───────────────────────────────────────────────────

export async function getNotifications(user_id: string, limit = 50): Promise<NotificationEvent[]> {
  const rows = await query<{
    id:           string
    alert_key:    string
    event_type:   string
    payload:      { message: string; severity: string }
    delivered:    boolean
    delivered_at: string | null
    created_at:   string
  }>(
    `SELECT id, alert_key, event_type, payload, delivered, delivered_at::text, created_at::text
     FROM notification_events
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [user_id, limit]
  )

  return rows
}
