import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { plaidClient } from '@/lib/plaid/client'
import { query } from '@/lib/db/client'

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { public_token, institution_name } = await request.json()

    const response = await plaidClient.itemPublicTokenExchange({ public_token })
    const { access_token, item_id } = response.data

    await query(
      `INSERT INTO plaid_items (user_id, access_token, item_id, institution_name)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (item_id) DO UPDATE SET access_token = EXCLUDED.access_token`,
      [userId, access_token, item_id, institution_name ?? null]
    )

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[/api/plaid/exchange-token]', err)
    return NextResponse.json({ error: 'Failed to exchange token.' }, { status: 500 })
  }
}
