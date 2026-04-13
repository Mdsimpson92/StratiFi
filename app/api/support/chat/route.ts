import { auth }                                           from '@clerk/nextjs/server'
import { NextResponse }                                   from 'next/server'
import { matchKB }                                        from '@/lib/support/matcher'
import { matchBillingPolicy }                             from '@/lib/support/billing-policy'
import { logInteraction }                                  from '@/lib/support/log'

// ─── Types ────────────────────────────────────────────────────────────────────

export type SupportCategory  = 'general' | 'billing' | 'technical' | 'account' | 'unknown'
export type SupportConfidence = 'high' | 'medium' | 'low'

export interface SupportAIResponse {
  message:        string
  shouldEscalate: boolean
  category:       SupportCategory
  confidence:     SupportConfidence
}

// ─── Rate limiting ────────────────────────────────────────────────────────────

import { createRateLimiter } from '@/lib/utils/rate-limit'

const chatLimiter = createRateLimiter('chat', 10, 60_000)

// ─── Validation ───────────────────────────────────────────────────────────────

const VALID_CATEGORIES  = new Set<string>(['general', 'billing', 'technical', 'account', 'unknown'])

function sanitise(raw: Partial<SupportAIResponse>): SupportAIResponse {
  return {
    message:        typeof raw.message === 'string' && raw.message.length > 0
                      ? raw.message.slice(0, 800)
                      : "I'm not sure how to help with that. You can contact support directly.",
    shouldEscalate: Boolean(raw.shouldEscalate),
    category:       VALID_CATEGORIES.has(raw.category  ?? '')  ? raw.category  as SupportCategory  : 'unknown',
    confidence:     raw.confidence === 'high' || raw.confidence === 'medium' ? raw.confidence : 'low',
  }
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(req: Request): Promise<Response> {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    if (await chatLimiter.check(userId)) {
      return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
    }
  } catch {
    // Redis unavailable — skip rate limiting
  }

  const body = await req.json().catch(() => null)
  if (!body?.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const messages = body.messages as { role: string; content: string }[]
  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')?.content ?? ''

  // ── Billing policy — evaluated first, always wins ─────────────────────────
  const policy = matchBillingPolicy(lastUserMsg)
  if (policy) {
    const escalated = policy.action === 'escalate'
    const response  = sanitise({
      message:        policy.prescribed_response,
      shouldEscalate: escalated,
      category:       'billing',
      confidence:     'high',
    })

    logInteraction({
      userId,
      userMessage:    lastUserMsg,
      aiResponse:     response.message,
      category:       'billing',
      confidence:     'high',
      escalated,
      responseSource: 'billing_policy',
    }).catch(() => {})

    return NextResponse.json(response)
  }

  // ── Knowledge-base matching ───────────────────────────────────────────────
  const match = matchKB(lastUserMsg)

  if ((match.tier === 'high' || match.tier === 'medium') && match.entry) {
    const entry    = match.entry
    const response = sanitise({
      message:        entry.answer,
      shouldEscalate: entry.shouldEscalate,
      category:       entry.category,
      confidence:     match.tier === 'high' ? 'high' : 'medium',
    })

    logInteraction({
      userId,
      userMessage:    lastUserMsg,
      aiResponse:     response.message,
      category:       response.category,
      confidence:     response.confidence,
      escalated:      response.shouldEscalate,
      responseSource: 'kb',
    }).catch(() => {})

    return NextResponse.json(response)
  }

  // ── No KB match — helpful fallback with escalation offer ──────────────────
  const fallback: SupportAIResponse = {
    message:        "I don't have a specific answer for that, but I can help with questions about your score, actions, expenses, alerts, billing, account settings, bank connections, and CSV uploads. If you need further help, tap 'Contact Support' below and our team will get back to you.",
    shouldEscalate: false,
    category:       'unknown',
    confidence:     'low',
  }

  logInteraction({
    userId,
    userMessage:    lastUserMsg,
    aiResponse:     fallback.message,
    category:       'unknown',
    confidence:     'low',
    escalated:      false,
    responseSource: 'fallback',
  }).catch(() => {})

  return NextResponse.json(fallback)
}
