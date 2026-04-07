import { auth }                 from '@clerk/nextjs/server'
import { NextResponse }         from 'next/server'
import { getUserSubscription }  from '@/lib/db/stripe'
import { PAYWALL_ENABLED }      from '@/lib/paywall'
import { isDemoUser }           from '@/lib/demo'
import { queryOne }             from '@/lib/db/client'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const [sub, isDemo, profile] = await Promise.all([
      getUserSubscription(userId),
      isDemoUser(userId),
      queryOne<{ id: string }>('SELECT id FROM profiles WHERE id = $1', [userId]),
    ])

    return NextResponse.json({
      is_pro:          PAYWALL_ENABLED ? (sub?.is_pro ?? false) : true,
      status:          sub?.status ?? 'free',
      paywall_enabled: PAYWALL_ENABLED,
      is_demo:         isDemo,
      has_profile:     !!profile,
    })
  } catch (err) {
    console.error('[/api/stripe/subscription]', err)
    return NextResponse.json({ error: 'Failed to load subscription.' }, { status: 500 })
  }
}
