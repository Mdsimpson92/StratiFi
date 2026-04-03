/**
 * Shareable money snapshot.
 *
 * Data is encoded as URL-safe base64 JSON and embedded directly in the
 * share URL — no database, no server round-trip, no auth required to view.
 *
 * What's included: safe-to-spend amount (Pro only), top recommendation
 * title, first insight text, and a month/year timestamp.  No raw
 * transaction data, balances, account identifiers, or PII.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SnapshotData {
  safe:    string | null   // "$342" | null (omitted for free users)
  rec:     string | null   // recommendation title only
  insight: string | null   // first insight text
  date:    string          // "April 2026"
}

// ─── Encode / decode ──────────────────────────────────────────────────────────

export function encodeSnapshot(data: SnapshotData): string {
  const json = JSON.stringify(data)
  // URL-safe base64: replace +/= with -_~ (no padding needed in query string
  // but we strip = to keep URLs tidy)
  return btoa(json)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

export function decodeSnapshot(encoded: string): SnapshotData | null {
  try {
    const base64 = encoded
      .replace(/-/g, '+')
      .replace(/_/g, '/')
    // Re-pad to a multiple of 4
    const padded = base64 + '='.repeat((4 - base64.length % 4) % 4)
    const parsed = JSON.parse(atob(padded))

    // Minimal shape validation — reject obviously malformed payloads
    if (typeof parsed !== 'object' || parsed === null)       return null
    if (typeof parsed.date !== 'string')                     return null

    return {
      safe:    typeof parsed.safe    === 'string' ? parsed.safe    : null,
      rec:     typeof parsed.rec     === 'string' ? parsed.rec     : null,
      insight: typeof parsed.insight === 'string' ? parsed.insight : null,
      date:    parsed.date as string,
    }
  } catch {
    return null
  }
}

// ─── Canvas image generation ──────────────────────────────────────────────────
//
// Draws a 640×360 (16:9) branded card to a provided <canvas> element.
// Caller is responsible for creating the canvas and triggering the download.

export function drawSnapshotCanvas(
  canvas: HTMLCanvasElement,
  data:   SnapshotData
): void {
  const W = 640, H = 360
  canvas.width  = W
  canvas.height = H

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
  const PAD  = 36

  // ── Background ──────────────────────────────────────────────────────────────
  const bg = ctx.createLinearGradient(0, 0, W, H)
  bg.addColorStop(0, '#edfafa')
  bg.addColorStop(1, '#f0f4ff')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)

  // ── Top accent bar ──────────────────────────────────────────────────────────
  ctx.fillStyle = '#2ab9b0'
  ctx.fillRect(0, 0, W, 4)

  // ── Brand + date row ────────────────────────────────────────────────────────
  ctx.fillStyle = '#2ab9b0'
  ctx.font      = `bold 11px ${FONT}`
  ctx.fillText('STRATIFI', PAD, PAD + 16)

  ctx.fillStyle = '#8aaabb'
  ctx.font      = `11px ${FONT}`
  ctx.textAlign = 'right'
  ctx.fillText(data.date, W - PAD, PAD + 16)
  ctx.textAlign = 'left'

  // ── Title ───────────────────────────────────────────────────────────────────
  ctx.fillStyle = '#1e3166'
  ctx.font      = `bold 22px ${FONT}`
  ctx.fillText('Your Money Snapshot', PAD, PAD + 52)

  // ── Three cards ─────────────────────────────────────────────────────────────
  const CARD_Y   = PAD + 72
  const CARD_H   = 148
  const CARD_GAP = 10
  const CARD_W   = Math.floor((W - PAD * 2 - CARD_GAP * 2) / 3)

  const cards = [
    { label: 'SAFE TO SPEND', value: data.safe ?? '—',                   accent: '#0d7878', large: true  },
    { label: 'KEY ACTION',    value: data.rec  ?? 'No recommendation',    accent: '#2ab9b0', large: false },
    { label: 'THIS MONTH',    value: data.insight ?? 'No insights yet.',  accent: '#1e3166', large: false },
  ]

  cards.forEach((card, i) => {
    const cardX = PAD + i * (CARD_W + CARD_GAP)

    // Card shadow (approximated with a slightly offset fill)
    ctx.fillStyle = 'rgba(30,49,102,0.07)'
    ctx.beginPath()
    if (ctx.roundRect) {
      ctx.roundRect(cardX + 2, CARD_Y + 3, CARD_W, CARD_H, 10)
    } else {
      ctx.rect(cardX + 2, CARD_Y + 3, CARD_W, CARD_H)
    }
    ctx.fill()

    // Card background
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    if (ctx.roundRect) {
      ctx.roundRect(cardX, CARD_Y, CARD_W, CARD_H, 10)
    } else {
      ctx.rect(cardX, CARD_Y, CARD_W, CARD_H)
    }
    ctx.fill()

    // Card top accent strip
    ctx.fillStyle = card.accent
    ctx.beginPath()
    if (ctx.roundRect) {
      ctx.roundRect(cardX, CARD_Y, CARD_W, 4, [10, 10, 0, 0])
    } else {
      ctx.rect(cardX, CARD_Y, CARD_W, 4)
    }
    ctx.fill()

    // Label
    ctx.fillStyle = '#8aaabb'
    ctx.font      = `700 9px ${FONT}`
    ctx.fillText(card.label, cardX + 14, CARD_Y + 24)

    // Value
    ctx.fillStyle = card.large ? card.accent : '#1e3166'

    if (card.large) {
      ctx.font = `bold 28px ${FONT}`
      ctx.fillText(card.value, cardX + 14, CARD_Y + 62)
    } else {
      ctx.font = `600 13px ${FONT}`
      wrapCanvasText(ctx, card.value, cardX + 14, CARD_Y + 48, CARD_W - 28, 19, 5)
    }
  })

  // ── Footer ──────────────────────────────────────────────────────────────────
  ctx.fillStyle = '#8aaabb'
  ctx.font      = `11px ${FONT}`
  ctx.textAlign = 'center'
  ctx.fillText('stratifi.app', W / 2, H - 14)
}

// Wraps text within a canvas bounding box. maxLines prevents overflow.
function wrapCanvasText(
  ctx:        CanvasRenderingContext2D,
  text:       string,
  x:          number,
  y:          number,
  maxWidth:   number,
  lineHeight: number,
  maxLines:   number
): void {
  const words   = text.split(' ')
  let line      = ''
  let lineCount = 0

  for (let i = 0; i < words.length; i++) {
    if (lineCount >= maxLines) break
    const testLine = line + words[i] + ' '
    if (ctx.measureText(testLine).width > maxWidth && i > 0) {
      ctx.fillText(line.trim(), x, y + lineCount * lineHeight)
      line = words[i] + ' '
      lineCount++
    } else {
      line = testLine
    }
  }
  if (line && lineCount < maxLines) {
    ctx.fillText(line.trim(), x, y + lineCount * lineHeight)
  }
}
