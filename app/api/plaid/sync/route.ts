import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { syncTransactionsForUser } from '@/lib/plaid/sync'

export async function POST() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const result = await syncTransactionsForUser(userId)
    return NextResponse.json(result)
  } catch (err) {
    console.error('[/api/plaid/sync]', err)
    return NextResponse.json({ error: 'Sync failed.' }, { status: 500 })
  }
}
