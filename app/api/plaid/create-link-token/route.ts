import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { plaidClient } from '@/lib/plaid/client'
import { CountryCode, Products } from 'plaid'

export async function POST() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const response = await plaidClient.linkTokenCreate({
      user:          { client_user_id: userId },
      client_name:   'StratiFi',
      products:      [Products.Transactions],
      country_codes: [CountryCode.Us],
      language:      'en',
    })

    return NextResponse.json({ link_token: response.data.link_token })
  } catch (err: unknown) {
    const plaidErr = err as { response?: { data?: unknown }; message?: string }
    console.error('[/api/plaid/create-link-token]', plaidErr.response?.data ?? plaidErr.message ?? err)
    return NextResponse.json({
      error: 'Failed to create link token.',
      detail: plaidErr.response?.data ?? plaidErr.message ?? 'Unknown error',
    }, { status: 500 })
  }
}
