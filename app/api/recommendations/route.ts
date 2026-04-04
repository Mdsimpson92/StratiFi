import { auth }                from '@clerk/nextjs/server'
import { NextResponse }        from 'next/server'
import { getRecommendations }  from '@/lib/db/recommendations'
import { getUserSubscription } from '@/lib/db/stripe'
import { canAccess }           from '@/lib/paywall'
import { demoGuard, getDemoRecommendations } from '@/lib/demo'
import { query }               from '@/lib/db/client'
import { queryOne }            from '@/lib/db/client'

interface CapitalPriorityRow {
  priority_rank: number
  category:      string
  title:         string
  description:   string
  action:        string
}

interface ProfileRow {
  id: string
}

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const demo = await demoGuard(userId, getDemoRecommendations()); if (demo) return demo

    const sub   = await getUserSubscription(userId)
    const isPro = sub?.is_pro ?? false
    if (!canAccess('recommendations', isPro)) {
      return NextResponse.json({ error: 'Pro feature' }, { status: 403 })
    }

    // Fetch both recommendation sources in parallel
    const [transactionRecs, capitalRows, profile] = await Promise.all([
      getRecommendations(userId),
      query<CapitalPriorityRow>(
        `SELECT priority_rank, category, title, description, action
         FROM recommendations WHERE user_id = $1
         ORDER BY priority_rank ASC LIMIT 5`,
        [userId]
      ),
      queryOne<ProfileRow>('SELECT id FROM profiles WHERE id = $1', [userId]),
    ])

    // Convert capital priorities to the same Recommendation shape
    const capitalRecs = capitalRows.map(r => ({
      id:               `capital_${r.category}_${r.priority_rank}`,
      type:             `capital_${r.category}` as string,
      priority:         r.priority_rank <= 2 ? 'high' as const : 'medium' as const,
      title:            r.title,
      explanation:      r.description,
      suggested_action: r.action,
      savings_amount:   undefined as number | undefined,
    }))

    // Merge: transaction recs first (real-time signals), then capital priorities
    // Priority order: high > medium > low, then transaction recs before capital
    const PRIORITY_WEIGHT = { high: 0, medium: 1, low: 2 }
    const merged = [...transactionRecs, ...capitalRecs]
      .sort((a, b) => {
        const pa = PRIORITY_WEIGHT[a.priority] ?? 1
        const pb = PRIORITY_WEIGHT[b.priority] ?? 1
        if (pa !== pb) return pa - pb
        // For same priority, prefer transaction recs (actionable now)
        const aIsTransaction = !a.type.startsWith('capital_')
        const bIsTransaction = !b.type.startsWith('capital_')
        if (aIsTransaction !== bIsTransaction) return aIsTransaction ? -1 : 1
        return 0
      })

    // Return top 3
    const recommendations = merged.slice(0, 3)

    return NextResponse.json({ recommendations })
  } catch (err) {
    console.error('[/api/recommendations]', err)
    return NextResponse.json({ error: 'Failed to load recommendations.' }, { status: 500 })
  }
}
