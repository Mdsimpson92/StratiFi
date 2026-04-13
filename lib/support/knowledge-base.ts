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

  // ── Financial Health Score ──────────────────────────────────────────────────
  {
    id:       'score_what',
    category: 'general',
    keywords: ['score', 'financial health', 'what is', 'how', 'work'],
    answer:   'Your Financial Health Score is a 0–100 rating based on 6 measurable factors: emergency fund coverage (25%), debt-to-income ratio (20%), cash flow margin (20%), savings rate (15%), total debt load (10%), and retirement readiness (10%). Each factor is scored individually, then weighted to produce your overall score. Higher is better.',
    shouldEscalate: false,
  },
  {
    id:       'score_improve',
    category: 'general',
    keywords: ['improve', 'raise', 'increase', 'score', 'higher'],
    answer:   'To improve your score, focus on the Top 3 Actions on your Overview tab — they are ranked by impact. The most common ways to improve: build your emergency fund to 3+ months of expenses, reduce your debt-to-income ratio below 15%, and increase your monthly free cash flow.',
    shouldEscalate: false,
  },
  {
    id:       'score_update',
    category: 'general',
    keywords: ['score', 'update', 'change', 'recalculate', 'refresh'],
    answer:   'Your score updates whenever you update your financial profile. Go to the onboarding page to update your income, expenses, debt, and savings. The score will recalculate immediately.',
    shouldEscalate: false,
  },

  // ── Demo Mode ──────────────────────────────────────────────────────────────
  {
    id:       'demo_what',
    category: 'general',
    keywords: ['demo', 'sample', 'fake', 'simulated', 'test data'],
    answer:   'Demo mode shows simulated financial data so you can explore all features before connecting your own accounts. To switch to real data, upload a CSV from your bank or connect your bank account via Plaid. Demo mode turns off automatically once you add real data.',
    shouldEscalate: false,
  },
  {
    id:       'demo_exit',
    category: 'general',
    keywords: ['exit', 'leave', 'demo', 'real data', 'stop demo'],
    answer:   'To exit demo mode, either upload a bank CSV (go to the Transactions page) or connect your bank account (tap Connect Bank in the demo banner). Once real transactions are loaded, demo mode turns off automatically and your dashboard shows your actual financial data.',
    shouldEscalate: false,
  },

  // ── Allocation ─────────────────────────────────────────────────────────────
  {
    id:       'allocation_what',
    category: 'general',
    keywords: ['allocation', 'net worth', 'distribution', 'money', 'where'],
    answer:   'The Allocation tab shows how your money is distributed across emergency fund, retirement savings, and debt — with clear targets for each. It also shows your monthly cash flow (income vs expenses) and provides guidance on where to direct your surplus.',
    shouldEscalate: false,
  },
  {
    id:       'allocation_target',
    category: 'general',
    keywords: ['target', 'goal', 'how much', 'should', 'save', 'emergency fund'],
    answer:   'StratiFi sets targets based on financial best practices: Emergency Fund target is 6 months of expenses. Retirement target is based on your age and income (roughly 1x salary by 30, 3x by 40). Debt target is always $0. Your Allocation tab shows progress toward each.',
    shouldEscalate: false,
  },

  // ── CSV Upload ─────────────────────────────────────────────────────────────
  {
    id:       'csv_how',
    category: 'general',
    keywords: ['upload', 'csv', 'file', 'import', 'transactions'],
    answer:   'Go to the Transactions page (link in the top nav or demo banner). Click the upload area and select a CSV file exported from your bank. StratiFi auto-detects formats from Chase, Bank of America, Capital One, Wells Fargo, Mint, and others. Transactions are categorized automatically.',
    shouldEscalate: false,
  },
  {
    id:       'csv_format',
    category: 'technical',
    keywords: ['csv', 'format', 'template', 'columns', 'headers'],
    answer:   'StratiFi accepts CSV files with columns for date, description/merchant, and amount. Most bank exports work automatically. If your file has separate debit/credit columns, that works too. The system auto-detects the format — no template needed.',
    shouldEscalate: false,
  },
  {
    id:       'csv_error',
    category: 'technical',
    keywords: ['upload', 'error', 'failed', 'csv', 'processing'],
    answer:   "If your CSV upload fails, check that: 1) The file is a .csv (not .xlsx or .pdf), 2) It has valid dates and amounts, 3) It's under 5MB. Try downloading a fresh export from your bank. If it still fails, use the 'Contact Support' button with the error message.",
    shouldEscalate: false,
  },

  // ── Top Actions ────────────────────────────────────────────────────────────
  {
    id:       'actions_what',
    category: 'general',
    keywords: ['actions', 'top actions', 'what should i do', 'recommendations'],
    answer:   'Top Actions are the 3 highest-impact things you can do right now to improve your finances. They are ranked by urgency and based on your actual spending data and financial profile. Each action is specific and quantified — not generic advice like "spend less."',
    shouldEscalate: false,
  },

  // ── Expenses ───────────────────────────────────────────────────────────────
  {
    id:       'expenses_pie',
    category: 'general',
    keywords: ['pie chart', 'spending', 'category', 'breakdown', 'expenses'],
    answer:   'The Expenses tab shows your spending broken down by category in a pie chart. Tap any slice to see the total spent, number of transactions, and average amount for that category (Pro feature). Below the chart, you can see detected subscriptions and waste flags.',
    shouldEscalate: false,
  },
  {
    id:       'expenses_waste',
    category: 'general',
    keywords: ['waste', 'unused', 'subscription', 'cancel', 'saving'],
    answer:   'StratiFi flags subscriptions as potential waste when no charge has been detected in 45+ days, or when you have duplicate services (like multiple streaming or cloud storage subscriptions). Review these in the Expenses tab under "Subscriptions & Money Leaks."',
    shouldEscalate: false,
  },

  // ── General app ────────────────────────────────────────────────────────────
  {
    id:       'app_what',
    category: 'general',
    keywords: ['what', 'stratifi', 'app', 'does', 'about'],
    answer:   'StratiFi is a financial health dashboard that helps you understand your full financial picture. It calculates a Financial Health Score, identifies waste, generates clear actions to improve your finances, and tracks your progress. Connect your bank or upload transactions to get started.',
    shouldEscalate: false,
  },
  {
    id:       'app_free_vs_pro',
    category: 'billing',
    keywords: ['free', 'pro', 'difference', 'features', 'plan'],
    answer:   'Free tier includes: your overall score, 1 top action, cashflow summary, spending pie chart, subscription list, and net worth. Pro unlocks: full score breakdown, all 3 actions, alert details, cashflow monthly table, category drill-down, waste flags, allocation targets, and upcoming charges.',
    shouldEscalate: false,
  },
  {
    id:       'app_mobile',
    category: 'general',
    keywords: ['mobile', 'phone', 'app', 'download', 'ios', 'android'],
    answer:   'StratiFi works as a web app on any device. On iPhone/iPad, open the site in Safari, tap the Share button, then "Add to Home Screen" to install it like a native app. On Android, tap the menu button and "Install app." No app store download needed.',
    shouldEscalate: false,
  },

  // ── Onboarding ─────────────────────────────────────────────────────────────
  {
    id:       'onboarding_what',
    category: 'general',
    keywords: ['onboarding', 'profile', 'setup', 'complete', 'get started'],
    answer:   'The onboarding profile collects your income, expenses, debt, savings, and financial goals across 5 quick steps. This data is used to calculate your Financial Health Score and generate personalized recommendations. You can update it anytime.',
    shouldEscalate: false,
  },

  // ── Contact / Human ────────────────────────────────────────────────────────
  {
    id:       'contact_human',
    category: 'general',
    keywords: ['human', 'person', 'talk', 'real', 'speak', 'agent', 'someone'],
    answer:   "I'll connect you with our support team right away. Please use the 'Contact Support' button below to send a message directly to our team.",
    shouldEscalate: true,
  },
  {
    id:       'contact_help',
    category: 'general',
    keywords: ['help', 'support', 'contact', 'reach', 'email'],
    answer:   "I'm here to help! Ask me about your score, actions, expenses, alerts, billing, or how to use any feature. If I can't answer your question, I'll connect you with our support team directly.",
    shouldEscalate: false,
  },
]
