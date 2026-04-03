import { auth }                        from '@clerk/nextjs/server'
import { NextResponse }                  from 'next/server'
import { stripe }                        from '@/lib/stripe/client'
import { getUserSubscription,
         activateProSubscription }       from '@/lib/db/stripe'
import { PAYWALL_ENABLED }               from '@/lib/paywall'

/**
 * POST /api/stripe/sync
 *
 * Re-verifies the user's Stripe subscription status directly against the
 * Stripe API and patches the local DB if the subscription is active but
 * not reflected (e.g. webhook missed or delayed).
 *
 * Returns: { is_pro, synced, paywall_enabled }
 *   synced: true  → DB was updated (user was granted Pro access)
 *   synced: false → no change needed, or no active subscription found
 */
export async function POST(): Promise<Response> {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const sub = await getUserSubscription(userId)
    const paywall_enabled = PAYWALL_ENABLED

    // Already Pro in DB — nothing to do
    if (sub?.is_pro) {
      return NextResponse.json({ is_pro: true, synced: false, paywall_enabled })
    }

    // No Stripe customer on record — can't verify
    if (!sub?.stripe_customer_id) {
      return NextResponse.json({ is_pro: false, synced: false, paywall_enabled })
    }

    // Ask Stripe directly for any active subscriptions on this customer
    const subscriptions = await stripe.subscriptions.list({
      customer: sub.stripe_customer_id,
      status:   'active',
      limit:    5,
    })

    const activeSub = subscriptions.data[0]
    if (!activeSub) {
      return NextResponse.json({ is_pro: false, synced: false, paywall_enabled })
    }

    // Active subscription found in Stripe but not reflected in DB — sync it.
    // Use cancel_at if set; otherwise a safe far-future sentinel — the webhook
    // will update the exact period end when it next fires.
    const priceId   = activeSub.items.data[0]?.price?.id ?? ''
    const periodEnd = activeSub.cancel_at
      ? new Date(activeSub.cancel_at * 1000)
      : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)

    await activateProSubscription(sub.stripe_customer_id, priceId, periodEnd)
    console.log('[stripe/sync] activated pro for', userId, 'sub', activeSub.id)

    return NextResponse.json({ is_pro: true, synced: true, paywall_enabled })
  } catch (err) {
    console.error('[stripe/sync]', err)
    return NextResponse.json({ error: 'Subscription sync failed.' }, { status: 500 })
  }
}
