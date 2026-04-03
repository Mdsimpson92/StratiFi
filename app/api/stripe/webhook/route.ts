import { NextRequest, NextResponse } from 'next/server'
import { stripe }                    from '@/lib/stripe/client'
import {
  activateProSubscription,
  cancelProSubscription,
  setSubscriptionPastDue,
} from '@/lib/db/stripe'
import type Stripe from 'stripe'

// Required: tell Next.js not to parse the body — Stripe needs the raw bytes
export const config = { api: { bodyParser: false } }

export async function POST(req: NextRequest) {
  const sig     = req.headers.get('stripe-signature')
  const secret  = process.env.STRIPE_WEBHOOK_SECRET

  if (!sig || !secret) {
    return NextResponse.json({ error: 'Missing signature or webhook secret.' }, { status: 400 })
  }

  let event: Stripe.Event

  try {
    const rawBody = await req.text()
    event = stripe.webhooks.constructEvent(rawBody, sig, secret)
  } catch (err) {
    console.error('[webhook] signature verification failed:', err)
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 400 })
  }

  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription
        if (sub.status === 'active') {
          const priceId    = sub.items.data[0]?.price.id ?? ''
          const periodEnd  = new Date((sub as unknown as { current_period_end: number }).current_period_end * 1000)
          await activateProSubscription(sub.customer as string, priceId, periodEnd)
        } else if (sub.status === 'past_due') {
          await setSubscriptionPastDue(sub.customer as string)
        } else if (sub.status === 'canceled') {
          await cancelProSubscription(sub.customer as string)
        }
        break
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription
        await cancelProSubscription(sub.customer as string)
        break
      }

      case 'invoice.payment_failed': {
        const inv = event.data.object as Stripe.Invoice
        if (inv.customer) {
          await setSubscriptionPastDue(inv.customer as string)
        }
        break
      }

      // Ignore all other events
      default:
        break
    }
  } catch (err) {
    console.error('[webhook] handler error:', err)
    return NextResponse.json({ error: 'Webhook handler failed.' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
