import { auth }        from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { queryOne }    from '@/lib/db/client'
import { demoGuard, getDemoScore } from '@/lib/demo'

interface ScoreRow {
  overall_score:        number
  emergency_fund_score: number
  debt_ratio_score:     number
  savings_rate_score:   number
  calculated_at:        string
}

interface PrevScoreRow {
  overall_score: number
}

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const demo = await demoGuard(userId, getDemoScore()); if (demo) return demo

    // Latest score
    const latest = await queryOne<ScoreRow>(
      `SELECT overall_score, emergency_fund_score, debt_ratio_score, savings_rate_score, calculated_at
       FROM foundation_scores WHERE user_id = $1
       ORDER BY calculated_at DESC LIMIT 1`,
      [userId]
    )

    if (!latest) {
      return NextResponse.json({ score: null })
    }

    // Previous score for trend
    const prev = await queryOne<PrevScoreRow>(
      `SELECT overall_score FROM foundation_scores WHERE user_id = $1
       ORDER BY calculated_at DESC LIMIT 1 OFFSET 1`,
      [userId]
    )

    const overall = Number(latest.overall_score)
    const prevOverall = prev ? Number(prev.overall_score) : null
    const trend = prevOverall !== null ? overall - prevOverall : 0

    return NextResponse.json({
      score: {
        overall:              overall,
        emergency_fund_score: Number(latest.emergency_fund_score),
        debt_ratio_score:     Number(latest.debt_ratio_score),
        savings_rate_score:   Number(latest.savings_rate_score),
        label:                scoreLabel(overall),
        trend,
        calculated_at:        latest.calculated_at,
      },
    })
  } catch (err) {
    console.error('[/api/score]', err)
    return NextResponse.json({ error: 'Failed to load score.' }, { status: 500 })
  }
}

function scoreLabel(score: number): string {
  if (score >= 80) return 'Strong'
  if (score >= 65) return 'Good'
  if (score >= 50) return 'Fair'
  if (score >= 35) return 'Weak'
  return 'At Risk'
}
