'use server'

import { query }                     from '@/lib/db/client'
import { computeFoundationScore }    from '@/lib/engines/foundation-score'
import { computeCapitalPriorities }  from '@/lib/engines/capital-priority'
import type { ProfileData }          from '@/lib/schemas/profile'

/**
 * Runs both engines against the given profile, then writes results to:
 *   - foundation_scores (insert — keeps history)
 *   - recommendations   (delete + reinsert — always reflects latest)
 */
export async function computeAndSaveScores(userId: string, profile: ProfileData) {
  const scores          = computeFoundationScore(profile)
  const recommendations = computeCapitalPriorities(profile, scores)

  // Insert new score row (historical record)
  try {
    await query(
      `INSERT INTO foundation_scores (user_id, emergency_fund_score, debt_ratio_score, savings_rate_score, overall_score)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, scores.emergency_fund_score, scores.debt_ratio_score, scores.savings_rate_score, scores.overall_score]
    )
  } catch (err) {
    console.error('[score] Failed to save foundation scores:', (err as Error).message)
  }

  // Replace recommendations
  await query(`DELETE FROM recommendations WHERE user_id = $1`, [userId])

  if (recommendations.length > 0) {
    try {
      const cols   = ['user_id', 'priority_rank', 'category', 'title', 'description', 'action']
      const values: unknown[] = []
      const groups: string[]  = []

      for (const r of recommendations) {
        const offset = values.length
        groups.push(`($${offset+1}, $${offset+2}, $${offset+3}, $${offset+4}, $${offset+5}, $${offset+6})`)
        values.push(userId, r.priority_rank, r.category, r.title, r.description, r.action)
      }

      await query(
        `INSERT INTO recommendations (${cols.join(', ')}) VALUES ${groups.join(', ')}`,
        values
      )
    } catch (err) {
      console.error('[score] Failed to save recommendations:', (err as Error).message)
    }
  }

  return { scores, recommendations }
}
