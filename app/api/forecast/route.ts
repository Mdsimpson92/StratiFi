import { auth }                from '@clerk/nextjs/server'
import { NextResponse }        from 'next/server'
import { getForecast }         from '@/lib/db/forecast'
import { demoGuard, getDemoForecast } from '@/lib/demo'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const demo = await demoGuard(userId, getDemoForecast()); if (demo) return demo

    const data = await getForecast(userId)
    return NextResponse.json(data)
  } catch (err) {
    console.error('[/api/forecast]', err)
    return NextResponse.json({ error: 'Failed to load forecast.' }, { status: 500 })
  }
}
