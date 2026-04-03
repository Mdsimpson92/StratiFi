import { query } from './client'

export interface StoredPushSubscription {
  id:       string
  endpoint: string
  keys:     { p256dh: string; auth: string }
}

export async function savePushSubscription(
  user_id: string,
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } }
): Promise<void> {
  await query(
    `INSERT INTO push_subscriptions (user_id, endpoint, keys)
     VALUES ($1, $2, $3)
     ON CONFLICT (endpoint) DO UPDATE
       SET keys = EXCLUDED.keys, user_id = EXCLUDED.user_id`,
    [user_id, subscription.endpoint, subscription.keys]
  )
}

export async function getPushSubscriptions(user_id: string): Promise<StoredPushSubscription[]> {
  return query<StoredPushSubscription>(
    `SELECT id, endpoint, keys FROM push_subscriptions WHERE user_id = $1`,
    [user_id]
  )
}

export async function deletePushSubscription(endpoint: string): Promise<void> {
  await query(
    `DELETE FROM push_subscriptions WHERE endpoint = $1`,
    [endpoint]
  )
}
