import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { getInsights } from '@/lib/db/insights'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const insights = await getInsights(userId)
    return NextResponse.json({ insights })
  } catch (err) {
    console.error('[/api/insights]', err)
    return NextResponse.json({ error: 'Failed to load insights.' }, { status: 500 })
  }
}
