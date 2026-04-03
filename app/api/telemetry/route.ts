import { NextResponse } from 'next/server'

/**
 * Telemetry ingest endpoint.
 *
 * Writes to stdout (visible in server logs / log aggregators).
 * Also maintains in-memory aggregates for support events — readable via
 * GET /api/telemetry/support-summary.
 *
 * To route events to an external sink (PostHog, Mixpanel, S3, etc.),
 * replace the console.log line — nothing else changes.
 *
 * Intentionally unauthenticated: telemetry must succeed even if a session
 * token has expired. The payload carries no sensitive financial data.
 */

// ─── In-memory support aggregates ────────────────────────────────────────────
// Resets on process restart. Sufficient for single-instance deployments.
// Replace with a DB-backed table or Redis if you need persistence across restarts.

interface SupportAggregates {
  chats_started:      number
  messages_sent:      number
  responses_generated: number
  fallbacks_triggered: number
  escalations_shown:  number
  escalations_clicked: number

  // Distribution maps — key → count
  categories:          Record<string, number>
  confidence_levels:   Record<string, number>
  escalation_triggers: Record<string, number>
  fallback_reasons:    Record<string, number>

  // Rolling window for "most active" detection — last 100 category events
  recent_categories:  string[]
}

export const supportAggregates: SupportAggregates = {
  chats_started:       0,
  messages_sent:       0,
  responses_generated: 0,
  fallbacks_triggered: 0,
  escalations_shown:   0,
  escalations_clicked: 0,
  categories:          {},
  confidence_levels:   {},
  escalation_triggers: {},
  fallback_reasons:    {},
  recent_categories:   [],
}

const MAX_MAP_KEYS = 500  // prevent unbounded memory growth from crafted events

function inc(map: Record<string, number>, key: string) {
  if (!(key in map) && Object.keys(map).length >= MAX_MAP_KEYS) return
  map[key] = (map[key] ?? 0) + 1
}

function cap(val: unknown, max = 80): string {
  return String(val ?? 'unknown').slice(0, max)
}

function ingestSupportEvent(event: Record<string, unknown>) {
  const name = event.event as string

  switch (name) {
    case 'support_chat_started':
      supportAggregates.chats_started++
      break

    case 'support_message_sent':
      supportAggregates.messages_sent++
      break

    case 'support_response_generated':
      supportAggregates.responses_generated++
      break

    case 'support_issue_category': {
      const cat = cap(event.category)
      inc(supportAggregates.categories, cat)
      // Maintain rolling window (last 100) for recency-weighted reporting
      supportAggregates.recent_categories.push(cat)
      if (supportAggregates.recent_categories.length > 100) {
        supportAggregates.recent_categories.shift()
      }
      break
    }

    case 'support_ai_confidence':
      inc(supportAggregates.confidence_levels, cap(event.confidence))
      break

    case 'support_escalation_shown':
      supportAggregates.escalations_shown++
      inc(supportAggregates.escalation_triggers, cap(event.trigger))
      break

    case 'support_escalation_clicked':
      supportAggregates.escalations_clicked++
      break

    case 'support_fallback_triggered':
      supportAggregates.fallbacks_triggered++
      inc(supportAggregates.fallback_reasons, cap(event.reason))
      break
  }
}

// ─── POST — ingest ────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    // Guard against oversized payloads — telemetry events should be small
    const contentLength = parseInt(request.headers.get('content-length') ?? '0', 10)
    if (contentLength > 4096) {
      return NextResponse.json({ ok: false, reason: 'payload_too_large' }, { status: 413 })
    }

    const event = await request.json() as Record<string, unknown>

    // Minimal shape validation — reject payloads that are clearly wrong
    if (typeof event.event !== 'string' || event.event.length > 100 ||
        typeof event.timestamp !== 'string' || event.timestamp.length > 40) {
      return NextResponse.json({ ok: false, reason: 'invalid_payload' }, { status: 400 })
    }

    // ── Sink: stdout ────────────────────────────────────────────────────────
    // Replace this line to route to any analytics backend.
    console.log('[telemetry]', JSON.stringify(event))
    // ────────────────────────────────────────────────────────────────────────

    // Aggregate support events in memory
    if ((event.event as string).startsWith('support_')) {
      ingestSupportEvent(event)
    }

    return NextResponse.json({ ok: true })
  } catch {
    // Never surface errors to the client — telemetry is non-critical
    return NextResponse.json({ ok: false })
  }
}
