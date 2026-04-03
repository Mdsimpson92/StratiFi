import { auth }                from '@clerk/nextjs/server'
import { NextResponse }        from 'next/server'
import { getRecommendations }  from '@/lib/db/recommendations'
import { getUserSubscription } from '@/lib/db/stripe'
import { canAccess }           from '@/lib/paywall'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const sub   = await getUserSubscription(userId)
    const isPro = sub?.is_pro ?? false
    if (!canAccess('recommendations', isPro)) {
      return NextResponse.json({ error: 'Pro feature' }, { status: 403 })
    }

    const recommendations = await getRecommendations(userId)
    return NextResponse.json({ recommendations })
  } catch (err) {
    console.error('[/api/recommendations]', err)
    return NextResponse.json({ error: 'Failed to load recommendations.' }, { status: 500 })
  }
}
