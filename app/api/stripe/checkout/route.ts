import { auth, currentUser }     from '@clerk/nextjs/server'
import { NextResponse }           from 'next/server'
import { stripe }                 from '@/lib/stripe/client'
import { getUserSubscription, upsertStripeCustomer } from '@/lib/db/stripe'

export async function POST(req: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const user = await currentUser()
    const email = user?.emailAddresses?.[0]?.emailAddress

    const body = await req.json().catch(() => ({})) as { plan?: string }
    const priceId = body.plan === 'annual'
      ? process.env.STRIPE_ANNUAL_PRICE_ID!
      : process.env.STRIPE_PRICE_ID!

    if (!priceId) {
      return NextResponse.json({ error: 'Price ID not configured for plan: ' + body.plan }, { status: 500 })
    }

    // Get or create Stripe customer
    let customerId: string
    try {
      const existingSub = await getUserSubscription(userId)
      if (existingSub?.stripe_customer_id) {
        customerId = existingSub.stripe_customer_id
      } else {
        const customer = await stripe.customers.create({
          email: email ?? undefined,
          metadata: { clerk_user_id: userId },
        })
        customerId = customer.id
        await upsertStripeCustomer(userId, customerId)
      }
    } catch (dbErr) {
      const msg = dbErr instanceof Error ? dbErr.message : String(dbErr)
      return NextResponse.json({ error: 'Customer setup failed: ' + msg }, { status: 500 })
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/?upgraded=true`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/`,
      metadata: { clerk_user_id: userId },
    })

    if (!session.url) {
      return NextResponse.json({ error: 'Stripe session created but no URL returned' }, { status: 500 })
    }

    return NextResponse.json({ url: session.url })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: 'Checkout failed: ' + message }, { status: 500 })
  }
}
