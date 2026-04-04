import { auth }                from '@clerk/nextjs/server'
import { NextResponse }        from 'next/server'
import { getAlerts }           from '@/lib/db/alerts'
import { demoGuard, getDemoAlerts } from '@/lib/demo'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const demo = await demoGuard(userId, getDemoAlerts()); if (demo) return demo

    const alerts = await getAlerts(userId)
    return NextResponse.json(alerts)
  } catch (err) {
    console.error('[/api/alerts]', err)
    return NextResponse.json({ error: 'Failed to load alerts.' }, { status: 500 })
  }
}
