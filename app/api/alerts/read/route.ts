import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { markAlertRead } from '@/lib/db/alerts'

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { alert_key } = await request.json()
  if (!alert_key || typeof alert_key !== 'string') {
    return NextResponse.json({ error: 'alert_key required' }, { status: 400 })
  }

  try {
    await markAlertRead(userId, alert_key)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[/api/alerts/read]', err)
    return NextResponse.json({ error: 'Failed to mark alert as read.' }, { status: 500 })
  }
}
