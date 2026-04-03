import { auth }                 from '@clerk/nextjs/server'
import { NextResponse }         from 'next/server'
import { getUserSubscription }  from '@/lib/db/stripe'
import { PAYWALL_ENABLED }      from '@/lib/paywall'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const sub = await getUserSubscription(userId)
    return NextResponse.json({
      is_pro:          PAYWALL_ENABLED ? (sub?.is_pro ?? false) : true,
      status:          sub?.status ?? 'free',
      paywall_enabled: PAYWALL_ENABLED,
    })
  } catch (err) {
    console.error('[/api/stripe/subscription]', err)
    return NextResponse.json({ error: 'Failed to load subscription.' }, { status: 500 })
  }
}
