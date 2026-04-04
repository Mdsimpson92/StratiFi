import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { getSubscriptions } from '@/lib/db/subscriptions'
import { demoGuard, getDemoSubscriptions } from '@/lib/demo'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const demo = await demoGuard(userId, getDemoSubscriptions()); if (demo) return demo
    const data = await getSubscriptions(userId)
    return NextResponse.json(data)
  } catch (err) {
    console.error('[/api/subscriptions]', err)
    return NextResponse.json({ error: 'Failed to load subscriptions.' }, { status: 500 })
  }
}
