import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { getSpendingSummary } from '@/lib/db/insights'
import { demoGuard, getDemoSpendingSummary } from '@/lib/demo'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const demo = await demoGuard(userId, getDemoSpendingSummary()); if (demo) return demo
    const { by_category } = await getSpendingSummary(userId)
    return NextResponse.json({ by_category })
  } catch (err) {
    console.error('[/api/spending-summary]', err)
    return NextResponse.json({ error: 'Failed to load spending summary.' }, { status: 500 })
  }
}
