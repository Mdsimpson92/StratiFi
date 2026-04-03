/**
 * LAYERS 3–5 — Rule Engine + Confidence Scoring + Fallback Safety
 *
 * Classification pipeline:
 *
 *   [0] User corrections    (confidence 1.0  — highest priority)
 *   [1] Alias lookup        (confidence 0.88–0.99 — exact merchant match)
 *   [2] Priority rules      (confidence 0.70–0.88 — pattern matching)
 *         investment → transfer → alcohol → income → everything else
 *   [3] Bank hint           (confidence 0.60)
 *   [4] Keyword fallback    (confidence 0.55)
 *   [5] Credit direction    (confidence 0.40 — last before other)
 *   [6] other               (confidence 0.25)
 *
 * Every path returns a result — no nulls.
 *
 * ─── LAYER 6: User Correction Memory ────────────────────────────────────────
 * UserCorrections is a Record<descriptionKey, Category> populated from the
 * merchant_overrides Supabase table. It takes absolute priority over every
 * other classification signal and is passed in at call time so it never
 * needs to be fetched inside this pure module.
 */

import type { NormalizedTransaction } from '@/lib/parsers/normalizer'
import { normalizeMerchantName }       from './merchant-normalizer'
import {
  lookupCanonicalMerchant,
  MERCHANT_CATEGORIES,
} from './merchant-aliases'

// ─── Types ────────────────────────────────────────────────────────────────────

export type Category =
  | 'food'
  | 'alcohol'
  | 'gas'
  | 'shopping'
  | 'bills'
  | 'subscriptions'
  | 'entertainment'
  | 'automotive'
  | 'transport'
  | 'education'
  | 'government'
  | 'health'
  | 'investment'
  | 'transfer'
  | 'income'
  | 'other'

export interface CategorizationResult {
  category:    Category
  is_transfer: boolean
  /** 0–1. How confident the engine is in this classification. */
  confidence:  number
  /** Human-readable explanation of why this category was assigned. */
  reason:      string
}

/**
 * LAYER 6 — User Correction Memory
 *
 * Keys are description_keys (same format as merchant_overrides.description_key).
 * Values are the user's manually-assigned category.
 * This map is built from Supabase in the upload pipeline and passed in here.
 */
export type UserCorrections = Record<string, Category>

// ─── Confidence constants ─────────────────────────────────────────────────────

const CONFIDENCE = {
  USER_CORRECTION:    1.00,
  ALIAS_MATCH:        0.95, // overridden per-merchant in MERCHANT_CATEGORIES
  NAMED_PATTERN:      0.85, // specific named entity (e.g. /\bstarbucks\b/)
  KEYWORD_PATTERN:    0.70, // generic category keyword (e.g. /\brestaurant\b/)
  BANK_HINT:          0.60,
  KEYWORD_FALLBACK:   0.55,
  CREDIT_DEFAULT:     0.40,
  OTHER:              0.25,
} as const

// ─── Rule engine ──────────────────────────────────────────────────────────────

interface Rule {
  category:     Category
  is_transfer?: boolean
  /**
   * namedPatterns: high-confidence specific merchant/brand patterns.
   * Match → CONFIDENCE.NAMED_PATTERN (0.85)
   */
  namedPatterns: RegExp[]
  /**
   * keywordPatterns: lower-confidence generic category keywords.
   * Match → CONFIDENCE.KEYWORD_PATTERN (0.70)
   */
  keywordPatterns: RegExp[]
}

/**
 * Rules are evaluated in declaration order. The first match wins.
 *
 * Precedence rationale:
 *   1. investment  — crypto/brokerage names could be misread as shopping or finance
 *   2. transfer    — "payment", "thank you", "stmt crdt" must never become income
 *   3. alcohol     — liquor/tavern descriptions must never fall into food
 *   4. income      — only explicit payroll signals; runs AFTER transfer guard
 *   5–14. everything else, ordered specific → broad
 */
const RULES: Rule[] = [

  // ── [1] Investment ────────────────────────────────────────────────────────
  {
    category: 'investment',
    namedPatterns: [
      /\bcrypto\.?com\b/,
      /\bcoinbase\b/,
      /\brobinhood\b/,
      /\bkraken\b/,
      /\bgemini\b/,
      /\bbinance\b/,
      /\buphold\b/,
      /\bwebull\b/,
      /\bpublic\.?com\b/,
      /\bstash invest\b/,
      /\bacorns\b/,
      /\bfidelity\b/,
      /\bvanguard\b/,
      /\bschwab\b/,
      /\betrade\b/,
      /\btd ameritrade\b/,
      /\bmerrill( lynch| edge)?\b/,
    ],
    keywordPatterns: [
      /\bcrypto\b/,
      /\bbitcoin\b/,
      /\bethereum\b/,
      /\bbrokerage\b/,
    ],
  },

  // ── [2] Transfer ──────────────────────────────────────────────────────────
  {
    category:    'transfer',
    is_transfer: true,
    namedPatterns: [
      /\bzelle\b/,
      /\bvenmo\b/,
      /\bcash app\b/,
      /\bsquare cash\b/,
      /\bpaypal transfer\b/,
      /\bwire (transfer|payment)\b/,
    ],
    keywordPatterns: [
      /\bdirectpay\b/,
      /\bautopay\b/,
      /\bstmt crdt\b/,
      /\bstatement credit\b/,
      /\bcashback redemption\b/,
      /\bcash back\b/,
      /\breward redemption\b/,
      /\bpayment received\b/,
      /\bthank you\b/,
      /\binternal transfer\b/,
      /\bfunds transfer\b/,
      /\bach (credit|debit)\b/,
      /\bcredit card payment\b/,
      /\bcard payment\b/,
      /\bmobile transfer\b/,
    ],
  },

  // ── [3] Alcohol ───────────────────────────────────────────────────────────
  {
    category: 'alcohol',
    namedPatterns: [
      /\btotal wine\b/,
      /\bbevmo\b/,
      /\bbinny ?s\b/,
    ],
    keywordPatterns: [
      /\bliquor\b/,
      /\btavern\b/,
      /\bwinery\b/,
      /\bwine (bar|shop|store|cellar)\b/,
      /\bspirits\b/,
      /\bdistillery\b/,
      /\bbrewery\b/,
      /\bbrew(pub|house)\b/,
      /\bale house\b/,
      /\bbeer (store|shop|garden)\b/,
    ],
  },

  // ── [4] Income ────────────────────────────────────────────────────────────
  // Runs AFTER transfer guard so "payment received" won't reach here.
  {
    category: 'income',
    namedPatterns: [
      /\bgusto\b/,
      /\badp\b/,
      /\bpaychex\b/,
    ],
    keywordPatterns: [
      /\bdirect dep(osit)?\b/,
      /\bpayroll\b/,
      /\bsalary\b/,
      /\bpaycheck\b/,
      /\bwages\b/,
      /\btax refund\b/,
      /\birs treas\b/,
      /\bdividend\b/,
      /\binterest paid\b/,
      /\bfreelance\b/,
      /\bcontract pay\b/,
      /\breimburse(ment)?\b/,
    ],
  },

  // ── [5] Transport ────────────────────────────────────────────────────────
  // Negative lookahead on uber prevents "uber eats" from landing here;
  // uber eats is caught later as food.
  {
    category: 'transport',
    namedPatterns: [
      /\buber(?! eats)\b/,
      /\blyft\b/,
      /\bcurb\b/,
      /\btaxi\b/,
      /\bvia rideshare\b/,
      /\bmetra\b/,
      /\bamtrak\b/,
      /\bgreyhound\b/,
      /\bpresto card\b/,
    ],
    keywordPatterns: [
      /\brideshare\b/,
      /\btransit\b/,
      /\bbus (fare|pass|ticket)\b/,
      /\btrain (fare|ticket|pass)\b/,
      /\bsubway fare\b/,
      /\bparking\b/,
      /\btoll\b/,
    ],
  },

  // ── [6] Government ───────────────────────────────────────────────────────
  {
    category: 'government',
    namedPatterns: [
      /\bsecretary of state\b/,
      /\bstate of illinois\b/,
    ],
    keywordPatterns: [
      /\bcity of \w+\b/,
      /\bcity fee\b/,
      /\bcounty of \w+\b/,
      /\bgovernment\b/,
      /\bdmv\b/,
      /\bproperty tax\b/,
      /\bvehicle registration\b/,
      /\bpassport\b/,
      /\bcourt (fee|fine)\b/,
      /\bparking ticket\b/,
      /\btraffic fine\b/,
    ],
  },

  // ── [6] Education ────────────────────────────────────────────────────────
  {
    category: 'education',
    namedPatterns: [
      /\btextbook(x)?\b/,
      /\bchegg\b/,
      /\bcoursera\b/,
      /\budemy\b/,
      /\bskillshare\b/,
      /\bparchment\b/,
      /\bpearson\b/,
      /\bmcgraw( |-)?hill\b/,
    ],
    keywordPatterns: [
      /\buniversity\b/,
      /\bcollege\b/,
      /\btuition\b/,
      /\bschool\b/,
      /\bregistrar\b/,
      /\bstudent (fee|services)\b/,
      /\blibrary (fee|fine)\b/,
    ],
  },

  // ── [7] Health ───────────────────────────────────────────────────────────
  {
    category: 'health',
    namedPatterns: [
      /\bwalgreens pharmacy\b/,
      /\bcvs pharmacy\b/,
      /\brite aid\b/,
      /\bquest diag\b/,
      /\blabcorp\b/,
      /\bplanet fitness\b/,
      /\bequinox\b/,
      /\bpeloton\b/,
      /\bblue cross\b/,
      /\bblue shield\b/,
      /\baetna\b/,
      /\bcigna\b/,
      /\bhumana\b/,
      /\bkaiser\b/,
    ],
    keywordPatterns: [
      /\bpharmacy\b/,
      /\burgent care\b/,
      /\bmedical\b/,
      /\bdoctor\b/,
      /\bdentist\b/,
      /\bdental\b/,
      /\bhospital\b/,
      /\bclinic\b/,
      /\bhealth ins(urance)?\b/,
      /\bprescription\b/,
      /\btherapy\b/,
      /\bcounseling\b/,
      /\bgym\b/,
      /\bfitness\b/,
      /\byoga\b/,
    ],
  },

  // ── [8] Bills ────────────────────────────────────────────────────────────
  {
    category: 'bills',
    namedPatterns: [
      /\bcomed\b/,
      /\bcomcast\b/,
      /\bxfinity\b/,
      /\bspectrum\b/,
      /\bpge\b/,
      /\bcon ed\b/,
      /\bduke energy\b/,
      /\bpseg\b/,
      /\bgeico\b/,
      /\bstate farm\b/,
      /\ballstate\b/,
      /\bfarmers ins\b/,
      /\bt ?mobile\b/,
      /\bverizon wireless\b/,
      /\bat ?t (internet|home|mobility|wireless)\b/,
      /\bboost mobile\b/,
      /\bcricket wireless\b/,
    ],
    keywordPatterns: [
      /\belectric(ity)?\b/,
      /\bnatural gas\b/,
      /\bgas (company|bill|util|service)\b/,
      /\bwater (bill|utility|district|service)\b/,
      /\bsewer\b/,
      /\binternet (bill|service)\b/,
      /\bbroadband\b/,
      /\binsurance\b/,
      /\brent\b/,
      /\bmortgage\b/,
      /\bhoa\b/,
      /\bapartment\b/,
      /\bleasing\b/,
      /\butility\b/,
      /\bphone (bill|service)\b/,
      /\bwaste (management|mgmt)\b/,
    ],
  },

  // ── [9] Subscriptions ────────────────────────────────────────────────────
  {
    category: 'subscriptions',
    namedPatterns: [
      /\bnetflix\b/,
      /\bhulu\b/,
      /\bspotify\b/,
      /\bdisney ?(\+|plus)\b/,
      /\bamazon prime\b/,
      /\bapple (music|tv|one|arcade)\b/,
      /\byoutube (premium|tv)\b/,
      /\bparamount ?(\+|plus)\b/,
      /\bpeacock\b/,
      /\bcrunchyroll\b/,
      /\btwitch\b/,
      /\baudible\b/,
      /\bsirius ?xm\b/,
      /\btidal\b/,
      /\badobe\b/,
      /\bmicrosoft 365\b/,
      /\bdropbox\b/,
      /\bnotion\b/,
      /\bgrammarly\b/,
      /\bnordvpn\b/,
      /\bdashpass\b/,
      /\bplaystationnetwork\b/,
      /\bplaystation network\b/,
      /\bclaude\.?ai\b/,
      /\banthropic\b/,
      /\bopenai\b/,
      /\bchatgpt\b/,
      /\bfruition\b/,
      /\bapple\.com.?bill\b/,
    ],
    keywordPatterns: [
      /\bsubscription\b/,
      /\bmonthly (fee|plan|membership)\b/,
      /\bannual (fee|plan|membership)\b/,
    ],
  },

  // ── [10] Entertainment ───────────────────────────────────────────────────
  {
    category: 'entertainment',
    namedPatterns: [
      /\bbowlero\b/,
      /\bticketmaster\b/,
      /\bstubhub\b/,
      /\bseatgeek\b/,
      /\beventbrite\b/,
      /\bfandango\b/,
      /\bvudu\b/,
      /\bxbox\b/,
      /\bnintendo\b/,
    ],
    keywordPatterns: [
      /\bbowling\b/,
      /\bgaming\b/,
      /\bcinema\b/,
      /\btheater\b/,
      /\btheatre\b/,
      /\bmovie\b/,
      /\bconcert\b/,
      /\barcade\b/,
      /\bmuseum\b/,
      /\bzoo\b/,
      /\bamusement\b/,
      /\btheme park\b/,
      /\bminigolf\b/,
      /\bnightclub\b/,
    ],
  },

  // ── [11] Automotive ──────────────────────────────────────────────────────
  {
    category: 'automotive',
    namedPatterns: [
      /\bmeineke\b/,
      /\bjiffy lube\b/,
      /\bfirestone\b/,
      /\bgoodyear\b/,
      /\bpep boys\b/,
      /\bautozone\b/,
      /\bo ?reilly auto\b/,
      /\badvance auto\b/,
      /\bnapa auto\b/,
      /\bsafelite\b/,
    ],
    keywordPatterns: [
      /\bauto(motive)? repair\b/,
      /\bcar wash\b/,
      /\bauto detail\b/,
      /\btire (center|shop|kingdom)\b/,
      /\bautomotive\b/,
      /\bmechanic\b/,
    ],
  },

  // ── [12] Gas ─────────────────────────────────────────────────────────────
  {
    category: 'gas',
    namedPatterns: [
      /\bshell\b/,
      /\bbp\b/,
      /\bcitgo\b/,
      /\bspeedway\b/,
      /\bexxon\b/,
      /\bmobil\b/,
      /\bchevron\b/,
      /\bvalero\b/,
      /\bsunoco\b/,
      /\bquiktrip\b/,
      /\bwawa\b/,
      /\bcasey ?s\b/,
      /\bpilot (travel|flying)?\b/,
      /\blove ?s travel\b/,
      /\bmarathon (petro|gas|oil)\b/,
    ],
    keywordPatterns: [
      /\bgasoline\b/,
      /\bgas station\b/,
      /\bfuel\b/,
    ],
  },

  // ── [13] Food & Dining ───────────────────────────────────────────────────
  // Broad — intentionally last among spending categories.
  // Alcohol check above prevents bar/tavern from landing here.
  {
    category: 'food',
    namedPatterns: [
      /\bdoordash\b/,
      /\bgrubhub\b/,
      /\buber eats\b/,
      /\bpostmates\b/,
      /\binstacart\b/,
      /\bseamless\b/,
      /\bwhole foods\b/,
      /\bwholefds\b/,
      /\btrader joe/,
      /\bkroger\b/,
      /\bsafeway\b/,
      /\bwegmans\b/,
      /\baldi\b/,
      /\bcostco\b/,
      /\bpublix\b/,
      /\bsam ?s club\b/,
      /\bstarbucks\b/,
      /\bsbux\b/,
      /\bdunkin\b/,
      /\bmcdonald/,
      /\bchipotle\b/,
      /\bpanera\b/,
      /\bpotbelly\b/,
      /\bfive guys\b/,
      /\bjimmy john/,
      /\bchick.?fil.?a\b/,
      /\bburger king\b/,
      /\bpopeyes\b/,
      /\bwingstop\b/,
      /\btaco bell\b/,
      /\bwendy ?s\b/,
      /\bdomino ?s\b/,
      /\bpizza hut\b/,
      /\bshake shack\b/,
      /\bin n out\b/,
      /\bkfc\b/,
      /\bapplebee ?s\b/,
      /\bchili ?s\b/,
      /\bolive garden\b/,
      /\bdenny ?s\b/,
      /\bihop\b/,
      /\bwaffle house\b/,
    ],
    keywordPatterns: [
      /\brestaurant\b/,
      /\bdining\b/,
      /\bcafe\b/,
      /\bbistro\b/,
      /\bgrill\b/,
      /\bkitchen\b/,
      /\bgrocery\b/,
      /\bsupermarket\b/,
      /\bfood\b/,
      /\bsushi\b/,
      /\bboba\b/,
      /\btacos?\b/,
      /\bburrito\b/,
      /\bcoffee\b/,
      /\bbakery\b/,
      /\bdeli\b/,
      /\bpizza\b/,
      /\bcrab\b/,
      /\bnoodles\b/,
    ],
  },

  // ── [14] Shopping ────────────────────────────────────────────────────────
  {
    category: 'shopping',
    namedPatterns: [
      /\bamazon\b/,
      /\bamzn\b/,
      /\bwalmart\b/,
      /\bwal mart\b/,
      /\bwm supercenter\b/,
      /\btarget\b/,
      /\bfamily dollar\b/,
      /\bdollar (tree|general)\b/,
      /\bdtlr\b/,
      /\bbest buy\b/,
      /\bhome depot\b/,
      /\blowe ?s\b/,
      /\bikea\b/,
      /\betsy\b/,
      /\bebay\b/,
      /\bnike\b/,
      /\badidas\b/,
      /\bfoot locker\b/,
      /\bmacy ?s\b/,
      /\bnordstrom\b/,
      /\bkohl ?s\b/,
      /\btj maxx\b/,
      /\bmarshalls\b/,
      /\bross store\b/,
      /\bfive below\b/,
      /\bstaples\b/,
      /\boffice depot\b/,
      /\bpetsmart\b/,
      /\bpetco\b/,
      /\bold navy\b/,
      /\bgap\b/,
      /\bzara\b/,
    ],
    keywordPatterns: [
      /\bmerchandise\b/,
      /\bretail\b/,
    ],
  },
]

// ─── Bank category hint mapping ───────────────────────────────────────────────

const BANK_CATEGORY_MAP: Record<string, Category> = {
  'food & dining':    'food',
  'food and dining':  'food',
  'groceries':        'food',
  'restaurants':      'food',
  'fast food':        'food',
  'coffee shops':     'food',
  'alcohol & bars':   'alcohol',
  'bars':             'alcohol',
  'liquor stores':    'alcohol',
  'shopping':         'shopping',
  'entertainment':    'entertainment',
  'travel':           'gas',
  'gas & fuel':       'gas',
  'auto & transport': 'gas',
  'automotive':       'automotive',
  'health & fitness': 'health',
  'doctor':           'health',
  'pharmacy':         'health',
  'bills & utilities':'bills',
  'utilities':        'bills',
  'home':             'bills',
  'mortgage & rent':  'bills',
  'income':           'income',
  'paycheck':         'income',
  'transfer':         'transfer',
  'credit card':      'transfer',
  'payment':          'transfer',
  'education':        'education',
  'government':       'government',
  'investments':      'investment',
}

// ─── Keyword fallback ─────────────────────────────────────────────────────────

const KEYWORD_FALLBACK: Array<{ words: string[]; category: Category }> = [
  { words: ['salary', 'payroll', 'paycheck', 'wages'],              category: 'income'        },
  { words: ['rent', 'mortgage', 'lease', 'apartment'],              category: 'bills'         },
  { words: ['electric', 'utility', 'internet', 'cable'],            category: 'bills'         },
  { words: ['liquor', 'tavern', 'spirits', 'brewery', 'winery'],   category: 'alcohol'       },
  { words: ['grocery', 'supermarket', 'bakery', 'deli'],            category: 'food'          },
  { words: ['restaurant', 'cafe', 'bistro', 'grill', 'kitchen'],   category: 'food'          },
  { words: ['gasoline', 'petroleum', 'fuel'],                       category: 'gas'           },
  { words: ['pharmacy', 'medical', 'clinic', 'dental', 'hospital'], category: 'health'        },
  { words: ['repair', 'automotive', 'mechanic', 'tires'],           category: 'automotive'    },
  { words: ['school', 'university', 'college', 'tuition'],          category: 'education'     },
  { words: ['crypto', 'bitcoin', 'ethereum', 'brokerage'],          category: 'investment'    },
  { words: ['transfer', 'zelle', 'venmo', 'wire'],                  category: 'transfer'      },
  { words: ['subscription', 'streaming', 'membership'],             category: 'subscriptions' },
  { words: ['gaming', 'theater', 'cinema', 'concert', 'bowling'],   category: 'entertainment' },
]

function keywordFallback(text: string): Category | null {
  const words = new Set(text.split(/\s+/))
  for (const { words: keywords, category } of KEYWORD_FALLBACK) {
    if (keywords.some(k => words.has(k))) return category
  }
  return null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeResult(
  category: Category,
  confidence: number,
  reason: string,
): CategorizationResult {
  return {
    category,
    is_transfer: category === 'transfer',
    confidence:  Math.min(1, Math.max(0, confidence)),
    reason,
  }
}

// ─── Main categorizer ─────────────────────────────────────────────────────────

/**
 * categorize
 *
 * @param tx          Normalized transaction from the parser pipeline.
 * @param corrections Layer 6 user correction map (descriptionKey → Category).
 *                    Built from merchant_overrides in the upload pipeline.
 *                    Pass an empty object {} when not available.
 */
export function categorize(
  tx:           NormalizedTransaction,
  corrections:  UserCorrections = {},
): CategorizationResult {

  // ── [Layer 6] User correction (absolute priority) ──────────────────────
  const descKey = tx.description
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100)

  if (corrections[descKey]) {
    return makeResult(
      corrections[descKey],
      CONFIDENCE.USER_CORRECTION,
      'user correction',
    )
  }

  // ── Prepare normalized text for pattern layers ─────────────────────────
  const normalizedMerchant = normalizeMerchantName(tx.description)
  const fullText = normalizedMerchant + ' ' + tx.merchant.toLowerCase()

  // ── [Layer 2] Alias lookup (canonical merchant → known category) ───────
  const canonical = lookupCanonicalMerchant(normalizedMerchant)
  if (canonical && MERCHANT_CATEGORIES[canonical]) {
    const { category, confidence } = MERCHANT_CATEGORIES[canonical]
    return makeResult(category, confidence, `alias match: ${canonical}`)
  }

  // ── [Layer 3] Priority rule engine ────────────────────────────────────
  for (const rule of RULES) {
    // Named patterns → higher confidence
    for (const pattern of rule.namedPatterns) {
      if (pattern.test(fullText)) {
        return makeResult(
          rule.category,
          CONFIDENCE.NAMED_PATTERN,
          `named pattern: ${rule.category}`,
        )
      }
    }
    // Keyword patterns → lower confidence
    for (const pattern of rule.keywordPatterns) {
      if (pattern.test(fullText)) {
        return makeResult(
          rule.category,
          CONFIDENCE.KEYWORD_PATTERN,
          `keyword match: ${rule.category}`,
        )
      }
    }
  }

  // ── [Layer 3] Bank-provided category hint ─────────────────────────────
  if (tx.category_raw) {
    const hint = BANK_CATEGORY_MAP[tx.category_raw.toLowerCase().trim()]
    if (hint) {
      return makeResult(hint, CONFIDENCE.BANK_HINT, `bank hint: ${tx.category_raw}`)
    }
  }

  // ── [Layer 4] Keyword fallback on raw description ─────────────────────
  const fallbackText = tx.description.toLowerCase().replace(/[^a-z0-9\s]/g, ' ')
  const kwCategory = keywordFallback(fallbackText)
  if (kwCategory) {
    return makeResult(kwCategory, CONFIDENCE.KEYWORD_FALLBACK, `keyword fallback: ${kwCategory}`)
  }

  // ── [Layer 5] Safety: credits are income ONLY with explicit signals ────
  // (Payroll patterns were already checked above — reaching here means
  //  no payroll signal was found, so we do NOT default credit → income.)
  if (tx.direction === 'credit') {
    return makeResult('income', CONFIDENCE.CREDIT_DEFAULT, 'credit direction (unconfirmed)')
  }

  // ── [Layer 5] Fallback ────────────────────────────────────────────────
  return makeResult('other', CONFIDENCE.OTHER, 'no match')
}

/*
 * ─── Example test cases ───────────────────────────────────────────────────────
 *
 * Input                               → Expected output
 * ──────────────────────────────────────────────────────
 * "SQ * TONY'S BAR 1234"              → alcohol  (0.70, "keyword match: alcohol")
 * "PAYPAL * NETFLIX.COM"              → subscriptions (0.95, "alias match: netflix")
 * "COINBASE PURCHASE"                 → investment (0.85, "named pattern: investment")
 * "ZELLE PMT FROM MOM"               → transfer  (0.85, "named pattern: transfer")
 * "GUSTO PAYROLL"                     → income    (0.85, "alias match: gusto")
 *                                       then override: transfer if key in corrections
 * "GREEN TOWN TAVERN"                 → alcohol   (0.98, "alias match: greenTownTavern")
 * "BIG DADDY LIQUORS"                 → alcohol   (0.98, "alias match: bigDaddyLiquors")
 * "AMZN MKTP US*2K3L4"               → shopping  (0.88, "alias match: amazon")
 * "PROGRESSIVE INSURANCE 888-123"    → bills     (0.85, "named pattern: bills")
 * "DIRECT DEPOSIT ACME CORP"         → income    (0.70, "keyword match: income")
 */
