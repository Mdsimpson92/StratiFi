import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { getUnusualTransactions } from '@/lib/db/anomalies'
import { demoGuard, getDemoAnomalies } from '@/lib/demo'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const demo = await demoGuard(userId, getDemoAnomalies()); if (demo) return demo
    const anomalies = await getUnusualTransactions(userId)
    return NextResponse.json({ anomalies })
  } catch (err) {
    console.error('[/api/anomalies]', err)
    return NextResponse.json({ error: 'Failed to load anomalies.' }, { status: 500 })
  }
}
