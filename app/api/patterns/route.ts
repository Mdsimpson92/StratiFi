import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { getRecurringTransactions } from '@/lib/db/patterns'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const patterns = await getRecurringTransactions(userId)
    return NextResponse.json({ patterns })
  } catch (err) {
    console.error('[/api/patterns]', err)
    return NextResponse.json({ error: 'Failed to load patterns.' }, { status: 500 })
  }
}
