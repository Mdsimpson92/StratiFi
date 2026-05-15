import Anthropic         from '@anthropic-ai/sdk'
import { auth }          from '@clerk/nextjs/server'
import { NextResponse }  from 'next/server'
import { logInteraction } from '@/lib/support/log'

// ─── Types ────────────────────────────────────────────────────────────────────

export type SupportCategory   = 'general' | 'billing' | 'technical' | 'account' | 'unknown'
export type SupportConfidence = 'high' | 'medium' | 'low'

export interface SupportAIResponse {
  message:        string
  shouldEscalate: boolean
  category:       SupportCategory
  confidence:     SupportConfidence
}

// ─── Client ───────────────────────────────────────────────────────────────────

const client = new Anthropic()

// ─── System prompt (cached when long enough to qualify) ───────────────────────

const SYSTEM_PROMPT = `You are StratiFi Support — an embedded chat assistant inside the StratiFi web app.

WHAT STRATIFI IS
StratiFi is a free personal-finance app that helps users see where their money goes and make better decisions. Users sign in via Clerk, then either upload a CSV of transactions or link a real bank account via Plaid. There is no paid tier, no Pro plan, and no subscription — the app is free for everyone.

DASHBOARD SECTIONS
- Financial Health Score (0–100): rolls up 6 factors — emergency fund, debt ratio, cash flow, savings rate, debt load, retirement readiness.
- Top Actions: ranked, dollar-specific moves the user can take next.
- Cashflow & Forecast: income vs. expenses over time; 30-day forward projection based on recurring patterns.
- Allocation: how money splits across emergency fund, retirement, and debt; with target lines.
- Expenses & Subscriptions: categorized spend; detected recurring charges to consider cutting.
- Alerts: spending spikes, missed bills, surprise charges. Push notifications when enabled.

DATA SOURCES
- Plaid (real bank linking): supports thousands of US banks. Connected via the "Connect a bank" button. After linking, transactions sync within ~30–60 seconds.
- CSV upload: users can upload their own transaction CSV. Sample CSVs are downloadable on the dashboard.
- Demo mode: until the user uploads real data or links a bank, the dashboard shows demo numbers so they can see the interface.

ONBOARDING
- 7-step form: welcome → age & household → income & expenses → debt → savings → goals → "what's next" preview.
- Each data step includes a "Why this matters" callout explaining why the input is needed.
- After onboarding, a guided tour fires once per user explaining each dashboard section.

PRIVACY & SECURITY
- Per-user data silos enforced via Clerk authentication.
- Bank credentials never touch StratiFi servers — Plaid handles that entirely.
- Data is the user's; not sold, not shared.

WHAT YOU SHOULD DO
- Help users understand the app, the dashboard, their data, and general financial concepts (what is an emergency fund, debt avalanche vs snowball, why savings rate matters).
- Be specific, direct, and useful. No hedging, no filler.
- If a user asks something the app can already show them, point them at the section by name.
- Keep responses under 600 characters. Chat is for help, not essays.

WHAT YOU MUST NOT DO
- Give personalized investment advice ("you should buy X stock"). You are not a licensed financial advisor — recommend they consult one for that.
- Give tax or legal advice.
- Recommend specific securities, mutual funds, ETFs by ticker, or crypto tokens.
- Discuss Pro/billing/subscriptions — those don't exist; the app is free.
- Invent features. If unsure, say so and offer to escalate.

WHEN TO ESCALATE (set shouldEscalate=true)
- Bugs or errors the user is hitting that you can't diagnose from the chat alone.
- Account-level changes (delete account, export data, change email).
- Requests for personalized financial advice you correctly declined.
- The user explicitly asks for a human.
- You are genuinely uncertain whether your answer is correct.

CATEGORY — pick the best one
- 'general' — how the app works, what a feature does, general financial concepts.
- 'billing' — anything money-related to the app (but the app is free, so usually this is clarifying that).
- 'technical' — bugs, errors, things not working as expected (e.g. Plaid link failing).
- 'account' — sign-in, sign-out, data export, account deletion, profile changes.
- 'unknown' — doesn't fit the above.

CONFIDENCE
- 'high' — you're confident in your answer.
- 'medium' — mostly right but not 100% sure (e.g. a feature detail you'd want a human to confirm).
- 'low' — guessing; should be paired with shouldEscalate=true.

Respond ONLY with valid JSON matching the output schema. The 'message' field is plain text (no markdown — the UI renders text literally).`

const OUTPUT_SCHEMA = {
  type:       'object',
  properties: {
    message:        { type: 'string', description: 'The reply shown to the user. Plain text, under 600 characters.' },
    shouldEscalate: { type: 'boolean', description: 'Whether to surface the "Contact Support" button to the user.' },
    category:       { type: 'string', enum: ['general', 'billing', 'technical', 'account', 'unknown'] },
    confidence:     { type: 'string', enum: ['high', 'medium', 'low'] },
  },
  required:             ['message', 'shouldEscalate', 'category', 'confidence'],
  additionalProperties: false,
} as const

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(req: Request): Promise<Response> {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body?.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const incoming     = body.messages as { role: string; content: string }[]
  const lastUserMsg  = [...incoming].reverse().find(m => m.role === 'user')?.content ?? ''

  // Map to Claude API message shape, dropping any malformed entries
  const messages = incoming
    .filter(m => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))

  try {
    const response = await client.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 1024,
      output_config: {
        effort: 'medium',
        format: { type: 'json_schema', schema: OUTPUT_SCHEMA },
      },
      system: [
        {
          type:          'text',
          text:          SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages,
    })

    const textBlock = response.content.find(
      (b): b is Anthropic.TextBlock => b.type === 'text'
    )
    if (!textBlock) throw new Error('No text block in response')

    const parsed = JSON.parse(textBlock.text) as SupportAIResponse
    const result: SupportAIResponse = {
      message:        String(parsed.message ?? '').slice(0, 800),
      shouldEscalate: Boolean(parsed.shouldEscalate),
      category:       parsed.category,
      confidence:     parsed.confidence,
    }

    logInteraction({
      userId,
      userMessage:    lastUserMsg,
      aiResponse:     result.message,
      category:       result.category,
      confidence:     result.confidence,
      escalated:      result.shouldEscalate,
      responseSource: 'ai',
    }).catch(() => {})

    return NextResponse.json(result)
  } catch (err) {
    console.error('[/api/support/chat] Claude call failed:', err)
    const fallback: SupportAIResponse = {
      message:        "I'm having trouble answering that right now. Tap 'Contact Support' below and we'll follow up.",
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
