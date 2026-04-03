import { auth }               from '@clerk/nextjs/server'
import { NextResponse }        from 'next/server'
import { supportAggregates }   from '@/app/api/telemetry/route'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const topCategories = Object.entries(supportAggregates.categories)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([category, count]) => ({ category, count }))

  const recentCategoryCount: Record<string, number> = {}
  for (const cat of supportAggregates.recent_categories) {
    recentCategoryCount[cat] = (recentCategoryCount[cat] ?? 0) + 1
  }

  const escalationRate = supportAggregates.chats_started > 0
    ? (supportAggregates.escalations_clicked / supportAggregates.chats_started).toFixed(2)
    : '0.00'

  return NextResponse.json({
    totals: {
      chats_started:       supportAggregates.chats_started,
      messages_sent:       supportAggregates.messages_sent,
      responses_generated: supportAggregates.responses_generated,
      escalations_shown:   supportAggregates.escalations_shown,
      escalations_clicked: supportAggregates.escalations_clicked,
      fallbacks_triggered: supportAggregates.fallbacks_triggered,
    },
    escalation_rate: escalationRate,
    top_categories:          topCategories,
    recent_categories:       recentCategoryCount,
    confidence_distribution: supportAggregates.confidence_levels,
    escalation_triggers:     supportAggregates.escalation_triggers,
    fallback_reasons:        supportAggregates.fallback_reasons,
  })
}
