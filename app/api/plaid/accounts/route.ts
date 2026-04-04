import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { query } from '@/lib/db/client'
import { demoGuard, getDemoPlaidAccounts } from '@/lib/demo'

interface PlaidItem {
  institution_name: string | null
  created_at:       string
}

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const demo = await demoGuard(userId, getDemoPlaidAccounts()); if (demo) return demo

    const items = await query<PlaidItem>(
      'SELECT institution_name, created_at FROM plaid_items WHERE user_id = $1 ORDER BY created_at ASC',
      [userId]
    )

    return NextResponse.json({ accounts: items })
  } catch (err) {
    console.error('[/api/plaid/accounts]', err)
    return NextResponse.json({ error: 'Failed to load accounts.' }, { status: 500 })
  }
}
