import { auth }                from '@clerk/nextjs/server'
import { NextResponse }        from 'next/server'
import { getForecast }         from '@/lib/db/forecast'
import { getUserSubscription } from '@/lib/db/stripe'
import { canAccess }           from '@/lib/paywall'
import { demoGuard, getDemoForecast } from '@/lib/demo'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const demo = await demoGuard(userId, getDemoForecast()); if (demo) return demo

    const sub   = await getUserSubscription(userId)
    const isPro = sub?.is_pro ?? false
    if (!canAccess('forecast', isPro)) {
      return NextResponse.json({ error: 'Pro feature' }, { status: 403 })
    }

    const data = await getForecast(userId)
    return NextResponse.json(data)
  } catch (err) {
    console.error('[/api/forecast]', err)
    return NextResponse.json({ error: 'Failed to load forecast.' }, { status: 500 })
  }
}
