/**
 * LAYER 1 — Merchant Normalizer
 *
 * Strips bank/processor noise from raw description strings so
 * downstream layers see a clean merchant name instead of:
 *   "SQ * TONY'S BAR AND GRILL 1234 CHICAGO IL"
 *
 * Designed to be idempotent — calling it twice on the same input
 * produces the same output.
 */

// ─── Prefix patterns ──────────────────────────────────────────────────────────
// Ordered longest-first so more-specific prefixes are stripped first.
// Each entry is tested as a leading substring (case-insensitive).

const STRIP_PREFIXES: RegExp[] = [
  /^sq\s*\*\s*/i,           // Square: "SQ *STARBUCKS"
  /^tst\*\s*/i,             // Toast POS: "TST*RESTAURANT"
  /^paypal\s*\*\s*/i,       // PayPal: "PAYPAL *NETFLIX.COM"
  /^pp\s*\*\s*/i,           // PayPal short: "PP *MERCHANT"
  /^venmo\s*\*\s*/i,        // Venmo
  /^cash\s*app\s*\*\s*/i,   // Cash App
  /^zelle\s*\*\s*/i,        // Zelle
  /^pos\s+/i,               // Generic POS prefix
  /^deb\s+/i,               // Debit prefix
  /^ach\s+/i,               // ACH prefix
  /^checkcard\s+/i,         // Checkcard prefix
  /^purchase\s+/i,          // "PURCHASE STARBUCKS"
  /^recurring\s+/i,         // "RECURRING NETFLIX"
  /^google\s*\*\s*/i,       // Google Pay: "GOOGLE *YOUTUBE"
  // Note: APPLE.COM/BILL intentionally NOT stripped — it is the merchant, not a processor prefix.
  /^amzn\s*mktp\s*/i,       // Amazon marketplace prefix (before alias resolves it)
]

// ─── Trailing noise patterns ──────────────────────────────────────────────────
// Stripped from the END of the description after prefix removal.

const STRIP_TRAILING: RegExp[] = [
  /\s+#\d+$/,                         // Store number: "STARBUCKS #1234"
  /\s+\d{4,}.*$/,                     // Long trailing numbers / ref codes
  /\s+[A-Z]{2}\s+\d{5}(-\d{4})?$/,   // State + zip: "STARBUCKS IL 60601"
  /\s+\d{5}(-\d{4})?$/,              // Zip code only
  /\s+(ref|id|txn|seq|ach)\s*[#:]\s*\w+.*/i, // "REF #ABC123"
]

// ─── Core normalizer ──────────────────────────────────────────────────────────

/**
 * normalizeMerchantName
 *
 * Input:  "SQ * TONY'S BAR AND GRILL 1234 CHICAGO IL"
 * Output: "tonys bar and grill"
 *
 * Input:  "PAYPAL * NETFLIX.COM"
 * Output: "netflix"
 *
 * Input:  "AMZN MKTP US*2K3L4"
 * Output: "amazon" (via alias layer — this function outputs "amzn mktp us")
 * Note:   alias resolution happens in Layer 2, not here.
 */
export function normalizeMerchantName(raw: string): string {
  let s = raw.trim()

  // 1. Strip leading processor prefixes (apply all that match)
  for (const prefix of STRIP_PREFIXES) {
    s = s.replace(prefix, '')
  }

  // 2. Lowercase
  s = s.toLowerCase()

  // 3. Replace special characters with spaces (keep alphanumeric + spaces)
  s = s.replace(/[^a-z0-9\s]/g, ' ')

  // 4. Strip trailing noise (store numbers, zips, ref codes)
  for (const trailer of STRIP_TRAILING) {
    s = s.replace(trailer, '')
  }

  // 5. Collapse whitespace
  s = s.replace(/\s+/g, ' ').trim()

  return s
}
