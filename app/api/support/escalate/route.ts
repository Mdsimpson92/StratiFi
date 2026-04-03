import { auth, currentUser } from '@clerk/nextjs/server'
import { NextResponse }       from 'next/server'
import { logInteraction }     from '@/lib/support/log'

// ─── Rate limiting ────────────────────────────────────────────────────────────

import { createRateLimiter } from '@/lib/utils/rate-limit'

const escalationLimiter = createRateLimiter('escalate', 3, 60 * 60 * 1000)  // 3 per hour

// ─── Urgency detection ────────────────────────────────────────────────────────

const HIGH_KEYWORDS   = ['urgent', 'emergency', 'locked out', 'fraud', 'stolen', 'unauthorized', 'data loss', 'charged twice', 'double charge', "can't access", 'cannot access', 'security']
const MEDIUM_KEYWORDS = ['billing', 'subscription', 'payment', 'charge', 'error', 'bug', 'not working', 'broken', 'fails', 'missing', 'wrong']

function deriveUrgency(transcript: string): 'high' | 'medium' | 'low' {
  const lower = transcript.toLowerCase()
  if (HIGH_KEYWORDS.some(k => lower.includes(k)))   return 'high'
  if (MEDIUM_KEYWORDS.some(k => lower.includes(k))) return 'medium'
  return 'low'
}

// ─── AI summary ───────────────────────────────────────────────────────────────
// Uses claude-haiku for speed and cost — summary is short and well-defined.

async function generateSummary(transcript: string, apiKey: string): Promise<string> {
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: {
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
        'content-type':      'application/json',
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 120,
        messages:   [{
          role:    'user',
          content: `Summarize this support conversation in a single sentence starting with "Issue:". Be specific about what the user is experiencing.\n\nTranscript:\n${transcript.slice(0, 3000)}`,
        }],
      }),
    })
    if (!res.ok) throw new Error(`${res.status}`)
    const data = await res.json()
    return (data.content?.[0]?.text ?? '').trim() || 'Issue: Manual review required.'
  } catch {
    return 'Issue: Summary generation failed — see transcript.'
  }
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(req: Request): Promise<Response> {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (await escalationLimiter.check(userId)) {
    return NextResponse.json({ error: 'escalation_limited' }, { status: 429 })
  }

  const body = await req.json().catch(() => null)
  if (!body?.transcript || typeof body.transcript !== 'string') {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const user      = await currentUser()
  const userEmail = user?.emailAddresses?.[0]?.emailAddress ?? '(no email)'
  const category  = typeof body.category === 'string' ? body.category : 'unknown'
  const transcript = body.transcript.slice(0, 8000)
  const urgency   = deriveUrgency(transcript)
  const timestamp = new Date().toISOString()

  // Generate summary — degrades gracefully if API key missing
  const apiKey = process.env.ANTHROPIC_API_KEY
  const summary = apiKey
    ? await generateSummary(transcript, apiKey)
    : 'Issue: Automatic summary unavailable — see transcript.'

  // ── Build email ─────────────────────────────────────────────────────────────
  const emailSubject = `[StratiFi Support] ${category} issue - ${userId}`
  const emailBody = [
    'StratiFi Support Escalation',
    '══════════════════════════════════════',
    '',
    `Summary:   ${summary}`,
    `Category:  ${category}`,
    `Urgency:   ${urgency}`,
    `User ID:   ${userId}`,
    `Email:     ${userEmail}`,
    `Timestamp: ${timestamp}`,
    '',
    '── Conversation Transcript ────────────',
    '',
    transcript,
    '',
    '── End of Transcript ──────────────────',
  ].join('\n')

  // ── Send via Resend ─────────────────────────────────────────────────────────
  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) {
    // Dev/staging fallback: log instead of crashing
    console.log('[support/escalate] RESEND_API_KEY not set — logging email instead')
    console.log(`Subject: ${emailSubject}`)
    console.log(emailBody)
    logInteraction({
      userId,
      userMessage:       transcript.slice(0, 500),
      aiResponse:        summary,
      category,
      confidence:        null,
      escalated:         true,
      responseSource:    'escalation',
      escalationOutcome: 'email_sent',  // dev fallback counts as "sent"
    }).catch(() => {})
    return NextResponse.json({ ok: true, dev: true })
  }

  try {
    const emailRes = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${resendKey}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        from:    process.env.SUPPORT_EMAIL_FROM ?? 'support@stratifi.app',
        to:      'michaelsimpson.finance@gmail.com',
        subject: emailSubject,
        text:    emailBody,
      }),
    })

    if (!emailRes.ok) {
      const errText = await emailRes.text()
      console.error('[support/escalate] Resend error:', emailRes.status, errText)
      logInteraction({
        userId,
        userMessage:       transcript.slice(0, 500),
        aiResponse:        summary,
        category,
        confidence:        null,
        escalated:         true,
        responseSource:    'escalation',
        escalationOutcome: 'email_failed',
      }).catch(() => {})
      return NextResponse.json({ error: 'Email delivery failed' }, { status: 500 })
    }

    logInteraction({
      userId,
      userMessage:       transcript.slice(0, 500),
      aiResponse:        summary,
      category,
      confidence:        null,
      escalated:         true,
      responseSource:    'escalation',
      escalationOutcome: 'email_sent',
    }).catch(() => {})

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[support/escalate]', err)
    logInteraction({
      userId,
      userMessage:       transcript.slice(0, 500),
      aiResponse:        summary,
      category,
      confidence:        null,
      escalated:         true,
      responseSource:    'escalation',
      escalationOutcome: 'email_failed',
    }).catch(() => {})
    return NextResponse.json({ error: 'Escalation failed' }, { status: 500 })
  }
}
