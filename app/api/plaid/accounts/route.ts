import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { query } from '@/lib/db/client'

interface PlaidItem {
  institution_name: string | null
  created_at:       string
}

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const items = await query<PlaidItem>(
    'SELECT institution_name, created_at FROM plaid_items WHERE user_id = $1 ORDER BY created_at ASC',
    [userId]
  )

  return NextResponse.json({ accounts: items })
}
