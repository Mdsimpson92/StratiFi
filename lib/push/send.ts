import { getWebpush } from './client'
import { getPushSubscriptions, deletePushSubscription } from '../db/push'
import { query } from '../db/client'

interface AlertPayload {
  alert_key: string
  type:      string
  severity:  string
  message:   string
}

// ─── Push sender ──────────────────────────────────────────────────────────────
//
// Called fire-and-forget from notification creation. Sends a push to all
// registered subscriptions for the user, handles expired subscriptions (410),
// and marks the notification_event as delivered.

export async function sendPushForAlerts(
  user_id: string,
  alerts:  AlertPayload[]
): Promise<void> {
  const subscriptions = await getPushSubscriptions(user_id)
  if (subscriptions.length === 0) return

  for (const alert of alerts) {
    const payload = JSON.stringify({
      title:     `StratiFi: ${alert.type.replace(/_/g, ' ')}`,
      message:   alert.message,
      alert_key: alert.alert_key,
      severity:  alert.severity,
    })

    const sendResults = await Promise.allSettled(
      subscriptions.map(sub =>
        getWebpush().sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          payload
        ).catch(async (err: { statusCode?: number }) => {
          // 410 Gone = subscription expired or unsubscribed — remove it
          if (err.statusCode === 410) {
            await deletePushSubscription(sub.endpoint)
          }
          throw err
        })
      )
    )

    const anyDelivered = sendResults.some(r => r.status === 'fulfilled')
    if (anyDelivered) {
      await query(
        `UPDATE notification_events
         SET delivered = true, delivered_at = now()
         WHERE user_id = $1 AND alert_key = $2 AND delivered = false`,
        [user_id, alert.alert_key]
      )
    }
  }
}
