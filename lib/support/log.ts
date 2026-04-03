import { query } from '@/lib/db/client'

// ─── Types ────────────────────────────────────────────────────────────────────

export type ResponseSource     = 'billing_policy' | 'kb' | 'ai' | 'fallback' | 'escalation'
export type EscalationOutcome  = 'email_sent' | 'email_failed' | 'rate_limited' | null

export interface SupportInteraction {
  userId:              string
  userMessage:         string
  aiResponse:          string
  category:            string | null
  confidence:          string | null
  escalated:           boolean
  responseSource:      ResponseSource
  escalationOutcome?:  EscalationOutcome
}

// ─── Write ────────────────────────────────────────────────────────────────────

/**
 * Persist a support interaction to the database.
 *
 * Fire-and-forget safe — callers should use:
 *   logInteraction(entry).catch(() => {})
 * so logging never blocks the response.
 *
 * Content is capped to prevent unbounded storage:
 *   user_message: 500 chars
 *   ai_response:  800 chars
 */
export async function logInteraction(entry: SupportInteraction): Promise<void> {
  try {
    await query(
      `INSERT INTO support_interactions
         (user_id, user_message, ai_response, category, confidence,
          escalated, response_source, escalation_outcome)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        entry.userId,
        entry.userMessage.slice(0, 500),
        entry.aiResponse.slice(0, 800),
        entry.category,
        entry.confidence,
        entry.escalated,
        entry.responseSource,
        entry.escalationOutcome ?? null,
      ]
    )
  } catch (err) {
    // Logging failure is non-critical — never crash the request
    console.error('[support/log] failed to persist interaction:', (err as Error).message)
  }
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export interface StoredInteraction {
  id:                  string
  user_id:             string
  created_at:          string
  user_message:        string
  ai_response:         string
  category:            string | null
  confidence:          string | null
  escalated:           boolean
  response_source:     string
  escalation_outcome:  string | null
}

/**
 * Fetch support interactions for a user from the database.
 */
export async function getInteractions(
  userId: string,
  opts: { escalatedOnly?: boolean; limit?: number } = {}
): Promise<StoredInteraction[]> {
  const limit    = Math.min(opts.limit ?? 100, 500)
  const where    = opts.escalatedOnly
    ? 'WHERE user_id = $1 AND escalated = true'
    : 'WHERE user_id = $1'

  return query<StoredInteraction>(
    `SELECT id, user_id, created_at::text, user_message, ai_response,
            category, confidence, escalated, response_source, escalation_outcome
     FROM support_interactions
     ${where}
     ORDER BY created_at DESC
     LIMIT $2`,
    [userId, limit]
  )
}
