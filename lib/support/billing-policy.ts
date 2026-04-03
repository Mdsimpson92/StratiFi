// ─── Schema ───────────────────────────────────────────────────────────────────

/**
 * A billing policy rule.
 *
 * signals: array of OR-groups — ALL groups must have at least one match.
 *   e.g. [['refund', 'money back'], ['charge', 'payment']]
 *   fires when (refund OR money back) AND (charge OR payment).
 *
 *   Single-group policies fire on any one term in that group.
 *
 * exclusions: if any exclusion term appears in the message, skip this policy.
 *   Used to prevent broader policies from shadowing more specific ones.
 *
 * action:
 *   'escalate' — return prescribed_response and force shouldEscalate: true.
 *   'inform'   — return prescribed_response with shouldEscalate: false.
 *                Claude is NOT called; this is a direct, authoritative answer.
 */

export type PolicyAction = 'escalate' | 'inform'

export interface BillingPolicy {
  id:                   string
  signals:              string[][]
  exclusions?:          string[]
  prescribed_response:  string
  action:               PolicyAction
  escalation_reason:    string  // logged server-side for analytics
}

// ─── Policy rules ─────────────────────────────────────────────────────────────
// Rules are evaluated in order — first match wins.
// More specific rules must appear before broader ones that share signal terms.

export const BILLING_POLICIES: BillingPolicy[] = [

  // ── 1. Duplicate charge ────────────────────────────────────────────────────
  // Checked first — "charged twice" overlaps with generic charge language.
  {
    id:     'billing_duplicate_charge',
    signals: [[
      'charged twice', 'double charged', 'duplicate charge', 'billed twice',
      'two charges', 'two payments', 'multiple charges', 'charged again',
    ]],
    prescribed_response:
      "A duplicate charge needs to be reviewed against your Stripe billing history immediately. " +
      "I'm escalating this to our support team — please use the 'Contact Support' button below and " +
      "include the approximate dates of the charges so we can locate them quickly.",
    action:            'escalate',
    escalation_reason: 'duplicate_charge',
  },

  // ── 2. Refund with cancellation ────────────────────────────────────────────
  // Must appear before the plain cancellation rule — "cancel + refund" is a
  // billing dispute, not a self-serve cancellation question.
  {
    id:     'billing_cancel_refund',
    signals: [
      ['cancel', 'cancellation', 'unsubscribe', 'stop subscription', 'end subscription'],
      ['refund', 'money back', 'reimburse', 'credit'],
    ],
    prescribed_response:
      "Cancellation refund requests need to be reviewed manually — I can't process them here. " +
      "I'm connecting you with our support team who will look at your billing history and billing period. " +
      "Please use the 'Contact Support' button below.",
    action:            'escalate',
    escalation_reason: 'cancellation_refund_request',
  },

  // ── 3. Refund request (standalone) ────────────────────────────────────────
  {
    id:     'billing_refund_request',
    signals: [[
      'refund', 'money back', 'reimburse', 'reimbursement', 'get my money',
    ]],
    prescribed_response:
      "Refund requests need to be reviewed by our team — I can't approve them here. " +
      "I'm connecting you with our support team who can look into your account and billing history. " +
      "Please use the 'Contact Support' button below.",
    action:            'escalate',
    escalation_reason: 'refund_request',
  },

  // ── 4. Active subscription but no Pro access ──────────────────────────────
  {
    id:     'billing_sub_no_access',
    signals: [
      ['paying', 'subscribed', 'subscription', 'being charged', 'active plan', 'annual plan', 'monthly plan'],
      ['no access', 'still free', 'features locked', 'not unlocked', "didn't unlock",
       'not upgraded', "don't have pro", 'not showing pro', 'not working pro'],
    ],
    prescribed_response:
      "If you're being charged but your account still shows as Free, your Stripe subscription may " +
      "not have synced with your StratiFi account. Try the 'Restore Pro access' button in Settings first. " +
      "If that doesn't work, use the 'Contact Support' button and our team will activate it manually.",
    action:            'escalate',
    escalation_reason: 'subscription_not_synced',
  },

  // ── 5. Failed upgrade / payment failure ───────────────────────────────────
  {
    id:     'billing_failed_upgrade',
    signals: [
      ['upgrade', 'subscribe', 'checkout', 'payment', 'purchase', 'sign up for pro', 'buy pro'],
      ['fail', 'failed', 'error', 'not working', "didn't work", 'declined',
       "didn't go through", "won't go through", 'problem', "can't complete"],
    ],
    prescribed_response:
      "If your upgrade attempt failed: first try a hard refresh (Cmd+Shift+R) and attempt again. " +
      "If it fails a second time, the issue is likely with the Stripe session and needs manual review. " +
      "Use the 'Contact Support' button — include whether you saw an error message or the page just hung.",
    action:            'escalate',
    escalation_reason: 'failed_upgrade_payment',
  },

  // ── 6. Unexpected / unrecognized charge ───────────────────────────────────
  {
    id:     'billing_unexpected_charge',
    signals: [
      ['charge', 'charged', 'payment', 'billed'],
      ['unexpected', "didn't authorize", 'unauthorized', "don't recognize", 'not authorized',
       "didn't sign up", "shouldn't be", 'wrong amount'],
    ],
    prescribed_response:
      "An unrecognized or unauthorized charge needs to be investigated against your Stripe billing " +
      "records right away. I'm escalating this to our support team — please use the 'Contact Support' button " +
      "and note the date and amount so we can locate the transaction.",
    action:            'escalate',
    escalation_reason: 'unexpected_charge',
  },

  // ── 7. Cancellation (self-serve — how to) ─────────────────────────────────
  // Broadest cancellation rule — appears last so cancel+refund hits rule 2 first.
  {
    id:     'billing_cancellation_howto',
    signals: [[
      'cancel', 'cancellation', 'how do i stop', 'stop my subscription',
      'end my subscription', 'unsubscribe', 'turn off subscription',
    ]],
    // Exclude refund language — that should be caught by rules 2 or 3 above
    exclusions: ['refund', 'money back', 'reimburse'],
    prescribed_response:
      "To cancel your Pro subscription: go to Settings → Account → Manage Subscription. " +
      "Your access continues until the end of the current billing period — you won't be charged again. " +
      "No action is needed on Stripe's side; cancellation takes effect automatically.",
    action:            'inform',
    escalation_reason: 'cancellation_howto',
  },
]

// ─── Billing policy matcher ───────────────────────────────────────────────────

function normalize(text: string): string {
  return text.toLowerCase().replace(/['']/g, "'")
}

function containsPhrase(msg: string, phrase: string): boolean {
  return msg.includes(normalize(phrase))
}

/**
 * Returns the first matching billing policy for the given user message,
 * or null if no policy fires.
 */
export function matchBillingPolicy(userMessage: string): BillingPolicy | null {
  const msg = normalize(userMessage)

  for (const policy of BILLING_POLICIES) {
    // All OR-groups must have at least one hit
    const allGroupsMatch = policy.signals.every(group =>
      group.some(term => containsPhrase(msg, term))
    )
    if (!allGroupsMatch) continue

    // Skip if any exclusion term is present
    if (policy.exclusions?.some(ex => containsPhrase(msg, ex))) continue

    return policy
  }

  return null
}

// ─── Billing policy context for system prompt ─────────────────────────────────
// Injected into Claude for cases that reach the AI (medium-tier KB + no-match).
// Reinforces the rules even when the policy detector doesn't fire.

export const BILLING_POLICY_PROMPT = `
BILLING POLICY — follow these exactly, no exceptions:
- Refund requests: never approve or discuss chances of approval. Always escalate to the support team.
- Duplicate charges: always escalate immediately. Ask the user for dates.
- Failed upgrade or payment declined: provide one self-help step (refresh + retry), then always escalate.
- Active Stripe subscription but Pro features still locked: suggest "Restore Pro access" in Settings first, then escalate if unresolved.
- Cancellation (how-to): direct to Settings → Account → Manage Subscription. No refunds for partial periods.
- Cancellation + refund request: always escalate — treat as a billing dispute.
- Unexpected or unrecognized charge: always escalate. Never speculate on what the charge might be.
Never promise a specific outcome for any billing case. Never quote policy exceptions.
Never reference a specific person by name. Always refer to "the support team" or "support."
`.trim()
