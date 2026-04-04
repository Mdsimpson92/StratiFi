import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { getRecurringTransactions } from '@/lib/db/patterns'
import { demoGuard, getDemoPatterns } from '@/lib/demo'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const demo = await demoGuard(userId, getDemoPatterns()); if (demo) return demo
    const patterns = await getRecurringTransactions(userId)
    return NextResponse.json({ patterns })
  } catch (err) {
    console.error('[/api/patterns]', err)
    return NextResponse.json({ error: 'Failed to load patterns.' }, { status: 500 })
  }
}
