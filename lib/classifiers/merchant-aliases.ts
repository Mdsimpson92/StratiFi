/**
 * LAYER 2 — Merchant Alias Map
 *
 * Maps canonical merchant names → arrays of normalized aliases.
 * Aliases are substrings checked against the Layer 1 normalized text.
 *
 * Each canonical merchant also has a known category and a confidence
 * score (0–1). Exact alias matches from this table are considered
 * more reliable than regex keyword matches.
 *
 * To add a new merchant:
 *   1. Add an entry to MERCHANT_ALIASES
 *   2. Add an entry to MERCHANT_CATEGORIES
 *
 * Aliases are ordered longest-first within each entry so the most
 * specific variant matches before a shorter one could false-positive.
 */

import type { Category } from './categorizer'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MerchantCategory {
  category:   Category
  /** Base confidence when matched via alias (0–1). */
  confidence: number
}

// ─── Alias map ────────────────────────────────────────────────────────────────
// key = canonical name  |  value = aliases (substrings of normalized text)

export const MERCHANT_ALIASES: Record<string, string[]> = {

  // ── Food ──────────────────────────────────────────────────────────────────
  starbucks:        ['starbucks', 'sbux'],
  mcdonalds:        ['mcdonalds', 'mc donalds', 'mcd '],
  chipotle:         ['chipotle'],
  subway:           ['subway'],
  doordash:         ['doordash', 'dd '],
  grubhub:          ['grubhub'],
  ubereats:         ['uber eats', 'ubereats'],
  instacart:        ['instacart'],
  wholeFoods:       ['whole foods', 'wholefds'],
  traderJoes:       ['trader joes', 'trader joe'],
  kroger:           ['kroger'],
  safeway:          ['safeway'],
  costco:           ['costco'],
  chicFilA:         ['chick fil a', 'chick-fil-a', 'chickfila'],
  panera:           ['panera'],
  dunkin:           ['dunkin'],
  dominos:          ['dominos', 'domino s'],
  pizzaHut:         ['pizza hut'],
  tacobell:         ['taco bell'],
  burgerKing:       ['burger king'],
  wendys:           ['wendys', 'wendy s'],
  paneraBreads:     ['panera bread'],
  fiveGuys:         ['five guys'],
  potbelly:         ['potbelly'],
  jimmyJohns:       ['jimmy johns', 'jimmy john'],
  wingstop:         ['wingstop'],
  popeyes:          ['popeyes'],
  shakeshack:       ['shake shack'],
  inNOut:           ['in n out'],
  dennys:           ['dennys', 'denny s'],

  // ── Alcohol ───────────────────────────────────────────────────────────────
  davesLiquors:     ['daves liquors', 'daves liquor'],
  bigDaddyLiquors:  ['big daddy liquors', 'big daddy liquor'],
  a1Wine:           ['a1 wine'],
  sevenStarLiquor:  ['seven star liquor'],
  waukeganLiquors:  ['waukegan liquors'],
  teepeeLiquors:    ['teepee liquors'],
  elSolAzteca:      ['el sol azteca'],
  greenTownTavern:  ['green town tavern'],
  totalWine:        ['total wine'],
  bevmo:            ['bevmo'],
  binnys:           ['binnys', 'binny s'],

  // ── Gas ───────────────────────────────────────────────────────────────────
  shell:            ['shell '],
  bp:               ['bp '],
  citgo:            ['citgo'],
  speedway:         ['speedway'],
  exxon:            ['exxon'],
  mobil:            ['mobil gas', 'exxon mobil', 'mobil station', 'mobil oil'],
  chevron:          ['chevron'],
  marathon:         ['marathon petro', 'marathon gas', 'marathon oil', 'marathon '],
  valero:           ['valero'],
  sunoco:           ['sunoco'],
  quiktrip:         ['quiktrip'],
  wawa:             ['wawa'],
  caseys:           ['caseys', 'casey s'],
  pilotTravel:      ['pilot travel', 'pilot flying'],

  // ── Shopping ──────────────────────────────────────────────────────────────
  amazon:           ['amazon', 'amzn', 'amazon mktp', 'amazon mktpl'],
  walmart:          ['walmart', 'wal mart', 'wm supercenter'],
  target:           ['target '],
  walgreens:        ['walgreens'],
  familydollar:     ['family dollar'],
  dollarTree:       ['dollar tree'],
  dollarGeneral:    ['dollar general'],
  bestBuy:          ['best buy'],
  homeDepot:        ['home depot'],
  lowes:            ['lowes', 'lowe s'],
  dtlr:             ['dtlr'],
  nike:             ['nike '],
  tjmaxx:           ['tj maxx', 'tjmaxx'],
  marshalls:        ['marshalls'],
  kohlss:           ['kohls', 'kohl s'],
  macys:            ['macys', 'macy s'],
  nordstrom:        ['nordstrom'],
  ikea:             ['ikea'],
  petco:            ['petco'],
  petsmart:         ['petsmart'],

  // ── Bills / Utilities ─────────────────────────────────────────────────────
  comed:            ['comed'],
  xfinity:          ['xfinity'],
  comcast:          ['comcast'],
  spectrum:         ['spectrum'],
  att:              ['at t', 'att'],
  tmobile:          ['t mobile', 'tmobile'],
  verizon:          ['verizon'],
  progressive:      ['progressive ins', 'progressive auto'],
  geico:            ['geico'],
  stateFarm:        ['state farm'],
  allstate:         ['allstate'],

  // ── Subscriptions ─────────────────────────────────────────────────────────
  netflix:          ['netflix'],
  spotify:          ['spotify'],
  hulu:             ['hulu'],
  disney:           ['disney plus', 'disney+', 'disney'],
  amazonPrime:      ['amazon prime'],
  appleOne:         ['apple one', 'apple music', 'apple tv', 'apple com', 'apple icloud', 'apple arcade', 'itunes'],
  youtube:          ['youtube premium', 'youtube tv'],
  claude:           ['claude ai', 'anthropic'],
  openai:           ['openai', 'chatgpt'],
  dashpass:         ['dashpass'],
  playstationNet:   ['playstationnetwork', 'playstation network', 'psn '],
  adobe:            ['adobe '],
  dropbox:          ['dropbox'],

  // ── Entertainment ─────────────────────────────────────────────────────────
  bowlero:          ['bowlero'],
  ticketmaster:     ['ticketmaster'],
  stubhub:          ['stubhub'],
  steam:            ['steam '],
  xbox:             ['xbox'],
  playstation:      ['playstation '],
  fandango:         ['fandango'],

  // ── Health ────────────────────────────────────────────────────────────────
  cvs:              ['cvs pharmacy', 'cvs '],
  riteaid:          ['rite aid'],
  planetFitness:    ['planet fitness'],
  equinox:          ['equinox'],

  // ── Transport ─────────────────────────────────────────────────────────────
  // Note: 'uber eats' / 'ubereats' intentionally excluded — handled as food above.
  uber:             ['uber trip', 'uber ride', 'uber* trip', 'uber -'],
  lyft:             ['lyft', 'lyft ride'],
  curb:             ['curb taxi', 'curb ride'],
  amtrak:           ['amtrak'],
  greyhound:        ['greyhound'],

  // ── Income ────────────────────────────────────────────────────────────────
  gusto:            ['gusto'],
  adp:              ['adp payroll', 'adp wage'],
  paychex:          ['paychex'],
  directDeposit:    ['direct deposit', 'direct dep'],
  payroll:          ['payroll deposit', 'payroll'],

  // ── Transfer ──────────────────────────────────────────────────────────────
  venmo:            ['venmo'],
  cashApp:          ['cash app', 'cash.app'],
  zelle:            ['zelle'],
  squareCash:       ['square cash'],

  // ── Automotive ────────────────────────────────────────────────────────────
  ripleyAuto:       ['ripley automotive'],
  celisCorp:        ['celis corp'],
  superExpress:     ['super express'],
  meineke:          ['meineke'],
  jiffylube:        ['jiffy lube'],
  firestone:        ['firestone'],
  autozone:         ['autozone'],

  // ── Investment ────────────────────────────────────────────────────────────
  coinbase:         ['coinbase', 'coinbase.com', 'cb '],
  cryptoCom:        ['crypto com', 'crypto.com'],
  robinhood:        ['robinhood'],
  kraken:           ['kraken '],
  gemini:           ['gemini '],
  binance:          ['binance'],
  uphold:           ['uphold'],
  fidelity:         ['fidelity'],
  vanguard:         ['vanguard'],
  schwab:           ['schwab'],

  // ── Education ─────────────────────────────────────────────────────────────
  textbookx:        ['textbookx', 'textbook x'],
  chegg:            ['chegg'],
  parchment:        ['parchment'],

  // ── Government ────────────────────────────────────────────────────────────
  secState:         ['secretary of state'],
  stateOfIL:        ['state of illinois'],
}

// ─── Merchant → Category map ──────────────────────────────────────────────────

export const MERCHANT_CATEGORIES: Record<string, MerchantCategory> = {
  // Food
  starbucks:       { category: 'food',          confidence: 0.95 },
  mcdonalds:       { category: 'food',          confidence: 0.95 },
  chipotle:        { category: 'food',          confidence: 0.95 },
  subway:          { category: 'food',          confidence: 0.95 },
  doordash:        { category: 'food',          confidence: 0.92 },
  grubhub:         { category: 'food',          confidence: 0.92 },
  ubereats:        { category: 'food',          confidence: 0.95 },
  instacart:       { category: 'food',          confidence: 0.90 },
  wholeFoods:      { category: 'food',          confidence: 0.95 },
  traderJoes:      { category: 'food',          confidence: 0.95 },
  kroger:          { category: 'food',          confidence: 0.95 },
  safeway:         { category: 'food',          confidence: 0.95 },
  costco:          { category: 'food',          confidence: 0.80 }, // also shopping
  chicFilA:        { category: 'food',          confidence: 0.95 },
  panera:          { category: 'food',          confidence: 0.95 },
  dunkin:          { category: 'food',          confidence: 0.95 },
  dominos:         { category: 'food',          confidence: 0.95 },
  pizzaHut:        { category: 'food',          confidence: 0.95 },
  tacobell:        { category: 'food',          confidence: 0.95 },
  burgerKing:      { category: 'food',          confidence: 0.95 },
  wendys:          { category: 'food',          confidence: 0.95 },
  paneraBreads:    { category: 'food',          confidence: 0.95 },
  fiveGuys:        { category: 'food',          confidence: 0.95 },
  potbelly:        { category: 'food',          confidence: 0.95 },
  jimmyJohns:      { category: 'food',          confidence: 0.95 },
  wingstop:        { category: 'food',          confidence: 0.95 },
  popeyes:         { category: 'food',          confidence: 0.95 },
  shakeshack:      { category: 'food',          confidence: 0.95 },
  inNOut:          { category: 'food',          confidence: 0.95 },
  dennys:          { category: 'food',          confidence: 0.95 },

  // Alcohol
  davesLiquors:    { category: 'alcohol',       confidence: 0.98 },
  bigDaddyLiquors: { category: 'alcohol',       confidence: 0.98 },
  a1Wine:          { category: 'alcohol',       confidence: 0.98 },
  sevenStarLiquor: { category: 'alcohol',       confidence: 0.98 },
  waukeganLiquors: { category: 'alcohol',       confidence: 0.98 },
  teepeeLiquors:   { category: 'alcohol',       confidence: 0.98 },
  elSolAzteca:     { category: 'alcohol',       confidence: 0.98 },
  greenTownTavern: { category: 'alcohol',       confidence: 0.98 },
  totalWine:       { category: 'alcohol',       confidence: 0.98 },
  bevmo:           { category: 'alcohol',       confidence: 0.98 },
  binnys:          { category: 'alcohol',       confidence: 0.98 },

  // Gas
  shell:           { category: 'gas',           confidence: 0.92 },
  bp:              { category: 'gas',           confidence: 0.92 },
  citgo:           { category: 'gas',           confidence: 0.95 },
  speedway:        { category: 'gas',           confidence: 0.95 },
  exxon:           { category: 'gas',           confidence: 0.95 },
  mobil:           { category: 'gas',           confidence: 0.92 },
  chevron:         { category: 'gas',           confidence: 0.95 },
  marathon:        { category: 'gas',           confidence: 0.90 },
  valero:          { category: 'gas',           confidence: 0.95 },
  sunoco:          { category: 'gas',           confidence: 0.95 },
  quiktrip:        { category: 'gas',           confidence: 0.90 },
  wawa:            { category: 'gas',           confidence: 0.88 }, // also food
  caseys:          { category: 'gas',           confidence: 0.90 },
  pilotTravel:     { category: 'gas',           confidence: 0.90 },

  // Shopping
  amazon:          { category: 'shopping',      confidence: 0.88 },
  walmart:         { category: 'shopping',      confidence: 0.90 },
  target:          { category: 'shopping',      confidence: 0.90 },
  walgreens:       { category: 'shopping',      confidence: 0.85 }, // also health
  familydollar:    { category: 'shopping',      confidence: 0.95 },
  dollarTree:      { category: 'shopping',      confidence: 0.95 },
  dollarGeneral:   { category: 'shopping',      confidence: 0.95 },
  bestBuy:         { category: 'shopping',      confidence: 0.95 },
  homeDepot:       { category: 'shopping',      confidence: 0.95 },
  lowes:           { category: 'shopping',      confidence: 0.95 },
  dtlr:            { category: 'shopping',      confidence: 0.95 },
  nike:            { category: 'shopping',      confidence: 0.95 },
  tjmaxx:          { category: 'shopping',      confidence: 0.95 },
  marshalls:       { category: 'shopping',      confidence: 0.95 },
  kohlss:          { category: 'shopping',      confidence: 0.95 },
  macys:           { category: 'shopping',      confidence: 0.95 },
  nordstrom:       { category: 'shopping',      confidence: 0.95 },
  ikea:            { category: 'shopping',      confidence: 0.95 },
  petco:           { category: 'shopping',      confidence: 0.90 },
  petsmart:        { category: 'shopping',      confidence: 0.90 },

  // Bills
  comed:           { category: 'bills',         confidence: 0.98 },
  xfinity:         { category: 'bills',         confidence: 0.98 },
  comcast:         { category: 'bills',         confidence: 0.98 },
  spectrum:        { category: 'bills',         confidence: 0.98 },
  att:             { category: 'bills',         confidence: 0.95 },
  tmobile:         { category: 'bills',         confidence: 0.98 },
  verizon:         { category: 'bills',         confidence: 0.95 },
  progressive:     { category: 'bills',         confidence: 0.95 },
  geico:           { category: 'bills',         confidence: 0.98 },
  stateFarm:       { category: 'bills',         confidence: 0.95 },
  allstate:        { category: 'bills',         confidence: 0.95 },

  // Subscriptions
  netflix:         { category: 'subscriptions', confidence: 0.98 },
  spotify:         { category: 'subscriptions', confidence: 0.98 },
  hulu:            { category: 'subscriptions', confidence: 0.98 },
  disney:          { category: 'subscriptions', confidence: 0.95 },
  amazonPrime:     { category: 'subscriptions', confidence: 0.95 },
  appleOne:        { category: 'subscriptions', confidence: 0.98 },
  youtube:         { category: 'subscriptions', confidence: 0.95 },
  claude:          { category: 'subscriptions', confidence: 0.98 },
  openai:          { category: 'subscriptions', confidence: 0.98 },
  dashpass:        { category: 'subscriptions', confidence: 0.98 },
  playstationNet:  { category: 'subscriptions', confidence: 0.98 },
  adobe:           { category: 'subscriptions', confidence: 0.98 },
  dropbox:         { category: 'subscriptions', confidence: 0.98 },

  // Entertainment
  bowlero:         { category: 'entertainment', confidence: 0.98 },
  ticketmaster:    { category: 'entertainment', confidence: 0.98 },
  stubhub:         { category: 'entertainment', confidence: 0.98 },
  steam:           { category: 'entertainment', confidence: 0.95 },
  xbox:            { category: 'entertainment', confidence: 0.95 },
  playstation:     { category: 'entertainment', confidence: 0.90 },
  fandango:        { category: 'entertainment', confidence: 0.98 },

  // Health
  cvs:             { category: 'health',        confidence: 0.88 },
  riteaid:         { category: 'health',        confidence: 0.95 },
  planetFitness:   { category: 'health',        confidence: 0.98 },
  equinox:         { category: 'health',        confidence: 0.98 },

  // Transport
  uber:            { category: 'transport',     confidence: 0.95 },
  lyft:            { category: 'transport',     confidence: 0.98 },
  curb:            { category: 'transport',     confidence: 0.95 },
  amtrak:          { category: 'transport',     confidence: 0.98 },
  greyhound:       { category: 'transport',     confidence: 0.98 },

  // Income
  gusto:           { category: 'income',        confidence: 0.98 },
  adp:             { category: 'income',        confidence: 0.98 },
  paychex:         { category: 'income',        confidence: 0.98 },
  directDeposit:   { category: 'income',        confidence: 0.95 },
  payroll:         { category: 'income',        confidence: 0.95 },

  // Transfer
  venmo:           { category: 'transfer',      confidence: 0.98 },
  cashApp:         { category: 'transfer',      confidence: 0.98 },
  zelle:           { category: 'transfer',      confidence: 0.98 },
  squareCash:      { category: 'transfer',      confidence: 0.98 },

  // Automotive
  ripleyAuto:      { category: 'automotive',    confidence: 0.98 },
  celisCorp:       { category: 'automotive',    confidence: 0.98 },
  superExpress:    { category: 'automotive',    confidence: 0.95 },
  meineke:         { category: 'automotive',    confidence: 0.98 },
  jiffylube:       { category: 'automotive',    confidence: 0.98 },
  firestone:       { category: 'automotive',    confidence: 0.98 },
  autozone:        { category: 'automotive',    confidence: 0.98 },

  // Investment
  coinbase:        { category: 'investment',    confidence: 0.99 },
  cryptoCom:       { category: 'investment',    confidence: 0.99 },
  robinhood:       { category: 'investment',    confidence: 0.99 },
  kraken:          { category: 'investment',    confidence: 0.99 },
  gemini:          { category: 'investment',    confidence: 0.99 },
  binance:         { category: 'investment',    confidence: 0.99 },
  uphold:          { category: 'investment',    confidence: 0.99 },
  fidelity:        { category: 'investment',    confidence: 0.95 },
  vanguard:        { category: 'investment',    confidence: 0.95 },
  schwab:          { category: 'investment',    confidence: 0.95 },

  // Education
  textbookx:       { category: 'education',     confidence: 0.98 },
  chegg:           { category: 'education',     confidence: 0.98 },
  parchment:       { category: 'education',     confidence: 0.98 },

  // Government
  secState:        { category: 'government',    confidence: 0.99 },
  stateOfIL:       { category: 'government',    confidence: 0.99 },
}

// ─── Lookup function ──────────────────────────────────────────────────────────

/**
 * lookupCanonicalMerchant
 *
 * Checks whether any alias for any canonical merchant appears
 * as a substring of the normalized text.
 *
 * Returns the canonical key (e.g., "netflix") or null.
 *
 * Performance note: alias lists are small enough that linear scan is fine
 * for < 10,000 transactions. For larger volumes, build an Aho-Corasick
 * automaton from MERCHANT_ALIASES at startup.
 */
export function lookupCanonicalMerchant(normalizedText: string): string | null {
  for (const [canonical, aliases] of Object.entries(MERCHANT_ALIASES)) {
    for (const alias of aliases) {
      if (normalizedText.includes(alias)) {
        return canonical
      }
    }
  }
  return null
}
