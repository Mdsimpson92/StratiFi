import { KB, type KBEntry } from './knowledge-base'

// ─── Match result ─────────────────────────────────────────────────────────────

export type MatchTier = 'high' | 'medium' | 'none'

export interface MatchResult {
  tier:  MatchTier
  entry: KBEntry | null
  score: number
}

// ─── Scoring ──────────────────────────────────────────────────────────────────
// Score = matched_keywords / total_keywords for the entry.
// Phrases ("safe to spend") count as one keyword and must appear as a substring.
// Single-word keywords must appear as whole words (word-boundary check).

const HIGH_THRESHOLD   = 0.75   // ≥75% of keywords matched → bypass Claude
const MEDIUM_THRESHOLD = 0.45   // ≥45% of keywords matched → inject as hint

function normalize(text: string): string {
  return text.toLowerCase().replace(/['']/g, "'")
}

function scoreEntry(message: string, entry: KBEntry): number {
  const msg = normalize(message)
  let matched = 0

  for (const kw of entry.keywords) {
    const term = normalize(kw)
    if (term.includes(' ')) {
      // Phrase match — substring is fine
      if (msg.includes(term)) matched++
    } else {
      // Word match — require word boundary so "cancel" doesn't hit "cancellation" unexpectedly
      const re = new RegExp(`(?<![a-z])${escapeRegex(term)}(?![a-z])`)
      if (re.test(msg)) matched++
    }
  }

  // Require at least 2 keyword hits (or all keywords if the entry only has 1–2)
  const minHits = Math.min(2, entry.keywords.length)
  if (matched < minHits) return 0

  return matched / entry.keywords.length
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Match the latest user message against the knowledge base.
 * Only the last message is scored — conversation history provides context
 * to Claude, not to the keyword matcher.
 */
export function matchKB(userMessage: string): MatchResult {
  let best: KBEntry | null = null
  let bestScore = 0

  for (const entry of KB) {
    const score = scoreEntry(userMessage, entry)
    if (score > bestScore) {
      bestScore = score
      best = entry
    }
  }

  if (bestScore >= HIGH_THRESHOLD)   return { tier: 'high',   entry: best, score: bestScore }
  if (bestScore >= MEDIUM_THRESHOLD) return { tier: 'medium', entry: best, score: bestScore }
  return                                    { tier: 'none',   entry: null, score: bestScore }
}
