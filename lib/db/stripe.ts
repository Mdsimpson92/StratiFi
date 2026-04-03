import { query, queryOne } from './client'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UserSubscription {
  user_id:            string
  stripe_customer_id: string | null
  stripe_price_id:    string | null
  status:             'free' | 'active' | 'canceled' | 'past_due'
  is_pro:             boolean
  current_period_end: string | null
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function getUserSubscription(user_id: string): Promise<UserSubscription | null> {
  return queryOne<UserSubscription>(
    `SELECT user_id, stripe_customer_id, stripe_price_id, status, is_pro, current_period_end
     FROM user_subscriptions
     WHERE user_id = $1`,
    [user_id]
  )
}

export async function upsertStripeCustomer(user_id: string, stripe_customer_id: string): Promise<void> {
  await query(
    `INSERT INTO user_subscriptions (user_id, stripe_customer_id, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (user_id) DO UPDATE
       SET stripe_customer_id = EXCLUDED.stripe_customer_id,
           updated_at         = now()`,
    [user_id, stripe_customer_id]
  )
}

export async function activateProSubscription(
  stripe_customer_id: string,
  stripe_price_id:    string,
  current_period_end: Date
): Promise<void> {
  await query(
    `UPDATE user_subscriptions
     SET status             = 'active',
         is_pro             = true,
         stripe_price_id    = $2,
         current_period_end = $3,
         updated_at         = now()
     WHERE stripe_customer_id = $1`,
    [stripe_customer_id, stripe_price_id, current_period_end.toISOString()]
  )
}

export async function cancelProSubscription(stripe_customer_id: string): Promise<void> {
  await query(
    `UPDATE user_subscriptions
     SET status     = 'canceled',
         is_pro     = false,
         updated_at = now()
     WHERE stripe_customer_id = $1`,
    [stripe_customer_id]
  )
}

export async function setSubscriptionPastDue(stripe_customer_id: string): Promise<void> {
  await query(
    `UPDATE user_subscriptions
     SET status     = 'past_due',
         is_pro     = false,
         updated_at = now()
     WHERE stripe_customer_id = $1`,
    [stripe_customer_id]
  )
}
