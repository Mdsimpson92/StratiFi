import { auth, currentUser }     from '@clerk/nextjs/server'
import { NextResponse }           from 'next/server'
import { stripe }                 from '@/lib/stripe/client'
import { getUserSubscription, upsertStripeCustomer } from '@/lib/db/stripe'

export async function POST(req: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await currentUser()
  const email = user?.emailAddresses?.[0]?.emailAddress

  // Resolve price ID from plan selection — default to monthly if not specified
  const body = await req.json().catch(() => ({})) as { plan?: string }
  const priceId = body.plan === 'annual'
    ? process.env.STRIPE_ANNUAL_PRICE_ID!
    : process.env.STRIPE_PRICE_ID!

  if (!priceId) {
    console.error('[/api/stripe/checkout] price ID env var not set for plan:', body.plan)
    return NextResponse.json({ error: 'Checkout not configured.' }, { status: 500 })
  }

  try {
    // Use existing customer mapping from DB if available; otherwise look up / create in Stripe
    let customerId: string

    const existingSub = await getUserSubscription(userId)
    if (existingSub?.stripe_customer_id) {
      customerId = existingSub.stripe_customer_id
    } else {
      // Always create a fresh Stripe customer for this user.
      // Avoid email-based lookup — it can return a customer already
      // mapped to a different user_id, violating the unique constraint.
      const customer = await stripe.customers.create({
        email:    email ?? undefined,
        metadata: { clerk_user_id: userId },
      })
      customerId = customer.id
      await upsertStripeCustomer(userId, customerId)
    }

    // Create a Checkout session for the selected plan
    const session = await stripe.checkout.sessions.create({
      customer:             customerId,
      mode:                 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price:    priceId,
          quantity: 1,
        },
      ],
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/?upgraded=true`,
      cancel_url:  `${process.env.NEXT_PUBLIC_APP_URL}/`,
      metadata:    { clerk_user_id: userId },
    })

    if (!session.url) {
      console.error('[/api/stripe/checkout] session created but url is missing — check Stripe account configuration', { sessionId: session.id, status: session.status })
      return NextResponse.json({ error: 'Checkout session created but no redirect URL returned. Check Stripe account setup.' }, { status: 500 })
    }

    return NextResponse.json({ url: session.url })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[/api/stripe/checkout]', message)
    return NextResponse.json({ error: `Checkout failed: ${message}` }, { status: 500 })
  }
}
