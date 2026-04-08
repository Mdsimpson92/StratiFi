import { auth }                                           from '@clerk/nextjs/server'
import { NextResponse }                                   from 'next/server'
import { matchKB }                                        from '@/lib/support/matcher'
import { matchBillingPolicy, BILLING_POLICY_PROMPT }      from '@/lib/support/billing-policy'
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

const chatLimiter = createRateLimiter('chat', 10, 60_000)  // 10 messages per minute

// ─── System prompt ────────────────────────────────────────────────────────────

const BASE_SYSTEM_PROMPT = `
You are the StratiFi support assistant. You MUST respond ONLY with valid JSON matching this exact schema — no preamble, no markdown, no extra text:

{
  "message": "<plain-text response, max 120 words>",
  "shouldEscalate": <true|false>,
  "category": "<general|billing|technical|account|unknown>",
  "confidence": "<high|medium|low>"
}

ABOUT STRATIFI:
- Personal finance app connecting to bank accounts via Plaid
- Shows spending insights, cashflow charts, categorized transactions, and anomaly detection
- Recommendations and daily safe-to-spend figure (Pro feature)
- 30-day cashflow forecast and upcoming bill detection (Pro feature)
- Push notification alerts for unusual activity (Pro feature)
- Shareable money snapshots via URL
- Pro plan: $9/month or $79/year via Stripe — cancel anytime

NAVIGATION:
- Overview tab: insights, cashflow, recommendations, forecast
- Alerts tab: financial alerts and push notification settings
- Subscriptions tab: detected recurring charges and waste flags
- Settings tab: bank connection, account, Pro plan

ESCALATE (shouldEscalate: true) when:
- User asks to speak with a human or the support team
- Billing dispute, unexpected charge, refund request, or payment failure
- Security or privacy concern (unauthorized access, data concern)
- Account locked, data missing, or data loss reported
- You are not confident in your answer — also set confidence to "low"

CATEGORIES:
- billing: payments, subscription, pricing, charges, refunds
- technical: bugs, errors, features not working, Plaid connection issues
- account: login, profile, data access, linking bank accounts
- general: how-to, feature explanations, navigation help
- unknown: off-topic or unclear requests

RULES — never break these:
- Never provide financial, investment, tax, or legal advice
- Never promise refunds or policy exceptions
- Never invent account details, billing status, or transaction data
- Never discuss topics unrelated to StratiFi support
- If asked for financial advice, decline and redirect to app features
`.trim()

/** Build the system prompt, optionally injecting a KB hint. */
function buildSystemPrompt(hint?: string): string {
  // Billing policy rules are always included so Claude follows them even for
  // queries the policy detector doesn't catch (edge phrasings, follow-up turns).
  const base = `${BASE_SYSTEM_PROMPT}\n\n${BILLING_POLICY_PROMPT}`
  if (!hint) return base
  return `${base}

KNOWN ANSWER (verified — use this as the basis of your response, do not contradict it):
${hint}`
}

// ─── Validation ───────────────────────────────────────────────────────────────

const VALID_CATEGORIES  = new Set<string>(['general', 'billing', 'technical', 'account', 'unknown'])
const VALID_CONFIDENCES = new Set<string>(['high', 'medium', 'low'])

function sanitise(raw: Partial<SupportAIResponse>): SupportAIResponse {
  return {
    message:        typeof raw.message === 'string' && raw.message.length > 0
                      ? raw.message.slice(0, 800)
                      : "I'm not sure how to help with that. You can contact support directly.",
    shouldEscalate: Boolean(raw.shouldEscalate),
    category:       VALID_CATEGORIES.has(raw.category  ?? '')  ? raw.category  as SupportCategory  : 'unknown',
    confidence:     VALID_CONFIDENCES.has(raw.confidence ?? '') ? raw.confidence as SupportConfidence : 'low',
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
    // Redis unavailable — skip rate limiting rather than blocking the user
  }

  const body = await req.json().catch(() => null)
  if (!body?.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const messages = body.messages as { role: string; content: string }[]
  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')?.content ?? ''

  // ── Billing policy — evaluated first, always wins ─────────────────────────
  // Policy rules are authoritative: they bypass both the KB and Claude entirely.
  const policy = matchBillingPolicy(lastUserMsg)
  if (policy) {
    console.log('[support/chat] billing policy hit:', policy.id, policy.escalation_reason)

    const escalated = policy.action === 'escalate'
    const response  = sanitise({
      message:        policy.prescribed_response,
      shouldEscalate: escalated,
      category:       'billing',
      confidence:     'high',
    })

    // Fire-and-forget — never block the response
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

  // High-confidence match: return the KB answer directly — no Claude call needed.
  if (match.tier === 'high' && match.entry) {
    const entry    = match.entry
    const response = sanitise({
      message:        entry.answer,
      shouldEscalate: entry.shouldEscalate,
      category:       entry.category,
      confidence:     'high',
    })

    logInteraction({
      userId,
      userMessage:    lastUserMsg,
      aiResponse:     response.message,
      category:       response.category,
      confidence:     'high',
      escalated:      response.shouldEscalate,
      responseSource: 'kb',
    }).catch(() => {})

    return NextResponse.json(response)
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.error('[support/chat] ANTHROPIC_API_KEY not configured')
    return NextResponse.json({
      message:        "Support is temporarily unavailable. Please try again later.",
      shouldEscalate: true,
      category:       'unknown',
      confidence:     'low',
    } satisfies SupportAIResponse)
  }

  // Medium-confidence match: inject the KB answer as a verified hint.
  // No match: add a caution instruction so Claude stays conservative.
  const systemPrompt = match.tier === 'medium' && match.entry
    ? buildSystemPrompt(match.entry.answer)
    : buildSystemPrompt()

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: {
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
        'content-type':      'application/json',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-6',
        max_tokens: 512,
        system:     systemPrompt,
        // Cap history at 20 messages, each message at 2 000 chars to prevent prompt stuffing
        messages: messages
          .slice(-20)
          .map(m => ({
            role:    m.role === 'user' ? 'user' : 'assistant',
            content: String(m.content).slice(0, 2000),
          })),
      }),
    })

    if (!res.ok) {
      console.error('[support/chat] Anthropic error:', res.status, await res.text())
      throw new Error(`Anthropic ${res.status}`)
    }

    const data = await res.json()
    const text: string = data.content?.[0]?.text ?? ''

    let parsed: Partial<SupportAIResponse>
    try {
      parsed = JSON.parse(text)
    } catch {
      // AI returned non-JSON — treat as unknown fallback
      console.warn('[support/chat] Non-JSON response from AI:', text.slice(0, 200))
      parsed = {
        message:        text.slice(0, 500) || "I'm having trouble right now.",
        shouldEscalate: true,
        category:       'unknown',
        confidence:     'low',
      }
    }

    // If a KB entry exists and it requires escalation, enforce it regardless of what
    // Claude returned — the KB is authoritative on escalation decisions.
    if (match.entry?.shouldEscalate) {
      parsed.shouldEscalate = true
    }

    const response = sanitise(parsed)

    logInteraction({
      userId,
      userMessage:    lastUserMsg,
      aiResponse:     response.message,
      category:       response.category,
      confidence:     response.confidence,
      escalated:      response.shouldEscalate,
      responseSource: 'ai',
    }).catch(() => {})

    return NextResponse.json(response)
  } catch (err) {
    console.error('[support/chat]', err)

    const fallback: SupportAIResponse = {
      message:        "I'm having trouble answering that right now. You can contact support directly.",
      shouldEscalate: true,
      category:       'unknown',
      confidence:     'low',
    }

    logInteraction({
      userId,
      userMessage:    lastUserMsg,
      aiResponse:     fallback.message,
      category:       'unknown',
      confidence:     'low',
      escalated:      true,
      responseSource: 'fallback',
    }).catch(() => {})

    return NextResponse.json(fallback)
  }
}
