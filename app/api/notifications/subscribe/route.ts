import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { savePushSubscription } from '@/lib/db/push'

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json() as {
    endpoint?: string
    keys?: { p256dh?: string; auth?: string }
  }

  if (
    !body.endpoint     || typeof body.endpoint !== 'string' ||
    !body.keys?.p256dh || typeof body.keys.p256dh !== 'string' ||
    !body.keys?.auth   || typeof body.keys.auth   !== 'string'
  ) {
    return NextResponse.json({ error: 'Invalid subscription object.' }, { status: 400 })
  }

  try {
    await savePushSubscription(userId, {
      endpoint: body.endpoint,
      keys:     { p256dh: body.keys.p256dh, auth: body.keys.auth },
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[/api/notifications/subscribe]', err)
    return NextResponse.json({ error: 'Failed to save subscription.' }, { status: 500 })
  }
}
