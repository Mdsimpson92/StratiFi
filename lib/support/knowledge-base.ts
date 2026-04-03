import type { SupportCategory } from '@/app/api/support/chat/route'

// ─── Schema ───────────────────────────────────────────────────────────────────

export interface KBEntry {
  id:             string
  category:       SupportCategory
  /** Lowercase tokens/phrases — all must be present for a perfect match */
  keywords:       string[]
  answer:         string
  shouldEscalate: boolean
}

// ─── Knowledge base ───────────────────────────────────────────────────────────
// Keep answers under 120 words. Use plain text — no markdown.
// Add keywords that a real user would naturally type, not internal jargon.

export const KB: KBEntry[] = [

  // ── Billing: pricing ────────────────────────────────────────────────────────
  {
    id:       'billing_pro_price',
    category: 'billing',
    keywords: ['cost', 'price', 'how much', 'pro'],
    answer:   'StratiFi Pro costs $9 per month or $79 per year — that works out to about $6.58/month on the annual plan. You can upgrade from the Settings tab or from any locked feature. Cancel anytime, no questions asked.',
    shouldEscalate: false,
  },
  {
    id:       'billing_what_is_pro',
    category: 'billing',
    keywords: ['what', 'pro', 'include', 'get'],
    answer:   'Pro unlocks: personalized spending recommendations, a daily safe-to-spend figure, 30-day cashflow forecast, upcoming bill detection, and push notification alerts for unusual activity. Free accounts still get spending insights, cashflow charts, and transaction categorization.',
    shouldEscalate: false,
  },
  {
    id:       'billing_cancel',
    category: 'billing',
    keywords: ['cancel', 'subscription'],
    answer:   'To cancel your Pro subscription, go to Settings → Account → Manage Subscription. Your Pro access continues until the end of the current billing period.',
    shouldEscalate: false,
  },
  {
    id:       'billing_refund',
    category: 'billing',
    keywords: ['refund', 'money back', 'charge'],
    answer:   "I can't process refunds directly, but I'll connect you with our support team who can review your account. Please use the 'Contact Support' button below.",
    shouldEscalate: true,
  },
  {
    id:       'billing_payment_failed',
    category: 'billing',
    keywords: ['payment', 'failed', 'declined', 'card'],
    answer:   "Payment failures are handled through Stripe. I'll escalate this to our support team who can look into it. Please use the 'Contact Support' button below.",
    shouldEscalate: true,
  },
  {
    id:       'billing_upgrade_how',
    category: 'billing',
    keywords: ['upgrade', 'how', 'subscribe', 'buy'],
    answer:   "To upgrade, go to Settings → Account → Upgrade to Pro, or tap any locked feature and click the upgrade button. You'll be taken to a secure Stripe checkout. It takes about 30 seconds.",
    shouldEscalate: false,
  },

  // ── App usage: safe-to-spend ─────────────────────────────────────────────────
  {
    id:       'usage_safe_to_spend',
    category: 'general',
    keywords: ['safe to spend', 'safe-to-spend'],
    answer:   "Safe-to-spend is your estimated discretionary budget for today. It's calculated as: projected monthly income minus fixed expenses (rent, subscriptions, bills) minus a savings buffer, divided by remaining days in the month. It updates daily as new transactions come in.",
    shouldEscalate: false,
  },
  {
    id:       'usage_cashflow',
    category: 'general',
    keywords: ['cashflow', 'cash flow', 'chart', 'graph'],
    answer:   'The cashflow chart shows your spending and income day by day over the current month. Bars above the line are income; bars below are spending. Hover or tap a bar for a daily breakdown. The forecast line (Pro) extends 30 days.',
    shouldEscalate: false,
  },
  {
    id:       'usage_recommendations',
    category: 'general',
    keywords: ['recommendation', 'suggestions', 'tips'],
    answer:   'Recommendations are personalized spending suggestions based on your transaction history. They appear on the Overview tab. This is a Pro feature — upgrade in Settings to unlock them.',
    shouldEscalate: false,
  },
  {
    id:       'usage_subscriptions_tab',
    category: 'general',
    keywords: ['subscriptions', 'recurring', 'tab'],
    answer:   "The Subscriptions tab shows charges that StratiFi has detected as recurring — monthly or annual. Items flagged as 'waste' are ones you haven't benefited from recently based on your usage patterns. You can dismiss flags if they're inaccurate.",
    shouldEscalate: false,
  },
  {
    id:       'usage_alerts',
    category: 'general',
    keywords: ['alert', 'notification', 'unusual', 'push'],
    answer:   'StratiFi can send push notifications when it detects unusual activity — large purchases, new recurring charges, or spending spikes. Go to the Alerts tab to see flagged activity and enable push notifications. Push alerts are a Pro feature.',
    shouldEscalate: false,
  },
  {
    id:       'usage_snapshot',
    category: 'general',
    keywords: ['snapshot', 'share', 'link', 'url'],
    answer:   "Money snapshots let you share a read-only view of your financial summary via a unique URL. Go to Overview → Share Snapshot. The link doesn't expose your bank credentials or transaction history — only the summary figures.",
    shouldEscalate: false,
  },
  {
    id:       'usage_forecast',
    category: 'general',
    keywords: ['forecast', '30 day', 'predict', 'future'],
    answer:   'The 30-day cashflow forecast (Pro) projects your spending and income for the next month based on your recurring charges and income patterns. It appears as a dotted line on the cashflow chart.',
    shouldEscalate: false,
  },

  // ── Account: bank connection ─────────────────────────────────────────────────
  {
    id:       'account_connect_bank',
    category: 'account',
    keywords: ['connect', 'bank', 'link', 'plaid'],
    answer:   'To connect a bank account, go to Settings → Connect Bank. This is optional — you can also upload CSV files from any bank. StratiFi uses Plaid for bank linking, a secure third-party service. Your bank credentials are never stored by StratiFi.',
    shouldEscalate: false,
  },
  {
    id:       'account_bank_not_syncing',
    category: 'technical',
    keywords: ['not updating', 'not syncing', 'old data', 'stale', 'outdated'],
    answer:   "If you connected via Plaid, transaction data syncs every 12–24 hours. Try relinking: Settings → Data Sources → Relink. If you uploaded a CSV, you can upload a newer file at any time from the Transactions page.",
    shouldEscalate: false,
  },
  {
    id:       'account_bank_error',
    category: 'technical',
    keywords: ['bank', 'error', 'connection', 'broken', 'failed', 'disconnect'],
    answer:   "Bank connection errors are usually resolved by relinking: go to Settings → Connect Bank → Relink. This re-authenticates with your bank through Plaid without deleting your transaction history.",
    shouldEscalate: false,
  },
  {
    id:       'account_change_email',
    category: 'account',
    keywords: ['change', 'email', 'password', 'username'],
    answer:   'Account credentials (email and password) are managed through Clerk, our authentication provider. Go to Settings → Account → Manage Profile to update your email or password.',
    shouldEscalate: false,
  },
  {
    id:       'account_delete',
    category: 'account',
    keywords: ['delete', 'close', 'remove', 'account'],
    answer:   "Account deletion needs to be handled manually to ensure your data is fully removed. I'll escalate this to our support team who will take care of it.",
    shouldEscalate: true,
  },
  {
    id:       'account_data_privacy',
    category: 'account',
    keywords: ['data', 'privacy', 'store', 'gdpr', 'my data'],
    answer:   'StratiFi stores your aggregated transaction data and spending summaries from any source you provide (bank link or CSV upload). Raw bank credentials are never stored — Plaid handles authentication if you link a bank. You can read the full Privacy Policy at stratifi.app/privacy.',
    shouldEscalate: false,
  },
  {
    id:       'account_security_concern',
    category: 'account',
    keywords: ['hacked', 'unauthorized', 'someone else', 'security', 'breach'],
    answer:   "This sounds like a security concern. I'm escalating this immediately — please use the 'Contact Support' button below and describe what you saw.",
    shouldEscalate: true,
  },
  {
    id:       'account_login_issue',
    category: 'account',
    keywords: ['login', 'sign in', 'can\'t log in', 'locked out', 'access'],
    answer:   'Login is handled by Clerk. If you\'re locked out, try "Forgot password" on the login screen. If you\'re still unable to access your account, use the \'Contact Support\' button and our team can look into it.',
    shouldEscalate: false,
  },

  // ── Troubleshooting ──────────────────────────────────────────────────────────
  {
    id:       'trouble_push_notifications',
    category: 'technical',
    keywords: ['push notification', 'notification', 'not receiving', 'not getting'],
    answer:   "Push notifications require browser permission. If you're not receiving them: 1) Check your browser notification settings for this site, 2) Go to Alerts tab and confirm push is enabled, 3) On iOS, StratiFi must be installed as a PWA (Add to Home Screen) to receive push notifications.",
    shouldEscalate: false,
  },
  {
    id:       'trouble_feature_not_working',
    category: 'technical',
    keywords: ['not working', 'broken', 'bug', 'error', 'issue'],
    answer:   "If something isn't working, try a hard refresh (Cmd+Shift+R / Ctrl+Shift+R). If the issue persists, note what you were doing and use the 'Contact Support' button — it helps to include the specific feature and what you expected to happen.",
    shouldEscalate: false,
  },
  {
    id:       'trouble_missing_transactions',
    category: 'technical',
    keywords: ['missing', 'transaction', 'not showing', 'disappeared'],
    answer:   "Missing transactions usually mean Plaid hasn't synced yet — this can take up to 24 hours for some banks. Try relinking (Settings → Connect Bank → Relink) to force a refresh. Pending transactions may not appear until they post.",
    shouldEscalate: false,
  },
  {
    id:       'trouble_wrong_category',
    category: 'technical',
    keywords: ['wrong category', 'miscategorized', 'wrong', 'category', 'categorization'],
    answer:   "Transaction categories come from Plaid based on merchant data. Manual recategorization isn't available yet — this is on the roadmap. If a category is significantly wrong, let us know via the 'Contact Support' button so it can be prioritized.",
    shouldEscalate: false,
  },
]
