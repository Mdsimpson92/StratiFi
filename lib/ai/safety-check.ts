// ─── Compliance Boundary ──────────────────────────────────────────────────────
// Ensures AI output never crosses into regulated financial advice territory.

const FORBIDDEN_PHRASES = [
  'you should invest in',
  'buy this stock',
  'sell your',
  'guaranteed return',
  'risk-free',
  'i recommend purchasing',
  'financial advice',
  'tax advice',
  'legal advice',
  'i am a financial advisor',
  'trust me',
]

export interface SafetyResult {
  safe: boolean
  flagged: string[]
}

/**
 * Check AI output for compliance violations.
 * Returns safe=true if no issues found.
 */
export function checkCompliance(text: string): SafetyResult {
  const lower = text.toLowerCase()
  const flagged = FORBIDDEN_PHRASES.filter(phrase => lower.includes(phrase))
  return { safe: flagged.length === 0, flagged }
}

/**
 * Append compliance disclaimer to any AI-generated text.
 */
export function addDisclaimer(text: string): string {
  return `${text}\n\n---\n*For informational purposes only. Not financial, tax, or legal advice. Consult a licensed professional for personalized guidance.*`
}
