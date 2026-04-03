import { auth }                   from '@clerk/nextjs/server'
import { NextResponse }            from 'next/server'
import { deletePushSubscription }  from '@/lib/db/push'

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json() as { endpoint?: string }
  if (!body.endpoint || typeof body.endpoint !== 'string') {
    return NextResponse.json({ error: 'Missing endpoint.' }, { status: 400 })
  }

  try {
    await deletePushSubscription(body.endpoint)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[/api/notifications/unsubscribe]', err)
    return NextResponse.json({ error: 'Failed to remove subscription.' }, { status: 500 })
  }
}
