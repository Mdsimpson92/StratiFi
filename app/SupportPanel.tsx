'use client'

import { useEffect, useRef, useState } from 'react'
import type { SupportAIResponse, SupportCategory } from '@/app/api/support/chat/route'
import { track, EVENTS }                           from '@/lib/telemetry'
import type { UserPlan }                           from '@/lib/telemetry'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SupportMessage {
  role:    'user' | 'assistant'
  content: string
  meta?:   {
    category:       SupportCategory
    shouldEscalate: boolean
    confidence:     'high' | 'medium' | 'low'
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SupportPanel({
  userPlan        = 'free',
  paywallEnabled  = false,
}: {
  userPlan?:       UserPlan
  paywallEnabled?: boolean
}) {
  const [open, setOpen]               = useState(false)
  const [messages, setMessages]       = useState<SupportMessage[]>([INTRO_MSG])
  const [input, setInput]             = useState('')
  const [loading, setLoading]         = useState(false)
  const [rateLimited, setRateLimited] = useState(false)
  const [showEscalate, setShowEscalate] = useState(false)
  const [escalated, setEscalated]     = useState(false)
  const [escalating, setEscalating]   = useState(false)
  const [escalateError, setEscalateError] = useState<false | 'error' | 'rate_limited'>(false)

  // ── Analytics refs (never cause re-renders) ───────────────────────────────
  // One stable session ID per component mount — ties all events in one chat together.
  const sessionIdRef         = useRef(
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2, 10)
  )
  const messageCountRef      = useRef(0)         // user messages sent this session
  const chatStartedRef       = useRef(false)     // fire support_chat_started once
  const escalationShownRef   = useRef(false)     // fire support_escalation_shown once
  const escalationTriggerRef = useRef('unknown') // reason escalation was surfaced

  // Server-side also enforces this — client-side ref prevents UI spam
  const escalationCountRef = useRef(0)
  const MAX_CLIENT_ESCALATIONS = 3

  // Shared payload fragment — keeps every track() call DRY
  function basePayload() {
    return {
      user_plan:       userPlan,
      paywall_enabled: paywallEnabled,
      session_id:      sessionIdRef.current,
    }
  }

  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  // ── Escalation visibility (code-enforced, not AI-controlled) ──────────────
  // Show "Contact Support" if ANY message triggered escalation conditions.
  // Rules applied in code — AI cannot suppress this.
  const shouldShowEscalate = showEscalate || messages.some(m =>
    m.meta?.shouldEscalate ||
    m.meta?.confidence === 'low' ||
    m.meta?.category === 'billing'
  )

  // Centralised escalation surface — fires the analytics event exactly once.
  function triggerEscalate(reason: string) {
    escalationTriggerRef.current = reason
    setShowEscalate(true)
    if (!escalationShownRef.current) {
      escalationShownRef.current = true
      const lastMeta = [...messages].reverse().find(m => m.meta?.category)?.meta
      track(EVENTS.SUPPORT_ESCALATION_SHOWN, {
        ...basePayload(),
        trigger:          reason,
        category:         lastMeta?.category ?? 'unknown',
        message_count:    messageCountRef.current,
      })
    }
  }

  // ── Send message ──────────────────────────────────────────────────────────

  async function sendMessage(text: string) {
    const trimmed = text.trim()
    if (!trimmed || loading) return

    messageCountRef.current++

    // Client-side: immediately trigger escalation if user asks for human
    const requestsHuman = /\b(human|agent|speak to|talk to|contact support|contact team)\b/i.test(trimmed)

    const userMsg: SupportMessage = { role: 'user', content: trimmed }
    const next = [...messages, userMsg]
    setMessages(next)
    setInput('')
    setLoading(true)
    setRateLimited(false)

    track(EVENTS.SUPPORT_MESSAGE_SENT, {
      ...basePayload(),
      message_index: messageCountRef.current,
    })

    if (requestsHuman) {
      triggerEscalate('user_requested')
    }

    try {
      const res = await fetch('/api/support/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          messages: next.map(m => ({ role: m.role, content: m.content })),
        }),
      })

      if (res.status === 429) {
        setRateLimited(true)
        setMessages(prev => [...prev, RATE_LIMIT_MSG])
        track(EVENTS.SUPPORT_FALLBACK_TRIGGERED, { ...basePayload(), reason: 'rate_limited' })
        triggerEscalate('fallback')
        return
      }

      if (!res.ok) throw new Error(`${res.status}`)

      const data = await res.json() as SupportAIResponse

      const assistantMsg: SupportMessage = {
        role:    'assistant',
        content: data.message,
        meta: {
          category:       data.category,
          shouldEscalate: data.shouldEscalate,
          confidence:     data.confidence,
        },
      }
      setMessages(prev => [...prev, assistantMsg])

      // ── Per-response analytics (two focused events, not one fat event) ───
      track(EVENTS.SUPPORT_RESPONSE_GENERATED, {
        ...basePayload(),
        message_index:   messageCountRef.current,
        should_escalate: data.shouldEscalate,
        category:        data.category,
        confidence:      data.confidence,
      })
      track(EVENTS.SUPPORT_ISSUE_CATEGORY, {
        ...basePayload(),
        category:   data.category,
        confidence: data.confidence,
      })
      track(EVENTS.SUPPORT_AI_CONFIDENCE, {
        ...basePayload(),
        confidence: data.confidence,
        category:   data.category,
      })

      // Code-enforced escalation — AI response alone is not trusted
      if (data.shouldEscalate)           triggerEscalate('ai_decision')
      else if (data.confidence === 'low') triggerEscalate('low_confidence')
      else if (data.category === 'billing') triggerEscalate('billing_category')
    } catch {
      setMessages(prev => [...prev, FALLBACK_MSG])
      track(EVENTS.SUPPORT_FALLBACK_TRIGGERED, { ...basePayload(), reason: 'api_error' })
      triggerEscalate('fallback')
    } finally {
      setLoading(false)
    }
  }

  // ── Escalate ──────────────────────────────────────────────────────────────

  async function handleEscalate() {
    if (escalated || escalating) return
    if (escalationCountRef.current >= MAX_CLIENT_ESCALATIONS) return

    escalationCountRef.current++
    setEscalating(true)
    setEscalateError(false)

    // Derive category from conversation — last known category or 'unknown'
    const lastMeta = [...messages].reverse().find(m => m.meta?.category)?.meta
    const category = lastMeta?.category ?? 'unknown'

    track(EVENTS.SUPPORT_ESCALATION_CLICKED, {
      ...basePayload(),
      category,
      message_count: messageCountRef.current,
      trigger:       escalationTriggerRef.current,
    })

    const transcript = messages
      .map(m => `${m.role === 'user' ? 'User' : 'Support'}: ${m.content}`)
      .join('\n')

    try {
      const res = await fetch('/api/support/escalate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ category, transcript }),
      })

      if (res.status === 429) {
        setEscalateError('rate_limited')
        return
      }

      if (!res.ok) {
        setEscalateError('error')
        escalationCountRef.current--  // allow retry
        return
      }

      setEscalated(true)
    } catch {
      setEscalateError('error')
      escalationCountRef.current--
    } finally {
      setEscalating(false)
    }
  }

  // ── Key handler ───────────────────────────────────────────────────────────

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Floating trigger button */}
      <button
        style={FLOAT_BTN}
        onClick={() => {
          const opening = !open
          setOpen(opening)
          if (opening && !chatStartedRef.current) {
            chatStartedRef.current = true
            track(EVENTS.SUPPORT_CHAT_STARTED, basePayload())
          }
        }}
        aria-label="Open support chat"
      >
        {open ? '✕' : '?'}
      </button>

      {/* Panel */}
      {open && (
        <div style={PANEL}>
          {/* Header */}
          <div style={HEADER}>
            <div>
              <div style={HEADER_TITLE}>StratiFi Support</div>
              <div style={HEADER_SUB}>Typically replies in seconds</div>
            </div>
            <button style={CLOSE_BTN} onClick={() => setOpen(false)} aria-label="Close support">✕</button>
          </div>

          {/* Messages */}
          <div style={MESSAGES}>
            {messages.map((m, i) => (
              <div key={i} style={m.role === 'user' ? USER_ROW : ASSISTANT_ROW}>
                {m.role === 'assistant' && <div style={AVATAR}>S</div>}
                <div style={m.role === 'user' ? USER_BUBBLE : ASSISTANT_BUBBLE}>
                  {m.content}
                  {m.meta?.category && m.meta.category !== 'unknown' && (
                    <span style={CATEGORY_TAG}>{m.meta.category}</span>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div style={ASSISTANT_ROW}>
                <div style={AVATAR}>S</div>
                <div style={TYPING_BUBBLE}>
                  <span style={DOT_1} />
                  <span style={DOT_2} />
                  <span style={DOT_3} />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Escalation section — shown when code-enforced conditions are met */}
          {shouldShowEscalate && (
            <div style={ESCALATE_SECTION}>
              {escalated ? (
                <p style={ESCALATE_CONFIRM}>
                  ✓ Your message has been sent to our support team. Someone will follow up via email.
                </p>
              ) : (
                <>
                  <p style={ESCALATE_PROMPT}>Need more help? Our support team will review your issue.</p>
                  <button
                    style={escalating ? ESCALATE_BTN_LOADING : ESCALATE_BTN}
                    onClick={handleEscalate}
                    disabled={escalating}
                  >
                    {escalating ? 'Sending…' : 'Contact Support'}
                  </button>
                  {escalateError === 'error' && (
                    <p style={ESCALATE_ERROR}>Couldn't send — please try again.</p>
                  )}
                  {escalateError === 'rate_limited' && (
                    <p style={ESCALATE_ERROR}>Too many attempts — please wait a few minutes before trying again.</p>
                  )}
                </>
              )}
            </div>
          )}

          {/* Rate limit notice */}
          {rateLimited && !escalated && (
            <p style={RATE_MSG}>
              You've sent a lot of messages. Please wait a moment before continuing.
            </p>
          )}

          {/* Input */}
          <div style={INPUT_AREA}>
            <textarea
              style={TEXTAREA}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Ask something…"
              rows={1}
              disabled={loading || rateLimited}
            />
            <button
              style={loading || !input.trim() ? SEND_BTN_DISABLED : SEND_BTN}
              onClick={() => sendMessage(input)}
              disabled={loading || !input.trim()}
              aria-label="Send"
            >
              ↑
            </button>
          </div>
        </div>
      )}
    </>
  )
}

// ─── Canned messages ──────────────────────────────────────────────────────────

const INTRO_MSG: SupportMessage = {
  role:    'assistant',
  content: "Hi! I'm here to help with StratiFi. What can I help you with today?",
}

const FALLBACK_MSG: SupportMessage = {
  role:    'assistant',
  content: "I'm having trouble answering that. You can contact support directly using the button below.",
  meta: { category: 'unknown', shouldEscalate: true, confidence: 'low' },
}

const RATE_LIMIT_MSG: SupportMessage = {
  role:    'assistant',
  content: "You've sent quite a few messages. Please wait a moment before continuing — or contact support directly.",
  meta: { category: 'unknown', shouldEscalate: true, confidence: 'low' },
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'

const FLOAT_BTN: React.CSSProperties = {
  position:        'fixed',
  bottom:          '5.5rem',   // above mobile bottom nav (z-index 100)
  right:           '0.75rem',
  zIndex:          155,
  width:           44,
  height:          44,
  borderRadius:    '50%',
  background:      'linear-gradient(135deg, #2ab9b0, #1e3166)',
  color:           '#ffffff',
  border:          'none',
  cursor:          'pointer',
  fontSize:        '1.1rem',
  fontWeight:      700,
  fontFamily:      FONT,
  display:         'flex',
  alignItems:      'center',
  justifyContent:  'center',
  boxShadow:       '0 4px 16px rgba(30,49,102,0.25)',
}

const PANEL: React.CSSProperties = {
  position:      'fixed',
  bottom:        '7.5rem',    // above the float button + clearance
  right:         '0.75rem',
  zIndex:        150,
  width:         'min(380px, calc(100vw - 1.5rem))',
  maxHeight:     'calc(100dvh - 10rem)',
  display:       'flex',
  flexDirection: 'column',
  background:    '#ffffff',
  borderRadius:  16,
  boxShadow:     '0 8px 40px rgba(30,49,102,0.18)',
  border:        '1px solid #daeef2',
  overflow:      'hidden',
  fontFamily:    FONT,
  animation:     'fadeIn 0.2s ease-out',
}

const HEADER: React.CSSProperties = {
  display:         'flex',
  alignItems:      'center',
  justifyContent:  'space-between',
  padding:         '0.9rem 1rem',
  background:      'linear-gradient(135deg, #2ab9b0, #1e3166)',
  flexShrink:      0,
}

const HEADER_TITLE: React.CSSProperties = {
  fontSize:   '0.88rem',
  fontWeight: 700,
  color:      '#ffffff',
}

const HEADER_SUB: React.CSSProperties = {
  fontSize: '0.68rem',
  color:    'rgba(255,255,255,0.72)',
  marginTop:'0.1rem',
}

const CLOSE_BTN: React.CSSProperties = {
  background: 'none',
  border:     'none',
  cursor:     'pointer',
  color:      'rgba(255,255,255,0.8)',
  fontSize:   '0.9rem',
  padding:    0,
  lineHeight: 1,
}

const MESSAGES: React.CSSProperties = {
  flex:           1,
  overflowY:      'auto',
  padding:        '0.85rem',
  display:        'flex',
  flexDirection:  'column',
  gap:            '0.55rem',
  minHeight:      120,
  maxHeight:      320,
}

const USER_ROW: React.CSSProperties = {
  display:        'flex',
  justifyContent: 'flex-end',
}

const ASSISTANT_ROW: React.CSSProperties = {
  display:    'flex',
  alignItems: 'flex-end',
  gap:        '0.4rem',
}

const AVATAR: React.CSSProperties = {
  width:          26,
  height:         26,
  borderRadius:   '50%',
  background:     '#2ab9b0',
  color:          '#ffffff',
  fontSize:       '0.65rem',
  fontWeight:     700,
  display:        'flex',
  alignItems:     'center',
  justifyContent: 'center',
  flexShrink:     0,
}

const USER_BUBBLE: React.CSSProperties = {
  background:   'linear-gradient(135deg, #2ab9b0, #1e3166)',
  color:        '#ffffff',
  borderRadius: '14px 14px 4px 14px',
  padding:      '0.5rem 0.75rem',
  fontSize:     '0.83rem',
  lineHeight:   1.5,
  maxWidth:     '78%',
  wordBreak:    'break-word',
}

const ASSISTANT_BUBBLE: React.CSSProperties = {
  background:   '#f1f5f9',
  color:        '#1e3166',
  borderRadius: '14px 14px 14px 4px',
  padding:      '0.5rem 0.75rem',
  fontSize:     '0.83rem',
  lineHeight:   1.5,
  maxWidth:     '82%',
  wordBreak:    'break-word',
}

const CATEGORY_TAG: React.CSSProperties = {
  display:       'inline-block',
  marginLeft:    '0.4rem',
  fontSize:      '0.6rem',
  fontWeight:    700,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color:         '#8aaabb',
  verticalAlign: 'middle',
}

const TYPING_BUBBLE: React.CSSProperties = {
  ...ASSISTANT_BUBBLE,
  display:    'flex',
  gap:        '0.25rem',
  alignItems: 'center',
  padding:    '0.6rem 0.85rem',
}

const dotBase: React.CSSProperties = {
  width:        6,
  height:       6,
  borderRadius: '50%',
  background:   '#9ca3af',
  animation:    'pulse 1.2s ease-in-out infinite',
}
const DOT_1: React.CSSProperties = { ...dotBase, animationDelay: '0s' }
const DOT_2: React.CSSProperties = { ...dotBase, animationDelay: '0.2s' }
const DOT_3: React.CSSProperties = { ...dotBase, animationDelay: '0.4s' }

const ESCALATE_SECTION: React.CSSProperties = {
  padding:     '0.65rem 1rem',
  borderTop:   '1px solid #e2e8f0',
  background:  '#fafbff',
  flexShrink:  0,
}

const ESCALATE_PROMPT: React.CSSProperties = {
  margin:     '0 0 0.45rem',
  fontSize:   '0.75rem',
  color:      '#6b7280',
}

const ESCALATE_BTN: React.CSSProperties = {
  width:        '100%',
  padding:      '0.55rem',
  background:   '#1e3166',
  color:        '#ffffff',
  border:       'none',
  borderRadius: 8,
  fontSize:     '0.82rem',
  fontWeight:   700,
  cursor:       'pointer',
  fontFamily:   FONT,
}

const ESCALATE_BTN_LOADING: React.CSSProperties = {
  ...ESCALATE_BTN,
  background: '#9ca3af',
  cursor:     'not-allowed',
}

const ESCALATE_CONFIRM: React.CSSProperties = {
  margin:     0,
  fontSize:   '0.78rem',
  color:      '#0d7878',
  fontWeight: 600,
}

const ESCALATE_ERROR: React.CSSProperties = {
  margin:     '0.35rem 0 0',
  fontSize:   '0.72rem',
  color:      '#b91c1c',
}

const RATE_MSG: React.CSSProperties = {
  margin:    0,
  padding:   '0.5rem 1rem',
  fontSize:  '0.72rem',
  color:     '#9ca3af',
  borderTop: '1px solid #e2e8f0',
  flexShrink: 0,
}

const INPUT_AREA: React.CSSProperties = {
  display:    'flex',
  gap:        '0.4rem',
  padding:    '0.65rem',
  borderTop:  '1px solid #e2e8f0',
  background: '#ffffff',
  flexShrink: 0,
  alignItems: 'flex-end',
}

const TEXTAREA: React.CSSProperties = {
  flex:         1,
  resize:       'none',
  border:       '1px solid #d1e8eb',
  borderRadius: 10,
  padding:      '0.5rem 0.65rem',
  fontSize:     '0.83rem',
  fontFamily:   FONT,
  color:        '#1e3166',
  outline:      'none',
  lineHeight:   1.45,
  overflowY:    'hidden',
}

const SEND_BTN: React.CSSProperties = {
  width:          34,
  height:         34,
  borderRadius:   '50%',
  background:     'linear-gradient(135deg, #2ab9b0, #1e3166)',
  color:          '#ffffff',
  border:         'none',
  cursor:         'pointer',
  fontSize:       '0.95rem',
  fontWeight:     700,
  display:        'flex',
  alignItems:     'center',
  justifyContent: 'center',
  flexShrink:     0,
}

const SEND_BTN_DISABLED: React.CSSProperties = {
  ...SEND_BTN,
  background: '#d1d5db',
  cursor:     'not-allowed',
}
