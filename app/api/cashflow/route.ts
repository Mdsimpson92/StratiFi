import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { getCashflow } from '@/lib/db/cashflow'

export async function GET(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { searchParams } = new URL(request.url)
    const start_date = searchParams.get('start_date') ?? undefined
    const end_date   = searchParams.get('end_date')   ?? undefined

    const cashflow = await getCashflow(userId, { start_date, end_date })
    return NextResponse.json(cashflow)
  } catch (err) {
    console.error('[/api/cashflow]', err)
    return NextResponse.json({ error: 'Failed to load cashflow.' }, { status: 500 })
  }
}
