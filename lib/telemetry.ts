/**
 * Minimal conversion telemetry abstraction.
 *
 * All events flow through `track()`. To swap the sink (PostHog, Mixpanel,
 * a DB table, S3, etc.) replace the two lines inside `dispatch()` — every
 * call-site stays the same.
 *
 * Fire-and-forget: telemetry is never in the critical path and never throws.
 */

// ─── Schema ───────────────────────────────────────────────────────────────────

export type UserPlan = 'free' | 'pro'

export interface TelemetryEvent {
  event:            string
  timestamp:        string        // ISO 8601, UTC
  user_plan:        UserPlan
  paywall_enabled:  boolean
  source_surface?:  string        // which UI surface triggered the event
  prompt_type?:     string        // which prompt variant (contextual, end_recs, …)
  [key: string]:    unknown       // allow arbitrary extra context per event
}

// ─── Named events ─────────────────────────────────────────────────────────────

export const EVENTS = {
  // ── Upgrade / paywall ──────────────────────────────────────────────────────
  UPGRADE_CARD_VIEWED:            'upgrade_card_viewed',
  UPGRADE_CTA_CLICKED:            'upgrade_cta_clicked',
  LOCKED_FEATURE_INTERACTED:      'locked_feature_interacted',
  BLOCKED_NOTIFICATION_ATTEMPT:   'blocked_notification_attempt',
  RECOMMENDATIONS_TEASER_VIEWED:  'recommendations_teaser_viewed',
  POST_CHECKOUT_RETURNED:         'post_checkout_returned',
  PRO_STATE_CONFIRMED:            'pro_state_confirmed',

  // ── Support ────────────────────────────────────────────────────────────────
  // Fired when the support panel is opened for the first time in a session.
  SUPPORT_CHAT_STARTED:           'support_chat_started',
  // Fired each time the user sends a message.
  SUPPORT_MESSAGE_SENT:           'support_message_sent',
  // Fired after each successful AI response.
  SUPPORT_RESPONSE_GENERATED:     'support_response_generated',
  // Fired when the escalation button becomes visible (once per session).
  SUPPORT_ESCALATION_SHOWN:       'support_escalation_shown',
  // Fired when the user clicks "Contact Support".
  SUPPORT_ESCALATION_CLICKED:     'support_escalation_clicked',
  // Fired per AI response — used to aggregate top issue categories.
  SUPPORT_ISSUE_CATEGORY:         'support_issue_category',
  // Fired per AI response — used to track answer quality distribution.
  SUPPORT_AI_CONFIDENCE:          'support_ai_confidence',
  // Fired when the AI is unavailable or returns an unusable response.
  SUPPORT_FALLBACK_TRIGGERED:     'support_fallback_triggered',
} as const

// ─── Public API ───────────────────────────────────────────────────────────────

export function track(
  event: string,
  payload: Omit<TelemetryEvent, 'event' | 'timestamp'>
): void {
  if (typeof window === 'undefined') return   // never run on server

  const body = {
    ...payload,
    event,
    timestamp: new Date().toISOString(),
  } as TelemetryEvent

  if (process.env.NODE_ENV === 'development') {
    // eslint-disable-next-line no-console
    console.debug('[telemetry]', body)
  }

  dispatch(body)
}

// ─── Dispatch (swap this to change the sink) ──────────────────────────────────

function dispatch(event: TelemetryEvent): void {
  const url  = '/api/telemetry'
  const data = JSON.stringify(event)

  // sendBeacon: non-blocking, survives page unload, no CORS preflight
  if (navigator.sendBeacon) {
    navigator.sendBeacon(url, new Blob([data], { type: 'application/json' }))
    return
  }

  // Fallback: keepalive fetch so the request survives tab close
  fetch(url, {
    method:    'POST',
    headers:   { 'Content-Type': 'application/json' },
    body:      data,
    keepalive: true,
  }).catch(() => { /* telemetry is non-critical — swallow silently */ })
}
