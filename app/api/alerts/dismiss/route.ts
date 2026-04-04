import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { dismissAlert } from '@/lib/db/alerts'
import { isDemoUser } from '@/lib/demo'

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (await isDemoUser(userId)) return NextResponse.json({ ok: true })

  const { alert_key } = await request.json() as { alert_key?: string }
  if (!alert_key || typeof alert_key !== 'string') {
    return NextResponse.json({ error: 'alert_key required' }, { status: 400 })
  }

  try {
    await dismissAlert(userId, alert_key)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[/api/alerts/dismiss]', err)
    return NextResponse.json({ error: 'Failed to dismiss alert.' }, { status: 500 })
  }
}
