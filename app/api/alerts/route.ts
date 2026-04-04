import { auth }                from '@clerk/nextjs/server'
import { NextResponse }        from 'next/server'
import { getAlerts }           from '@/lib/db/alerts'
import { getUserSubscription } from '@/lib/db/stripe'
import { canAccess }           from '@/lib/paywall'
import { demoGuard, getDemoAlerts } from '@/lib/demo'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const demo = await demoGuard(userId, getDemoAlerts()); if (demo) return demo

    const sub   = await getUserSubscription(userId)
    const isPro = sub?.is_pro ?? false
    if (!canAccess('alerts', isPro)) {
      return NextResponse.json({ error: 'Pro feature' }, { status: 403 })
    }

    const alerts = await getAlerts(userId)
    return NextResponse.json(alerts)
  } catch (err) {
    console.error('[/api/alerts]', err)
    return NextResponse.json({ error: 'Failed to load alerts.' }, { status: 500 })
  }
}
