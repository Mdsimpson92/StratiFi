'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useClerk, useUser } from '@clerk/nextjs'
import { track, EVENTS } from '@/lib/telemetry'
import { encodeSnapshot, drawSnapshotCanvas } from '@/lib/snapshot'
import type { SnapshotData } from '@/lib/snapshot'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { usePlaidLink }  from 'react-plaid-link'
import SupportPanel      from '@/app/SupportPanel'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Insight {
  text: string
  type: string
  hint: string
  tab:  'overview' | 'subscriptions' | null
}

interface CashflowMonth {
  month:   string
  inflow:  number
  outflow: number
  net:     number
}

interface Cashflow {
  by_month:      CashflowMonth[]
  total_inflow:  number
  total_outflow: number
  net:           number
}

interface Pattern {
  normalized_merchant:      string
  transaction_count:        number
  average_amount:           number
  last_transaction_date:    string | null
  estimated_frequency_days: number | null
}

interface CategorySummary {
  category:          string
  total_spent:       number
  transaction_count: number
  average_amount:    number
}

interface Anomaly {
  id:                  string
  normalized_merchant: string
  amount:              number
  merchant_average:    number
  anomaly_ratio:       number
  transaction_date:    string | null
}

interface Subscription {
  normalized_merchant:      string
  average_amount:           number
  estimated_frequency_days: number | null
  estimated_monthly_cost:   number
  last_transaction_date:    string | null
  days_since_last:          number | null
  confidence:               number
}

interface SubscriptionData {
  subscriptions:      Subscription[]
  total_monthly_cost: number
  top_3:              Subscription[]
  waste_flags:        { merchant: string; reason: string }[]
}

interface UpcomingCharge {
  normalized_merchant: string
  expected_date:       string
  days_until:          number
  estimated_amount:    number
}

interface ForecastData {
  upcoming_charges:    UpcomingCharge[]
  projected_spend_30d: number
  projected_income_30d: number
  projected_net_30d:   number
}

interface Alert {
  alert_key:     string
  type:          string
  severity:      'low' | 'medium' | 'high'
  message:       string
  read:          boolean
  dismissed:     boolean
  trigger_event: string
  triggered_at:  string | null
  sent:          boolean
}

interface Recommendation {
  id:               string
  type:             string
  priority:         'low' | 'medium' | 'high'
  title:            string
  explanation:      string
  suggested_action: string
  savings_amount?:  number
}

interface CheckinData {
  safe_to_spend:  string | null
  changes:        string[]
  recommendation: string | null
}

interface AllocationData {
  net_worth:          number
  liquid_savings:     number
  retirement_savings: number
  total_debt:         number
  monthly_income:     number
  monthly_expenses:   number
  buckets: { label: string; value: number; target: number; color: string }[]
}

interface ScoreData {
  overall:              number
  emergency_fund_score: number
  debt_ratio_score:     number
  savings_rate_score:   number
  label:                string
  trend:                number
  calculated_at:        string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number | null | undefined) =>
  (n ?? 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' })

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [insights, setInsights]               = useState<Insight[]>([])
  const [expandedInsight, setExpandedInsight] = useState<string | null>(null)
  const [cashflow, setCashflow]               = useState<Cashflow | null>(null)
  const [patterns, setPatterns]               = useState<Pattern[]>([])
  const [anomalies, setAnomalies]             = useState<Anomaly[]>([])
  const [categories, setCategories]           = useState<CategorySummary[]>([])
  const [selectedCategory, setSelectedCategory] = useState<CategorySummary | null>(null)
  const [loading, setLoading]                 = useState(true)
  const [error, setError]                     = useState<string | null>(null)
  const [linkedAccounts, setLinkedAccounts]   = useState<{ institution_name: string | null }[]>([])
  const [subData, setSubData]                 = useState<SubscriptionData | null>(null)
  const [forecast, setForecast]               = useState<ForecastData | null>(null)
  const [alerts, setAlerts]                   = useState<Alert[]>([])
  const [recommendations, setRecommendations] = useState<Recommendation[]>([])
  const [scoreData, setScoreData]             = useState<ScoreData | null>(null)
  const [allocation, setAllocation]           = useState<AllocationData | null>(null)
  const [isPro, setIsPro]                     = useState(false)
  const [isDemo, setIsDemo]                   = useState(false)
  const [paywallEnabled, setPaywallEnabled]   = useState(false)
  const [upgrading, setUpgrading]             = useState(false)
  const [linkToken, setLinkToken]             = useState<string | null>(null)
  const [connecting, setConnecting]           = useState(false)
  const [syncing, setSyncing]                 = useState(false)
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | 'unsupported'>('default')
  const [subscribing, setSubscribing]         = useState(false)
  const [activeTab, setActiveTab]             = useState<'overview' | 'alerts' | 'subscriptions' | 'allocation' | 'settings'>('overview')
  const [isMobile, setIsMobile]               = useState(false)
  const [showIntro, setShowIntro]             = useState(false)
  const [firstRunStep, setFirstRunStep]       = useState(0)  // 0 = not active, 1-4 = guided steps
  const [firstRunSlider, setFirstRunSlider]   = useState(50)
  const [showDisableConfirm, setShowDisableConfirm] = useState(false)
  // 'idle'        — no post-checkout flow active
  // 'polling'     — detected ?upgraded=true, verifying Pro status with Stripe
  // 'confirmed'   — is_pro verified true, showing success banner
  // 'unconfirmed' — max retries hit without is_pro, showing softer pending message
  const [checkoutPhase, setCheckoutPhase] = useState<'idle' | 'polling' | 'confirmed' | 'unconfirmed'>('idle')
  // ── Conversion behavior ──────────────────────────────────────────────────────
  const [lastPromptAt, setLastPromptAt]         = useState<number | null>(null)
  const [shownTypes, setShownTypes]             = useState<string[]>([])
  const [contextualPrompt, setContextualPrompt] = useState<{ type: string; message: string } | null>(null)
  const [recViewCount, setRecViewCount]         = useState(0)
  const [showEndRecsCard, setShowEndRecsCard]   = useState(false)
  const [showSnapshotModal, setShowSnapshotModal] = useState(false)
  const [snapshotCopied, setSnapshotCopied]       = useState(false)
  const [checkin, setCheckin]                     = useState<CheckinData | null>(null)
  const [checkinDismissed, setCheckinDismissed]   = useState(false)
  const [dataLoadedAt, setDataLoadedAt]           = useState<Date | null>(null)
  const [showSafeCalc, setShowSafeCalc]           = useState(false)
  const [upgradeError, setUpgradeError]           = useState(false)
  const [restoringAccess, setRestoringAccess]     = useState(false)
  const [accessRestored, setAccessRestored]       = useState<'none' | 'success' | 'already_free' | 'error'>('none')
  const [isIOS, setIsIOS]                         = useState(false)
  const [isPWA, setIsPWA]                         = useState(false)
  const [bankError, setBankError]                 = useState(false)
  const [notifError, setNotifError]               = useState(false)
  const { signOut } = useClerk()
  const { user: clerkUser } = useUser()
  const firstName = clerkUser?.firstName || clerkUser?.emailAddresses?.[0]?.emailAddress?.split('@')[0] || ''
  const prevTabRef       = useRef<string>('overview')
  const teaserTrackedRef = useRef(false)

  useEffect(() => {
    // Intro plays every login — reinforces brand identity
    setShowIntro(true)
    const timer = setTimeout(() => {
      setShowIntro(false)
    }, 3000)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('upgraded') !== 'true') return

    // Strip the param immediately — refresh must not re-trigger this flow
    history.replaceState(null, '', window.location.pathname)
    track(EVENTS.POST_CHECKOUT_RETURNED, { user_plan: 'free', paywall_enabled: true })
    setCheckoutPhase('polling')

    let cancelled = false

    async function syncProStatus() {
      if (cancelled) return

      try {
        // Call sync endpoint — checks Stripe API directly, no webhook needed
        const syncRes = await fetch('/api/stripe/sync', { method: 'POST' })
        const syncData = await syncRes.json() as { is_pro?: boolean; synced?: boolean; paywall_enabled?: boolean }

        if (syncData?.is_pro === true) {
          setIsPro(true)
          setPaywallEnabled(syncData.paywall_enabled ?? false)
          setCheckoutPhase('confirmed')
          track(EVENTS.PRO_STATE_CONFIRMED, {
            user_plan:       'pro',
            paywall_enabled: syncData.paywall_enabled ?? false,
            source_surface:  'post_checkout_sync',
            attempt:          1,
          })
          setTimeout(() => setCheckoutPhase('idle'), 7_000)
          return
        }

        // Sync didn't find it yet — try once more after 2s
        if (cancelled) return
        await new Promise<void>(resolve => setTimeout(resolve, 2_000))
        if (cancelled) return

        const retryRes = await fetch('/api/stripe/sync', { method: 'POST' })
        const retryData = await retryRes.json() as { is_pro?: boolean; paywall_enabled?: boolean }

        if (retryData?.is_pro === true) {
          setIsPro(true)
          setPaywallEnabled(retryData.paywall_enabled ?? false)
          setCheckoutPhase('confirmed')
          setTimeout(() => setCheckoutPhase('idle'), 7_000)
          return
        }
      } catch {
        // Network error — fall through to unconfirmed
      }

      // Exhausted all attempts without confirmation.
      // Payment likely succeeded but webhook is delayed. Do not fake Pro state.
      if (!cancelled) {
        setCheckoutPhase('unconfirmed')
        setTimeout(() => setCheckoutPhase('idle'), 10_000)
      }
    }

    syncProStatus()

    // Cleanup: if this effect re-runs or the component unmounts, abandon
    return () => { cancelled = true }
  }, [])

  const onPlaidSuccess = useCallback(async (public_token: string, metadata: { institution?: { name?: string } | null }) => {
    setSyncing(true)
    await fetch('/api/plaid/exchange-token', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ public_token, institution_name: metadata.institution?.name }),
    })
    await fetch('/api/plaid/sync', { method: 'POST' })
    setSyncing(false)
    window.location.reload()
  }, [])

  const { open: openPlaidLink, ready: plaidReady } = usePlaidLink({
    token:     linkToken ?? '',
    onSuccess: onPlaidSuccess,
  })

  useEffect(() => {
    if (linkToken && plaidReady) openPlaidLink()
  }, [linkToken, plaidReady, openPlaidLink])

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setNotifPermission('unsupported')
    } else {
      setNotifPermission(Notification.permission)
    }
  }, [])

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    setIsIOS(/iphone|ipad|ipod/i.test(navigator.userAgent))
    setIsPWA(window.matchMedia('(display-mode: standalone)').matches)
  }, [])

  // ── Data source detection ──────────────────────────────────────────────────────
  const hasLinkedAccounts = linkedAccounts.length > 0
  const hasData           = insights.length > 0 || (cashflow?.by_month?.length ?? 0) > 0 || categories.length > 0

  // Adaptive source label — truthful to actual data origin
  const sourceLabel = isDemo
    ? 'Simulated data \u2014 upload transactions or connect a bank to see your real finances.'
    : hasLinkedAccounts
      ? 'Based on your linked account activity.'
      : hasData
        ? 'Based on your uploaded transaction data.'
        : ''

  // Demo users see all features unlocked (like Pro) so they experience the full product.
  // Once they add real data, they drop to free unless they pay for Pro.
  const canAccessPro = isPro || isDemo

  // ── Conversion helpers ────────────────────────────────────────────────────────
  const MIN_PROMPT_GAP = 90_000
  const isElevated = shownTypes.length > 0

  function canShow(type: string): boolean {
    if (canAccessPro || !paywallEnabled) return false
    return !shownTypes.includes(type)
  }

  function triggerContextual(type: string, message: string) {
    if (!canShow(type)) return
    track(EVENTS.LOCKED_FEATURE_INTERACTED, {
      user_plan:      'free',
      paywall_enabled: true,
      prompt_type:    type,
      source_surface: type === 'notifications' ? 'alerts' : 'recommendations',
    })
    setContextualPrompt({ type, message })
    setLastPromptAt(Date.now())
    setShownTypes(prev => [...prev, type])
  }

  // Track mobile overview visits for repeat-view escalation
  useEffect(() => {
    if (prevTabRef.current === activeTab) return
    prevTabRef.current = activeTab
    if (!paywallEnabled || canAccessPro || !isMobile) return
    if (activeTab === 'overview') setRecViewCount(prev => prev + 1)
  }, [activeTab, paywallEnabled, isPro, isDemo, isMobile])

  // Fire once when the locked teaser card first becomes visible
  useEffect(() => {
    if (teaserTrackedRef.current) return
    if (!paywallEnabled || canAccessPro || recommendations.length <= 1) return
    teaserTrackedRef.current = true
    track(EVENTS.RECOMMENDATIONS_TEASER_VIEWED, { user_plan: 'free', paywall_enabled: true, rec_count: recommendations.length })
  }, [paywallEnabled, isPro, isDemo, recommendations])

  // On second overview visit, show end-of-recs card immediately (skip the 30s wait)
  useEffect(() => {
    if (recViewCount < 2 || canAccessPro || !paywallEnabled || showEndRecsCard) return
    setShowEndRecsCard(true)
    setLastPromptAt(Date.now())
    setShownTypes(prev => prev.includes('end_recs') ? prev : [...prev, 'end_recs'])
  }, [recViewCount, isPro, isDemo, paywallEnabled, showEndRecsCard])

  // After 30s on overview, show end-of-recs card (once per session)
  useEffect(() => {
    if (canAccessPro || !paywallEnabled || showEndRecsCard) return
    if (isMobile && activeTab !== 'overview') return
    // Restart the timer whenever a prompt was recently shown (respects the gap)
    const wait = lastPromptAt !== null
      ? Math.max(30_000, MIN_PROMPT_GAP - (Date.now() - lastPromptAt))
      : 30_000
    const timer = setTimeout(() => {
      setShowEndRecsCard(true)
      setLastPromptAt(Date.now())
      setShownTypes(prev => prev.includes('end_recs') ? prev : [...prev, 'end_recs'])
    }, wait)
    return () => clearTimeout(timer)
  }, [activeTab, isPro, isDemo, paywallEnabled, showEndRecsCard, isMobile, lastPromptAt])

  async function confirmDisableNotifications() {
    setShowDisableConfirm(false)
    if (!('serviceWorker' in navigator)) return
    setSubscribing(true)
    try {
      const registration = await navigator.serviceWorker.getRegistration('/sw.js')
      if (registration) {
        const subscription = await registration.pushManager.getSubscription()
        if (subscription) {
          await fetch('/api/notifications/unsubscribe', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ endpoint: subscription.endpoint }),
          })
          await subscription.unsubscribe()
        }
      }
      setNotifPermission('default')
    } catch (err) {
      console.error('[push] unsubscribe failed', err)
    } finally {
      setSubscribing(false)
    }
  }

  async function handleEnableNotifications() {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) return
    setSubscribing(true)
    setNotifError(false)
    try {
      const permission = await Notification.requestPermission()
      setNotifPermission(permission)
      if (permission !== 'granted') return

      const registration = await navigator.serviceWorker.register('/sw.js')

      // Wait for SW to be ready, but bail after 5s to avoid hanging indefinitely
      await Promise.race([
        navigator.serviceWorker.ready,
        new Promise((_, reject) => setTimeout(() => reject(new Error('SW timeout')), 5000)),
      ])

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly:      true,
        applicationServerKey: urlBase64ToUint8Array(
          process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!
        ) as BufferSource,
      })

      const json = subscription.toJSON()
      const res = await fetch('/api/notifications/subscribe', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          endpoint: json.endpoint,
          keys:     json.keys,
        }),
      })
      if (!res.ok) throw new Error(`subscribe ${res.status}`)
    } catch (err) {
      console.error('[push] subscription failed', err)
      setNotifError(true)
    } finally {
      setSubscribing(false)
    }
  }

  async function handleAlertRead(alert_key: string) {
    setAlerts(prev => prev.map(a => a.alert_key === alert_key ? { ...a, read: true } : a))
    await fetch('/api/alerts/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ alert_key }),
    })
  }

  async function handleAlertDismiss(alert_key: string) {
    setAlerts(prev => prev.map(a => a.alert_key === alert_key ? { ...a, dismissed: true } : a))
    await fetch('/api/alerts/dismiss', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ alert_key }),
    })
  }

  // ── Snapshot helpers ──────────────────────────────────────────────────────────

  function buildSnapshot(): SnapshotData {
    const safeRec = recommendations.find(r => r.type === 'safe_to_spend_today')
    const topRec  = recommendations[0]
    const topIns  = insights[0]
    const date    = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    return {
      // Only include safe-to-spend for Pro users — free users see it blurred
      safe:    (canAccessPro || !paywallEnabled) && safeRec ? safeRec.suggested_action : null,
      // Recommendation title only — no dollar amounts from suggested_action
      rec:     topRec?.title ?? null,
      // First insight text — advisory summary, not raw transaction data
      insight: topIns?.text ?? null,
      date,
    }
  }

  async function handleShareLink() {
    const encoded = encodeSnapshot(buildSnapshot())
    const url     = `${window.location.origin}/snapshot?s=${encoded}`
    try {
      await navigator.clipboard.writeText(url)
      setSnapshotCopied(true)
      setTimeout(() => setSnapshotCopied(false), 2_500)
    } catch {
      // Clipboard API unavailable (non-HTTPS or denied) — fall back to prompt
      window.prompt('Copy this link:', url)
    }
  }

  function handleDownloadImage() {
    const canvas = document.createElement('canvas')
    drawSnapshotCanvas(canvas, buildSnapshot())
    const a       = document.createElement('a')
    a.href        = canvas.toDataURL('image/png')
    a.download    = 'stratifi-snapshot.png'
    a.click()
  }

  async function handleUpgrade(plan: 'monthly' | 'annual' = 'annual') {
    setUpgrading(true)
    setUpgradeError(false)
    try {
      const res  = await fetch('/api/stripe/checkout', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ plan }),
      })
      const data = await res.json()
      if (data.url) window.location.href = data.url
      else {
        console.error('[checkout] no redirect URL returned:', JSON.stringify(data))
        setUpgradeError(true)
      }
    } catch {
      console.error('[checkout] fetch failed')
      setUpgradeError(true)
    } finally {
      setUpgrading(false)
    }
  }

  async function handleRestoreAccess() {
    setRestoringAccess(true)
    setAccessRestored('none')
    try {
      const res  = await fetch('/api/stripe/sync', { method: 'POST' })
      if (!res.ok) throw new Error(`sync ${res.status}`)
      const data = await res.json() as { is_pro?: boolean; synced?: boolean }
      if (data.is_pro) {
        setIsPro(true)
        setAccessRestored('success')
      } else {
        setAccessRestored('already_free')
      }
    } catch {
      setAccessRestored('error')
    } finally {
      setRestoringAccess(false)
    }
  }

  async function handleConnectBank() {
    setConnecting(true)
    setBankError(false)
    try {
      const res  = await fetch('/api/plaid/create-link-token', { method: 'POST' })
      if (!res.ok) throw new Error(`link-token ${res.status}`)
      const data = await res.json()
      if (!data.link_token) throw new Error('no link_token')
      setLinkToken(data.link_token)
    } catch {
      setBankError(true)
      setConnecting(false)
    }
  }

  useEffect(() => {
    Promise.all([
      fetch('/api/insights').then(r          => r.json()),
      fetch('/api/cashflow').then(r          => r.json()),
      fetch('/api/patterns').then(r          => r.json()),
      fetch('/api/anomalies').then(r         => r.json()),
      fetch('/api/spending-summary').then(r  => r.json()),
      fetch('/api/plaid/accounts').then(r    => r.json()),
      fetch('/api/subscriptions').then(r     => r.json()),
      fetch('/api/forecast').then(r          => r.json()),
      fetch('/api/alerts').then(r            => r.json()),
      fetch('/api/recommendations').then(r    => r.json()),
      fetch('/api/stripe/subscription').then(r => r.json()),
      fetch('/api/score').then(r               => r.json()),
      fetch('/api/allocation').then(r          => r.json()),
    ])
      .then(([ins, cash, pat, ano, spend, plaid, subs, fc, alrt, recs, stripe, sc, alloc]) => {
        const resolvedPro      = stripe?.is_pro ?? false
        const resolvedPaywall  = stripe?.paywall_enabled ?? false
        const resolvedDemo     = stripe?.is_demo ?? false
        setIsPro(resolvedPro)
        setIsDemo(resolvedDemo)
        setPaywallEnabled(resolvedPaywall)
        if (resolvedPro && resolvedPaywall) {
          track(EVENTS.PRO_STATE_CONFIRMED, { user_plan: 'pro', paywall_enabled: true })
        }
        setInsights(Array.isArray(ins.insights) ? ins.insights : [])
        setCashflow(cash.by_month !== undefined ? cash : null)
        setPatterns(pat.patterns     ?? [])
        setAnomalies(ano.anomalies   ?? [])
        setCategories(spend.by_category ?? [])
        setLinkedAccounts(plaid.accounts ?? [])
        setSubData(subs.subscriptions !== undefined ? subs : null)
        setForecast(fc.upcoming_charges !== undefined ? fc : null)
        setAlerts(Array.isArray(alrt) ? alrt : [])
        setRecommendations(recs.recommendations ?? [])
        setScoreData(sc?.score ?? null)
        setAllocation(alloc?.allocation ?? null)
        setDataLoadedAt(new Date())
        // Trigger first-run guided experience for ALL new users
        if (typeof window !== 'undefined' && !localStorage.getItem('stratifi_onboarding_done')) {
          setFirstRunStep(1)
        }
      })
      .catch(() => setError('Failed to load dashboard data.'))
      .finally(() => setLoading(false))
  }, [])

  // ── Weekly check-in — fires once after initial data loads ────────────────────
  useEffect(() => {
    if (loading) return
    fetch('/api/checkin', { method: 'POST' })
      .then(r => r.json())
      .then((res: { due?: boolean; push_sent?: boolean; data?: CheckinData }) => {
        // Only show the in-app banner when due and push wasn't sent
        if (res.due && !res.push_sent && res.data) {
          setCheckin(res.data)
        }
      })
      .catch(() => { /* non-critical — silently ignore */ })
  }, [loading])

  return (
    <main style={styles.page} className="pwa-page">
      {showIntro ? (
        <div style={styles.introScreen}>
          <img src="/stratifi-logo.png" alt="StratiFi" style={styles.introLogo} />
          <p style={styles.introTagline}>Your financial operating system.</p>
        </div>
      ) : loading ? (
        <SkeletonDashboard />
      ) : error ? (
        <div style={styles.center}>{error}</div>
      ) : firstRunStep > 0 && firstRunStep <= 4 ? (
        <div style={FR_CONTAINER}>
          <img src="/stratifi-logo.png" alt="StratiFi" style={{ width: 140, height: 'auto', marginBottom: '1rem', mixBlendMode: 'multiply' as const }} />

          {/* ── Step 1: Financial Score ────────────────────────── */}
          {firstRunStep === 1 && (
            <div style={FR_CARD}>
              <p style={FR_STEP_LABEL}>SIMULATION MODE</p>
              <h2 style={FR_HEADING}>Your Financial Score</h2>
              <div style={{ position: 'relative', width: 160, height: 160, margin: '1.5rem auto' }}>
                <svg viewBox="0 0 120 120" width={160} height={160}>
                  <circle cx="60" cy="60" r={52} fill="none" stroke="#e5e7eb" strokeWidth="9" />
                  <circle cx="60" cy="60" r={52} fill="none" stroke={scoreData && scoreData.overall >= 65 ? '#2ab9b0' : '#f59e0b'} strokeWidth="9"
                    strokeDasharray={2 * Math.PI * 52} strokeDashoffset={2 * Math.PI * 52 * (1 - (scoreData?.overall ?? 68) / 100)}
                    strokeLinecap="round" transform="rotate(-90 60 60)" style={{ transition: 'stroke-dashoffset 1s ease-out' }} />
                </svg>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: '2.5rem', fontWeight: 800, color: '#1e3166' }}>{scoreData?.overall ?? 68}</span>
                </div>
              </div>
              <p style={FR_LABEL}>{scoreData?.label ?? 'Good'}</p>
              <p style={FR_BODY}>Based on 6 financial factors: emergency fund, debt ratio, cash flow, savings rate, debt load, and retirement readiness.</p>
              <button style={FR_BTN} onClick={() => setFirstRunStep(2)}>See What We Found</button>
            </div>
          )}

          {/* ── Step 2: Inefficiencies Detected ───────────────── */}
          {firstRunStep === 2 && (
            <div style={FR_CARD}>
              <p style={FR_STEP_LABEL}>SIMULATION MODE</p>
              <h2 style={FR_HEADING}>Issues Detected</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', margin: '1rem 0' }}>
                {recommendations.slice(0, 3).map((rec, i) => (
                  <div key={rec.id} style={FR_ISSUE}>
                    <span style={FR_ISSUE_NUM}>{i + 1}</span>
                    <div>
                      <p style={FR_ISSUE_TITLE}>{rec.title}</p>
                      <p style={FR_ISSUE_DESC}>{rec.explanation}</p>
                    </div>
                  </div>
                ))}
              </div>
              <button style={FR_BTN} onClick={() => setFirstRunStep(3)}>See Your Allocation</button>
              <button style={FR_BTN_GHOST} onClick={() => setFirstRunStep(1)}>Back</button>
            </div>
          )}

          {/* ── Step 3: Allocation + Interactive Slider ────────── */}
          {firstRunStep === 3 && allocation && (
            <div style={FR_CARD}>
              <p style={FR_STEP_LABEL}>SIMULATION MODE</p>
              <h2 style={FR_HEADING}>Recommended Allocation</h2>
              <p style={FR_BODY}>Adjust how much of your free cash goes toward savings vs debt payoff.</p>
              <div style={{ margin: '1.5rem 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', color: '#5b7a99', marginBottom: '0.5rem' }}>
                  <span>Savings: {firstRunSlider}%</span>
                  <span>Debt: {100 - firstRunSlider}%</span>
                </div>
                <input type="range" min={10} max={90} value={firstRunSlider} onChange={e => setFirstRunSlider(Number(e.target.value))}
                  style={{ width: '100%', accentColor: '#2ab9b0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.75rem' }}>
                  <div style={FR_ALLOC_BOX}>
                    <span style={FR_ALLOC_LABEL}>Savings</span>
                    <span style={FR_ALLOC_VAL}>{fmt((allocation.monthly_income - allocation.monthly_expenses) * firstRunSlider / 100)}/mo</span>
                  </div>
                  <div style={FR_ALLOC_BOX}>
                    <span style={FR_ALLOC_LABEL}>Debt Payoff</span>
                    <span style={FR_ALLOC_VAL}>{fmt((allocation.monthly_income - allocation.monthly_expenses) * (100 - firstRunSlider) / 100)}/mo</span>
                  </div>
                </div>
              </div>
              <button style={FR_BTN} onClick={() => setFirstRunStep(4)}>Lock It In</button>
              <button style={FR_BTN_GHOST} onClick={() => setFirstRunStep(2)}>Back</button>
            </div>
          )}

          {/* ── Step 4: Launch ─────────────────────────────────── */}
          {firstRunStep === 4 && (
            <div style={FR_CARD}>
              <p style={FR_STEP_LABEL}>SIMULATION MODE</p>
              <h2 style={FR_HEADING}>Your System Is Ready</h2>
              <div style={{ margin: '1rem 0', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div style={FR_READY_ROW}><span style={FR_CHECK}>&#10003;</span> Financial Score: {scoreData?.overall ?? 68}/100</div>
                <div style={FR_READY_ROW}><span style={FR_CHECK}>&#10003;</span> {recommendations.length} actions identified</div>
                <div style={FR_READY_ROW}><span style={FR_CHECK}>&#10003;</span> Allocation: {firstRunSlider}% savings / {100 - firstRunSlider}% debt</div>
                <div style={FR_READY_ROW}><span style={FR_CHECK}>&#10003;</span> Monitoring active</div>
              </div>
              <p style={FR_BODY}>This is a simulation. Connect your real data anytime to personalize everything.</p>
              <button style={FR_BTN} onClick={() => {
                localStorage.setItem('stratifi_onboarding_done', 'true')
                setFirstRunStep(0)
              }}>Launch Control Panel</button>
            </div>
          )}

          {/* Step indicator */}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem' }}>
            {[1,2,3,4].map(s => (
              <div key={s} style={{ width: 8, height: 8, borderRadius: '50%', background: s <= firstRunStep ? '#2ab9b0' : '#d1d5db' }} />
            ))}
          </div>
        </div>
      ) : (
        <>
      <div style={styles.header}>
        <img src="/stratifi-logo.png" alt="StratiFi" style={styles.logo} className="pwa-logo" onClick={() => window.location.reload()} />

        {/* ── Hero ──────────────────────────────────────────────────────── */}
        <h1 style={HERO_HEADLINE}>{firstName ? `Hello, ${firstName}` : 'Know exactly what you can spend today'}</h1>
        <p style={HERO_SUB}>Your financial operating system.</p>

        {!canAccessPro && (
          <button style={HERO_CTA} onClick={() => handleUpgrade()} disabled={upgrading}>
            {upgrading ? 'Redirecting…' : 'Upgrade to Pro'}
          </button>
        )}
        {!hasData && !isDemo && (
          <button
            style={HERO_CTA}
            onClick={() => setActiveTab('settings')}
          >
            Get Started
          </button>
        )}

        {dataLoadedAt && (
          <p style={DATA_FRESHNESS_LABEL}>
            Updated {dataLoadedAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
          </p>
        )}
        <button
          style={{ ...SHARE_BTN, right: isMobile ? '3.5rem' : '3.25rem' }}
          onClick={() => setShowSnapshotModal(true)}
          title="Share snapshot"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
          </svg>
          {!isMobile && <span style={{ marginLeft: '0.35rem' }}>Share</span>}
        </button>

        {isPro && !isDemo && (
          <span style={styles.proBadge}>Pro</span>
        )}
      </div>

      {checkoutPhase === 'polling' && (
        <div style={CHECKOUT_POLLING_BANNER}>
          <span style={CHECKOUT_SPINNER} /> Confirming your upgrade…
        </div>
      )}
      {checkoutPhase === 'confirmed' && (
        <div style={UPGRADE_SUCCESS_BANNER}>
          🎉 <strong>Welcome to Pro!</strong> Your full plan is now unlocked.
        </div>
      )}
      {checkoutPhase === 'unconfirmed' && (
        <div style={CHECKOUT_PENDING_BANNER}>
          ✓ <strong>Payment received.</strong> Pro access may take a moment to activate.{' '}
          <button
            style={UPGRADE_ERROR_RETRY}
            onClick={() => { setCheckoutPhase('idle'); handleRestoreAccess() }}
          >
            Sync now
          </button>
          {' '}or refresh the page in a few seconds.
        </div>
      )}

      {upgradeError && (
        <div style={UPGRADE_ERROR_BANNER}>
          Couldn't reach checkout — check your connection and{' '}
          <button style={UPGRADE_ERROR_RETRY} onClick={() => { setUpgradeError(false); handleUpgrade() }}>
            try again
          </button>
          {' '}or{' '}
          <button style={UPGRADE_ERROR_RETRY} onClick={() => setUpgradeError(false)}>
            dismiss
          </button>
        </div>
      )}

      {checkin && !checkinDismissed && (
        <div style={CHECKIN_BANNER}>
          <div style={CHECKIN_HEADER}>
            <span style={CHECKIN_TITLE}>Weekly check-in</span>
            <button style={CHECKIN_DISMISS} onClick={() => setCheckinDismissed(true)} aria-label="Dismiss">✕</button>
          </div>
          <div style={CHECKIN_BODY}>
            {checkin.safe_to_spend && (
              <div style={CHECKIN_ROW}><span style={CHECKIN_DOT_TEAL} />{checkin.safe_to_spend}</div>
            )}
            {checkin.changes.map((c, i) => (
              <div key={i} style={CHECKIN_ROW}><span style={CHECKIN_DOT_NAVY} />{c}</div>
            ))}
            {checkin.recommendation && (
              <div style={CHECKIN_ROW}><span style={CHECKIN_DOT_TEAL} />{checkin.recommendation}</div>
            )}
          </div>
        </div>
      )}

      {isDemo && (
        <div style={DEMO_BANNER}>
          <div style={DEMO_BANNER_TEXT}>
            <strong>Simulation Mode</strong> &mdash; You&rsquo;re viewing simulated data. Ready for real numbers?
          </div>
          <div style={DEMO_BANNER_ACTIONS}>
            <a href="/transactions" style={DEMO_BANNER_CTA}>Upload Your Data</a>
          </div>
        </div>
      )}

      {!isPro && (!isMobile || activeTab === 'overview' || activeTab === 'alerts') && (
        <UpgradeCard onUpgrade={handleUpgrade} upgrading={upgrading} elevated={isElevated} source="overview" />
      )}

      {/* ════ ALLOCATION TAB ════════════════════════════════════════════ */}
      {(!isMobile || activeTab === 'allocation') && !allocation && !isDemo && (
        <section style={SCORE_SECTION} className="pwa-section">
          <div style={{ textAlign: 'center', padding: '1rem 0' }}>
            <p style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1e3166', margin: '0 0 0.35rem' }}>See your financial allocation</p>
            <p style={{ fontSize: '0.85rem', color: '#5b7a99', margin: '0 0 1rem', lineHeight: 1.5 }}>
              Complete your profile to see how your money is distributed across savings, retirement, and debt — with targets and progress tracking.
            </p>
            <a href="/onboarding" style={HERO_CTA}>Complete Your Profile</a>
          </div>
        </section>
      )}
      {(!isMobile || activeTab === 'allocation') && allocation && (<>
      <section style={styles.section} className="pwa-section">
        <h2 style={styles.heading}>Financial Allocation</h2>
        <p style={SOURCE_NOTE}>Where your money sits today vs where it should be.</p>

        {/* Net worth header */}
        <div style={ALLOC_NET_WORTH}>
          <span style={ALLOC_NW_LABEL}>Net Worth</span>
          <span style={ALLOC_NW_VALUE}>{fmt(allocation.net_worth)}</span>
        </div>

        {/* Buckets: current vs target */}
        {canAccessPro ? (
          <div style={ALLOC_BUCKETS}>
            {allocation.buckets.map(b => {
              const isDebt = b.label === 'Debt'
              const pct = b.target > 0 ? Math.min(100, (b.value / b.target) * 100) : (isDebt && b.value > 0 ? 100 : 100)
              const status = isDebt
                ? (b.value === 0 ? 'On target' : `${fmt(b.value)} to pay off`)
                : (b.value >= b.target ? 'On target' : `${fmt(b.target - b.value)} to go`)
              const statusColor = (isDebt ? b.value === 0 : b.value >= b.target) ? '#059669' : '#d97706'
              return (
                <div key={b.label} style={ALLOC_BUCKET}>
                  <div style={ALLOC_BUCKET_HEADER}>
                    <span style={ALLOC_BUCKET_LABEL}>{b.label}</span>
                    <span style={{ ...ALLOC_BUCKET_STATUS, color: statusColor }}>{status}</span>
                  </div>
                  <div style={ALLOC_BUCKET_VALUES}>
                    <span style={ALLOC_BUCKET_CURRENT}>{fmt(b.value)}</span>
                    {!isDebt && <span style={ALLOC_BUCKET_TARGET}>Target: {fmt(b.target)}</span>}
                  </div>
                  <div style={ALLOC_BAR_BG}>
                    <div style={{
                      ...ALLOC_BAR_FILL,
                      width: `${Math.min(100, pct)}%`,
                      background: isDebt
                        ? (b.value === 0 ? '#059669' : b.color)
                        : (b.value >= b.target ? '#059669' : b.color),
                    }} />
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div style={styles.lockedCard}>
            <span style={styles.lockIcon}>{'\uD83D\uDD12'}</span>
            <div style={{ flex: 1 }}>
              <p style={{ margin: '0 0 0.15rem', fontWeight: 700, fontSize: '0.88rem', color: '#1e3166' }}>
                Allocation breakdown is Pro
              </p>
              <p style={{ margin: 0, fontSize: '0.78rem', color: '#6b7280' }}>
                See how your money is distributed across emergency fund, retirement, and debt — with targets and progress tracking.
              </p>
            </div>
            <LockedUpgradeBtn upgrading={upgrading} onClick={() => handleUpgrade()} />
          </div>
        )}
      </section>

      {/* Monthly flow summary */}
      {canAccessPro && (
      <section style={styles.section} className="pwa-section">
        <h2 style={styles.heading}>Monthly Flow</h2>
        <div style={styles.statRow} className="pwa-stat-row">
          <Stat label="Income"    value={fmt(allocation.monthly_income)}   color="#0d7878" />
          <Stat label="Expenses"  value={fmt(allocation.monthly_expenses)} color="#dc2626" />
          <Stat label="Free Cash" value={fmt(allocation.monthly_income - allocation.monthly_expenses)} color={allocation.monthly_income - allocation.monthly_expenses >= 0 ? '#0d7878' : '#dc2626'} />
        </div>
        <p style={ALLOC_GUIDANCE}>
          {allocation.monthly_income - allocation.monthly_expenses > 500
            ? 'You have strong free cash flow. Direct surplus toward your weakest allocation bucket above.'
            : allocation.monthly_income - allocation.monthly_expenses > 0
              ? 'Positive cash flow, but tight. Focus on building your emergency fund before other goals.'
              : 'You\u2019re spending more than you earn. Address this before allocating to savings or investments.'}
        </p>
      </section>
      )}
      </>)}

      {/* ════ SETTINGS TAB ═══════════════════════════════════════════════ */}
      {activeTab === 'settings' && (<>
      <section style={styles.section} className="pwa-section">
        <h2 style={styles.heading}>Data Sources</h2>
        {syncing ? (
          <p style={styles.empty}>Importing transactions…</p>
        ) : linkedAccounts.length > 0 ? (
          <div style={styles.connectedRow}>
            <div>
              {linkedAccounts.map((a, i) => (
                <div key={i} style={styles.connectedItem}>
                  ✓ {a.institution_name ?? 'Connected bank'}
                </div>
              ))}
              {dataLoadedAt && (
                <p style={{ margin: '0.4rem 0 0', fontSize: '0.78rem', color: '#8aaabb' }}>
                  Data as of {dataLoadedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  {' · '}
                  <button
                    style={{ background: 'none', border: 'none', padding: 0, color: '#2ab9b0', fontSize: '0.78rem', cursor: connecting ? 'default' : 'pointer', textDecoration: 'underline' }}
                    onClick={handleConnectBank}
                    disabled={connecting}
                  >
                    {connecting ? 'Opening Plaid…' : 'Relink'}
                  </button>
                </p>
              )}
            </div>
            <button
              style={connecting ? styles.btnDisabled : styles.btnOutline}
              onClick={handleConnectBank}
              disabled={connecting}
            >
              {connecting ? 'Opening Plaid…' : '+ Add another'}
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            <button
              style={connecting ? styles.btnDisabled : styles.btn}
              onClick={handleConnectBank}
              disabled={connecting}
            >
              {connecting ? 'Opening Plaid…' : '+ Connect Bank via Plaid'}
            </button>
            <a
              href="/transactions"
              style={{ ...styles.btnOutline, display: 'block', textAlign: 'center', textDecoration: 'none' }}
            >
              Upload CSV instead
            </a>
            <p style={SOURCE_NOTE}>Connect a bank for automatic sync, or upload a CSV export from any bank or credit card.</p>
          </div>
        )}
        {bankError && (
          <p style={{ margin: '0.5rem 0 0', fontSize: '0.82rem', color: '#b91c1c' }}>
            Couldn't connect to Plaid.{' '}
            <button
              style={{ background: 'none', border: 'none', padding: 0, color: '#b91c1c', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline', fontSize: '0.82rem' }}
              onClick={() => { setBankError(false); handleConnectBank() }}
            >
              Try again
            </button>
          </p>
        )}
      </section>


      <section style={styles.section} className="pwa-section">
        <h2 style={styles.heading}>Account</h2>
        {isPro && !isDemo && (
          <p style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', color: '#0d7878', fontWeight: 600 }}>
            ✓ Pro plan active
          </p>
        )}
        {!canAccessPro && (
          <div style={{ marginBottom: '1rem' }}>
            <button
              style={restoringAccess ? styles.btnDisabled : styles.btnOutline}
              onClick={handleRestoreAccess}
              disabled={restoringAccess}
            >
              {restoringAccess ? 'Checking…' : 'Restore Pro access'}
            </button>
            {accessRestored === 'success' && (
              <p style={{ margin: '0.4rem 0 0', fontSize: '0.82rem', color: '#0d7878' }}>
                ✓ Pro access restored successfully.
              </p>
            )}
            {accessRestored === 'already_free' && (
              <p style={{ margin: '0.4rem 0 0', fontSize: '0.82rem', color: '#78350f' }}>
                No active subscription found. If you recently paid, it may take a minute to process.
              </p>
            )}
            {accessRestored === 'error' && (
              <p style={{ margin: '0.4rem 0 0', fontSize: '0.82rem', color: '#b91c1c' }}>
                Couldn't check subscription status. Please try again.
              </p>
            )}
            {accessRestored === 'none' && (
              <p style={{ margin: '0.4rem 0 0', fontSize: '0.78rem', color: '#8aaabb' }}>
                Already subscribed? Tap to sync your subscription.
              </p>
            )}
          </div>
        )}
        <button
          style={styles.btnDanger}
          onClick={() => signOut({ redirectUrl: '/sign-in' })}
        >
          Sign out
        </button>

        <p style={DISCLAIMER_TEXT}>
          This app provides financial insights for informational purposes only and does not constitute
          financial, investment, or legal advice.
        </p>

        <div style={LEGAL_LINKS}>
          <a href="/about" style={LEGAL_LINK}>About</a>
          <span style={LEGAL_SEP}>·</span>
          <a href="/privacy" style={LEGAL_LINK}>Privacy</a>
          <span style={LEGAL_SEP}>·</span>
          <a href="/terms" style={LEGAL_LINK}>Terms</a>
        </div>
      </section>

      </>)}
      {/* ════ ALERTS TAB ═════════════════════════════════════════════════ */}
      {alerts.filter(a => !a.dismissed).length > 0 && (!isMobile || activeTab === 'alerts') && (
        <section style={styles.section} className="pwa-section">
          <h2 style={styles.heading}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              Alerts
              {alerts.filter(a => !a.dismissed && !a.read).length > 0 && (
                <span style={styles.alertUnreadDot}>
                  {alerts.filter(a => !a.dismissed && !a.read).length}
                </span>
              )}
              {paywallEnabled && !canAccessPro && <span style={styles.proLabel}>Pro</span>}
            </span>
            {(!paywallEnabled || canAccessPro) && notifPermission !== 'granted' && notifPermission !== 'unsupported' && notifPermission !== 'denied' && (
              <button
                style={subscribing ? styles.btnDisabled : styles.notifEnableBtn}
                onClick={handleEnableNotifications}
                disabled={subscribing}
              >
                {subscribing ? 'Enabling…' : '🔔 Enable alerts'}
              </button>
            )}
            {(!paywallEnabled || canAccessPro) && notifPermission === 'granted' && (
              <button
                style={subscribing ? styles.btnDisabled : styles.notifDisableBtn}
                onClick={() => setShowDisableConfirm(true)}
                disabled={subscribing}
              >
                {subscribing ? 'Disabling…' : '🔔 Disable alerts'}
              </button>
            )}
            {!canAccessPro && (
              <span
                style={{ ...styles.lockedNotifLabel, cursor: 'pointer' }}
                onClick={() => {
                  track(EVENTS.BLOCKED_NOTIFICATION_ATTEMPT, { user_plan: 'free', paywall_enabled: true, source_surface: 'alerts' })
                  triggerContextual('notifications', 'You\'ll know about a spending spike, missed bill, or unusual charge the moment it happens — not when you remember to check.')
                }}
              >
                🔒 Pro
              </span>
            )}
          </h2>
          {/* Contextual prompt: fires when free user taps the locked notification badge */}
          {contextualPrompt?.type === 'notifications' && (
            <ContextualPromptCard
              message={contextualPrompt.message}
              onUpgrade={handleUpgrade}
              upgrading={upgrading}
              onDismiss={() => setContextualPrompt(null)}
              promptType="notifications"
            />
          )}
          {/* iOS PWA guide — push requires Home Screen installation on iPhone */}
          {(!paywallEnabled || canAccessPro) && notifPermission !== 'granted' && isIOS && !isPWA && (
            <div style={{ marginBottom: '0.9rem', padding: '0.65rem 0.8rem', background: '#fff8e6', borderRadius: 8, border: '1px solid #f0d080' }}>
              <p style={{ margin: 0, fontSize: '0.82rem', color: '#7a5800', lineHeight: 1.5 }}>
                <strong>iPhone users:</strong> Push alerts require the app to be installed. In Safari, tap the Share button then <em>Add to Home Screen</em>, then reopen from your Home Screen to enable alerts.
              </p>
            </div>
          )}
          {notifError && (
            <div style={{ marginBottom: '0.9rem', padding: '0.65rem 0.8rem', background: '#fef2f2', borderRadius: 8, border: '1px solid #fca5a5' }}>
              <p style={{ margin: 0, fontSize: '0.82rem', color: '#b91c1c', lineHeight: 1.5 }}>
                Couldn't enable push alerts.{' '}
                <button
                  style={{ background: 'none', border: 'none', padding: 0, color: '#b91c1c', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline', fontSize: '0.82rem' }}
                  onClick={() => { setNotifError(false); handleEnableNotifications() }}
                >
                  Try again
                </button>
              </p>
            </div>
          )}
          <div style={styles.alertList}>
            {canAccessPro ? (
              alerts.filter(a => !a.dismissed).map(a => (
              <div
                key={a.alert_key}
                style={{ ...ALERT_ITEM_STYLES[a.severity], ...(a.read ? styles.alertReadOverlay : {}) }}
              >
                <span style={styles.alertIcon}>{alertIcon(a.severity)}</span>
                <span style={styles.alertMsg}>{a.message}</span>
                <span style={ALERT_BADGE_STYLES[a.severity]}>{a.severity}</span>
                <span style={styles.alertActions}>
                  {!a.read && (
                    <button
                      style={styles.alertActionBtn}
                      onClick={() => handleAlertRead(a.alert_key)}
                    >
                      Mark read
                    </button>
                  )}
                  <button
                    style={styles.alertDismissBtn}
                    onClick={() => handleAlertDismiss(a.alert_key)}
                  >
                    ✕
                  </button>
                </span>
              </div>
            ))
            ) : (
              <div style={styles.lockedCard}>
                <span style={styles.lockIcon}>{'\uD83D\uDD12'}</span>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: '0 0 0.15rem', fontWeight: 700, fontSize: '0.88rem', color: '#1e3166' }}>
                    {alerts.filter(a => !a.dismissed).length} alert{alerts.filter(a => !a.dismissed).length !== 1 ? 's' : ''} detected
                  </p>
                  <p style={{ margin: 0, fontSize: '0.78rem', color: '#6b7280' }}>
                    Upgrade to Pro to see alert details, get push notifications, and act before problems land.
                  </p>
                </div>
                <LockedUpgradeBtn upgrading={upgrading} onClick={() => handleUpgrade()} />
              </div>
            )}
          </div>
        </section>
      )}

      {/* ════ OVERVIEW TAB ═══════════════════════════════════════════════ */}
      {(!isMobile || activeTab === 'overview') && (<>

      {/* ── Financial Health Score ──────────────────────────────────── */}
      {!scoreData && !isDemo && hasData && (
        <section style={SCORE_SECTION} className="pwa-section">
          <div style={{ textAlign: 'center', padding: '1rem 0' }}>
            <p style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1e3166', margin: '0 0 0.35rem' }}>Calculate your Financial Health Score</p>
            <p style={{ fontSize: '0.85rem', color: '#5b7a99', margin: '0 0 1rem', lineHeight: 1.5 }}>
              Tell us about your income, savings, and debt to get a personalized 0–100 score with actionable recommendations.
            </p>
            <a href="/onboarding" style={HERO_CTA}>Complete Your Profile</a>
          </div>
        </section>
      )}
      {scoreData && (
        <section style={SCORE_SECTION} className="pwa-section">
          <div style={SCORE_LAYOUT}>
            <div style={SCORE_GAUGE_WRAP}>
              <svg viewBox="0 0 120 120" width={140} height={140}>
                <circle cx="60" cy="60" r={52} fill="none" stroke="#e5e7eb" strokeWidth="9" />
                <circle
                  cx="60" cy="60" r={52}
                  fill="none"
                  stroke={scoreData.overall >= 65 ? '#2ab9b0' : scoreData.overall >= 35 ? '#f59e0b' : '#ef4444'}
                  strokeWidth="9"
                  strokeDasharray={2 * Math.PI * 52}
                  strokeDashoffset={2 * Math.PI * 52 * (1 - scoreData.overall / 100)}
                  strokeLinecap="round"
                  transform="rotate(-90 60 60)"
                  style={{ transition: 'stroke-dashoffset 0.8s ease-out' }}
                />
              </svg>
              <div style={SCORE_CENTER}>
                <span style={SCORE_NUMBER}>{scoreData.overall}</span>
              </div>
            </div>
            <div style={SCORE_DETAIL}>
              <div style={SCORE_LABEL_ROW}>
                <span style={SCORE_LABEL_TEXT}>{scoreData.label}</span>
                {scoreData.trend !== 0 && (
                  <span style={{ ...SCORE_TREND, color: scoreData.trend > 0 ? '#059669' : '#dc2626' }}>
                    {scoreData.trend > 0 ? '\u25B2' : '\u25BC'} {Math.abs(scoreData.trend)} pts
                  </span>
                )}
              </div>
              <p style={SCORE_SUBTITLE}>Financial Health Score</p>
              {canAccessPro ? (
                <div style={SCORE_FACTORS}>
                  <ScoreFactor label="Emergency Fund" value={scoreData.emergency_fund_score} />
                  <ScoreFactor label="Debt Ratio" value={scoreData.debt_ratio_score} />
                  <ScoreFactor label="Savings Rate" value={scoreData.savings_rate_score} />
                </div>
              ) : (
                <p style={{ margin: '0.5rem 0 0', fontSize: '0.8rem', color: '#8aaabb' }}>Upgrade to Pro to see your factor breakdown.</p>
              )}
            </div>
          </div>
          {canAccessPro && (
            <div style={SCORE_EXPLAINER}>
              <p style={SCORE_EXPLAINER_TEXT}>
                Your score is calculated from 6 measurable factors: emergency fund coverage (25%), debt-to-income ratio (20%), monthly cash flow margin (20%), savings rate (15%), total debt load (10%), and retirement readiness (10%). Each factor is scored 0–100 based on your real financial data, then weighted to produce your overall score. Higher is better.
              </p>
            </div>
          )}
        </section>
      )}

      <section style={styles.section} className="pwa-section">
        <h2 style={styles.heading}>Intelligence</h2>
        {sourceLabel && <p style={SOURCE_NOTE}>{sourceLabel}</p>}
        {insights.length === 0
          ? <p style={styles.empty}>{hasData ? 'Not enough data for insights yet. Upload more transactions to unlock them.' : 'Connect a bank or upload transactions to see insights.'}</p>
          : <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {insights.map((ins) => {
                const isOpen = expandedInsight === ins.type
                return (
                  <div
                    key={ins.type}
                    style={{ ...styles.insightItem, cursor: 'pointer', userSelect: 'none' }}
                    onClick={() => setExpandedInsight(isOpen ? null : ins.type)}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem' }}>
                      <span>💡 {ins.text}</span>
                      <span style={{ fontSize: '0.75rem', color: '#2ab9b0', flexShrink: 0, marginTop: '0.1rem', transition: 'transform 0.2s', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>▾</span>
                    </div>
                    {isOpen && (
                      <div style={{ marginTop: '0.65rem', paddingTop: '0.65rem', borderTop: '1px solid #b0dcd8' }}>
                        <p style={{ margin: '0 0 0.6rem', fontSize: '0.82rem', color: '#4b6080', lineHeight: 1.5 }}>{ins.hint}</p>
                        {ins.tab && (
                          <button
                            style={styles.insightCta}
                            onClick={e => {
                              e.stopPropagation()
                              const sectionId = INSIGHT_SECTION[ins.type]
                              setActiveTab(ins.tab as typeof activeTab)
                              setExpandedInsight(null)
                              // Give the tab switch one frame to render before scrolling
                              setTimeout(() => {
                                document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                              }, 80)
                            }}
                          >
                            {ins.tab === 'subscriptions' ? 'Go to Expenses →' : 'See the data →'}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
        }
      </section>

      {/* ── Cash Flow ────────────────────────────────────────────────────── */}
      <section id="section-cashflow" style={styles.section} className="pwa-section">
        <h2 style={styles.heading}>
          Cash Flow
          {cashflow && cashflow.by_month.length > 0 && (
            <span style={DATA_THROUGH_LABEL}>
              through {cashflow.by_month[cashflow.by_month.length - 1].month}
            </span>
          )}
        </h2>
        {sourceLabel && <p style={SOURCE_NOTE}>Income and spending {hasLinkedAccounts ? 'from your linked accounts' : 'from your transaction history'}.</p>}
        {cashflow && (
          <>
            <div style={styles.statRow} className="pwa-stat-row">
              <Stat label="Total Income"   value={fmt(cashflow.total_inflow)}  color="#0d7878" />
              <Stat label="Total Expenses" value={fmt(cashflow.total_outflow)} color="#dc2626" />
              <Stat label="Net"            value={fmt(cashflow.net)}           color={cashflow.net >= 0 ? '#0d7878' : '#dc2626'} />
            </div>
            {cashflow?.by_month?.length > 0 && canAccessPro && (
              <div className="table-scroll-wrap"><div className="table-scroll"><table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Month</th>
                    <th style={styles.th}>Income</th>
                    <th style={styles.th}>Expenses</th>
                    <th style={styles.th}>Net</th>
                  </tr>
                </thead>
                <tbody>
                  {cashflow.by_month.map(m => (
                    <tr key={m.month}>
                      <td style={styles.td}>{m.month}</td>
                      <td style={styles.tdGreen}>{fmt(m.inflow)}</td>
                      <td style={styles.tdRed}>{fmt(m.outflow)}</td>
                      <td style={m.net >= 0 ? styles.tdGreen : styles.tdRed}>{fmt(m.net)}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div></div>
            )}
            {cashflow?.by_month?.length > 0 && !canAccessPro && (
              <p style={{ margin: '0.5rem 0 0', fontSize: '0.8rem', color: '#8aaabb' }}>Upgrade to Pro to see monthly breakdown.</p>
            )}
          </>
        )}
      </section>

      {/* ════ TOP 3 ACTIONS ════════════════════════════════════════════ */}
      {recommendations.length > 0 && (!isMobile || activeTab === 'overview') && (
      <section style={styles.section} className="pwa-section">
        <h2 style={styles.heading}>
          Fix This
          {paywallEnabled && !canAccessPro && <span style={styles.proLabel}>Pro</span>}
        </h2>
        <p style={SOURCE_NOTE}>
          Ranked by impact. Based on your spending, bills, and financial profile.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {recommendations.slice(0, canAccessPro ? 3 : 1).map((rec, idx) => (
            <div key={rec.id} style={REC_CARD_STYLES[rec.priority]}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.35rem' }}>
                <span style={{ fontWeight: 700, fontSize: '0.95rem', lineHeight: 1.3 }}>
                  <span style={ACTION_NUMBER}>{idx + 1}</span> {rec.title}
                </span>
                <span style={REC_BADGE_STYLES[rec.priority]}>{rec.priority}</span>
              </div>
              <p style={{ margin: '0 0 0.4rem', fontSize: '0.85rem', color: '#374151', lineHeight: 1.5 }}>{rec.explanation}</p>
              <p style={{ margin: 0, fontSize: '0.82rem', fontWeight: 600, color: REC_ACTION_COLORS[rec.priority] }}>{'\u2192'} {rec.suggested_action}</p>
              {rec.savings_amount != null && rec.savings_amount > 0 && (
                <p style={{ margin: '0.35rem 0 0', fontSize: '0.78rem', color: '#059669', fontWeight: 600 }}>
                  Potential savings: {fmt(rec.savings_amount)}/mo ({fmt(rec.savings_amount * 12)}/yr)
                </p>
              )}
            </div>
          ))}
          {!canAccessPro && recommendations.length > 1 && (
            <div style={styles.lockedCard}>
              <span style={styles.lockIcon}>{'\uD83D\uDD12'}</span>
              <div style={{ flex: 1 }}>
                <p style={{ margin: '0 0 0.15rem', fontWeight: 700, fontSize: '0.88rem', color: '#1e3166' }}>
                  {recommendations.length - 1} more action{recommendations.length - 1 > 1 ? 's' : ''} ready
                </p>
                <p style={{ margin: 0, fontSize: '0.78rem', color: '#6b7280' }}>
                  Upgrade to Pro to see your full ranked action plan.
                </p>
              </div>
              <LockedUpgradeBtn upgrading={upgrading} onClick={() => handleUpgrade()} />
            </div>
          )}
        </div>
      </section>
      )}

      {/* ── Forecast ─────────────────────────────────────────────────────── */}
      <section style={styles.section} className="pwa-section">
        <h2 style={styles.heading}>
          Outcome Projection
          {paywallEnabled && !canAccessPro && <span style={styles.proLabel}>Pro</span>}
        </h2>
        <p style={SOURCE_NOTE}>
          Projected from your recurring charges and income patterns. Assumes bills continue at their current amount and frequency.
        </p>
        {!forecast ? (
          <p style={styles.empty}>Not enough data to forecast yet. Upload 2+ months of transactions to enable projections.</p>
        ) : (
          <>
            <div style={styles.statRow} className="pwa-stat-row">
              <Stat label="Projected Income"  value={fmt(forecast.projected_income_30d)} color="#0d7878" />
              <Stat label="Projected Spend"   value={fmt(forecast.projected_spend_30d)}  color="#dc2626" />
              <Stat label="Projected Net"     value={fmt(forecast.projected_net_30d)}    color={forecast.projected_net_30d >= 0 ? '#0d7878' : '#dc2626'} />
            </div>

            {!canAccessPro ? (
              <div style={styles.lockedCard}>
                <span style={styles.lockIcon}>🔒</span>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: '0 0 0.15rem', fontWeight: 700, fontSize: '0.88rem', color: '#1e3166' }}>
                    Upcoming charges hidden
                  </p>
                  <p style={{ margin: 0, fontSize: '0.78rem', color: '#6b7280' }}>
                    The projections are showing. Pro adds the full list of which bills are due, when, and for how much.
                  </p>
                </div>
                <LockedUpgradeBtn upgrading={upgrading} onClick={() => handleUpgrade()} />
              </div>
            ) : forecast.upcoming_charges.length === 0 ? (
              <p style={styles.empty}>No upcoming charges detected.</p>
            ) : (
              <div className="table-scroll-wrap"><div className="table-scroll"><table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Upcoming Charge</th>
                    <th style={styles.th}>Expected Date</th>
                    <th style={styles.th}>Due In</th>
                    <th style={styles.th}>Est. Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {forecast.upcoming_charges.map(c => {
                    const overdue  = c.days_until < 0
                    const dueToday = c.days_until === 0
                    const dueLabel = overdue  ? `${Math.abs(c.days_until)}d overdue`
                                  : dueToday ? 'Today'
                                  : `${c.days_until}d`
                    const dueStyle = overdue  ? styles.tdRed
                                  : dueToday ? styles.tdBold
                                  : styles.td
                    return (
                      <tr key={`${c.normalized_merchant}-${c.expected_date}`}>
                        <td style={styles.td}>
                          <span className="td-truncate" style={{ textTransform: 'capitalize', display: 'block' }}>{c.normalized_merchant}</span>
                        </td>
                        <td style={styles.td}>{c.expected_date}</td>
                        <td style={dueStyle}>{dueLabel}</td>
                        <td style={styles.td}>{fmt(c.estimated_amount)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table></div></div>
            )}
          </>
        )}
      </section>

      </>)}
      {/* ════ EXPENSES TAB ═══════════════════════════════════════════════ */}
      {(!isMobile || activeTab === 'subscriptions') && (<>

      {/* ── Spending Breakdown ───────────────────────────────────────────── */}
      <section id="section-categories" style={styles.section} className="pwa-section">
        <h2 style={styles.heading}>Spending by Category</h2>
        <p style={SOURCE_NOTE}>Categories assigned based on transaction details. Some may be approximate.</p>
        {categories.length === 0
          ? <p style={styles.empty}>No category data yet.</p>
          : (
            <div style={styles.pieWrapper} className="pwa-pie-wrapper">
              <div>
                <PieChart width={isMobile ? Math.min(280, (typeof window !== 'undefined' ? window.innerWidth : 360) - 80) : 280} height={isMobile ? 220 : 280}>
                  <Pie
                    data={categories}
                    dataKey="total_spent"
                    nameKey="category"
                    cx="50%"
                    cy="50%"
                    outerRadius={isMobile ? 80 : 110}
                    minAngle={8}
                    onClick={(entry) => setSelectedCategory(entry as unknown as CategorySummary)}
                    style={{ cursor: 'pointer' }}
                  >
                    {categories.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => fmt(Number(v))} />
                </PieChart>
              </div>

              <div style={styles.pieDetail}>
                {selectedCategory ? (
                  !canAccessPro ? (
                    <div style={styles.lockedCard}>
                      <span style={styles.lockIcon}>{'\uD83D\uDD12'}</span>
                      <div style={{ flex: 1 }}>
                        <p style={{ margin: '0 0 0.15rem', fontWeight: 700, fontSize: '0.88rem', color: '#1e3166' }}>
                          Category detail is Pro
                        </p>
                        <p style={{ margin: 0, fontSize: '0.78rem', color: '#6b7280' }}>
                          Upgrade to see exactly where the money went — totals, number of transactions, and average per charge.
                        </p>
                      </div>
                      <LockedUpgradeBtn upgrading={upgrading} onClick={() => handleUpgrade()} />
                    </div>
                  ) : (
                    <div style={styles.detailPanel}>
                      <div style={styles.detailTitle}>{selectedCategory.category}</div>
                      <div style={styles.detailRow}><span>Total spent</span><strong>{fmt(selectedCategory.total_spent)}</strong></div>
                      <div style={styles.detailRow}><span>Transactions</span><strong>{selectedCategory.transaction_count}</strong></div>
                      <div style={styles.detailRow}><span>Avg amount</span><strong>{fmt(selectedCategory.average_amount)}</strong></div>
                    </div>
                  )
                ) : (
                  <p style={styles.empty}>
                    {!canAccessPro ? 'Upgrade to Pro to see a full breakdown for any category.' : 'Click a slice to see details.'}
                  </p>
                )}
              </div>
            </div>
          )
        }
      </section>

      {/* ── Subscriptions & Waste ────────────────────────────────────────── */}
      <section id="section-subscriptions" style={styles.section} className="pwa-section">
        <h2 style={styles.heading}>Subscriptions & Money Leaks</h2>
        <p style={SOURCE_NOTE}>Detected from recurring transaction patterns. Some charges may be missing or mislabeled.</p>
        {!subData || subData.subscriptions.length === 0 ? (
          <p style={styles.empty}>No recurring subscriptions detected yet. Upload 2+ months of data to detect patterns.</p>
        ) : (
          <>
            {/* Total cost stat */}
            <div style={styles.subTotalRow} className="pwa-subtotal-row">
              <span style={styles.subTotalLabel}>Est. monthly subscription spend</span>
              <span style={styles.subTotalValue}>{fmt(subData.total_monthly_cost)}</span>
            </div>

            {/* Waste flags */}
            {subData.waste_flags.length > 0 && (
              <div style={styles.wasteBox}>
                <div style={styles.wasteTitle}>
                  ⚠ {subData.waste_flags.length} potential waste detected
                  {!canAccessPro && <span style={{ ...styles.proLabel, marginLeft: '0.5rem', verticalAlign: 'middle' }}>Pro</span>}
                </div>
                {!canAccessPro ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.4rem', gap: '0.75rem' }}>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: '#92400e', lineHeight: 1.45 }}>
                      Upgrade to see which ones — and why they're flagged.
                    </p>
                    <LockedUpgradeBtn upgrading={upgrading} onClick={() => handleUpgrade()} />
                  </div>
                ) : (
                  subData.waste_flags.map((f, i) => (
                    <div key={i} style={styles.wasteItem}>
                      <strong style={{ textTransform: 'capitalize' }}>{f.merchant}</strong> — {f.reason}
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Subscription table */}
            <div className="table-scroll-wrap"><div className="table-scroll"><table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Merchant</th>
                  <th style={styles.th}>Frequency</th>
                  <th style={styles.th}>Mo. Cost</th>
                  <th style={styles.th}>Confidence</th>
                </tr>
              </thead>
              <tbody>
                {subData.subscriptions.map((s, i) => {
                  const isTop3    = i < 3
                  const isDormant = s.days_since_last !== null && s.days_since_last > 45
                  const rowStyle  = isTop3 ? styles.subRowTop : styles.td
                  const confColor = s.confidence >= 75 ? '#0d7878'
                                  : s.confidence >= 50 ? '#b45309'
                                  : '#6b7280'
                  return (
                    <tr key={s.normalized_merchant}>
                      <td style={rowStyle}>
                        {isTop3 && <span style={styles.topBadge}>{i + 1}</span>}
                        <span className="td-truncate" style={{ textTransform: 'capitalize', display: 'inline-block', verticalAlign: 'middle' }}>{s.normalized_merchant}</span>
                        {isDormant && <span style={styles.dormantTag}>inactive</span>}
                      </td>
                      <td style={rowStyle}>
                        {s.estimated_frequency_days != null
                          ? `every ${Math.round(s.estimated_frequency_days)}d`
                          : '—'}
                      </td>
                      <td style={{ ...rowStyle, fontWeight: 600 }}>{fmt(s.estimated_monthly_cost)}</td>
                      <td style={rowStyle}>
                        <span style={{ ...styles.confBadge, color: confColor, borderColor: confColor }}>
                          {s.confidence}%
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table></div></div>
          </>
        )}
      </section>

      {/* ── Recurring Patterns ───────────────────────────────────────────── */}
      <section style={styles.section} className="pwa-section">
        <h2 style={styles.heading}>Recurring Patterns</h2>
        {patterns.length === 0
          ? <p style={styles.empty}>No recurring patterns detected yet. More transaction history helps identify them.</p>
          : <div className="table-scroll-wrap"><div className="table-scroll"><table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Merchant</th>
                  <th style={styles.th}>Transactions</th>
                  <th style={styles.th}>Avg Amount</th>
                  <th style={styles.th}>Est. Frequency</th>
                </tr>
              </thead>
              <tbody>
                {patterns.map(p => (
                  <tr key={p.normalized_merchant}>
                    <td style={styles.td}><span className="td-truncate" style={{ display: 'block' }}>{p.normalized_merchant}</span></td>
                    <td style={styles.td}>{p.transaction_count}</td>
                    <td style={styles.td}>{fmt(p.average_amount)}</td>
                    <td style={styles.td}>{p.estimated_frequency_days != null ? `${p.estimated_frequency_days}d` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table></div></div>
        }
      </section>

      {/* ── Anomalies ────────────────────────────────────────────────────── */}
      <section style={styles.section} className="pwa-section">
        <h2 style={styles.heading}>Unusual Transactions</h2>
        <p style={SOURCE_NOTE}>Flagged when a charge is significantly higher than your average at that merchant.</p>
        {anomalies.length === 0
          ? <p style={styles.empty}>No unusual transactions detected. This is a good sign.</p>
          : <>
              <div className="table-scroll-wrap"><div className="table-scroll"><table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Date</th>
                    <th style={styles.th}>Merchant</th>
                    <th style={styles.th}>Amount</th>
                    <th style={styles.th}>Normal Avg</th>
                    <th style={styles.th}>Ratio</th>
                  </tr>
                </thead>
                <tbody>
                  {(!canAccessPro ? anomalies.slice(0, 2) : anomalies).map(a => (
                    <tr key={a.id}>
                      <td style={styles.td}>{a.transaction_date ?? '—'}</td>
                      <td style={styles.td}><span className="td-truncate" style={{ display: 'block' }}>{a.normalized_merchant}</span></td>
                      <td style={styles.tdRed}>{fmt(a.amount)}</td>
                      <td style={styles.td}>{fmt(a.merchant_average)}</td>
                      <td style={styles.tdBold}>{a.anomaly_ratio}×</td>
                    </tr>
                  ))}
                </tbody>
              </table></div></div>
              {!canAccessPro && anomalies.length > 2 && (
                <div style={{ ...styles.lockedCard, marginTop: '0.75rem' }}>
                  <span style={styles.lockIcon}>🔒</span>
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: '0 0 0.15rem', fontWeight: 700, fontSize: '0.88rem', color: '#1e3166' }}>
                      {anomalies.length - 2} more unusual transaction{anomalies.length - 2 > 1 ? 's' : ''} hidden
                    </p>
                    <p style={{ margin: 0, fontSize: '0.78rem', color: '#6b7280' }}>
                      The first two are showing. Upgrade to see everything that was flagged as unusual.
                    </p>
                  </div>
                  <LockedUpgradeBtn upgrading={upgrading} onClick={() => handleUpgrade()} />
                </div>
              )}
            </>
        }
      </section>
      </>)}
        </>
      )}

      {/* ── Snapshot share modal ────────────────────────────────────────── */}
      {showSnapshotModal && (() => {
        const snap = buildSnapshot()
        return (
          <div style={MODAL_OVERLAY} onClick={() => setShowSnapshotModal(false)}>
            <div style={{ ...MODAL_BOX, maxWidth: 400, textAlign: 'left' }} onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <h3 style={{ ...MODAL_TITLE, margin: 0, textAlign: 'left', fontSize: '1rem' }}>Share your snapshot</h3>
                <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: '1rem', padding: '0.5rem', minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowSnapshotModal(false)}>✕</button>
              </div>

              {/* Preview cards */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.1rem' }}>
                <SnapshotPreviewCard label="Safe to spend" value={snap.safe} locked={snap.safe === null} accent="#0d7878" large />
                <SnapshotPreviewCard label="Key action"    value={snap.rec}     accent="#2ab9b0" />
                <SnapshotPreviewCard label="This month"    value={snap.insight} accent="#1e3166" />
              </div>

              <p style={{ margin: '0 0 1rem', fontSize: '0.75rem', color: '#8aaabb', lineHeight: 1.5 }}>
                No account access required to view. Includes only advisory summaries — no transactions or account details.
              </p>

              <div style={{ display: 'flex', gap: '0.6rem' }}>
                <button
                  style={SNAPSHOT_BTN_PRIMARY}
                  onClick={handleShareLink}
                >
                  {snapshotCopied ? '✓ Link copied!' : '🔗 Copy link'}
                </button>
                <button
                  style={SNAPSHOT_BTN_OUTLINE}
                  onClick={handleDownloadImage}
                >
                  ↓ Save image
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── Disable alerts confirmation modal ───────────────────────────── */}
      {showDisableConfirm && (
        <div style={MODAL_OVERLAY} onClick={() => setShowDisableConfirm(false)}>
          <div style={MODAL_BOX} onClick={e => e.stopPropagation()}>
            <div style={MODAL_ICON}>🔕</div>
            <h3 style={MODAL_TITLE}>Disable push alerts?</h3>
            <p style={MODAL_BODY}>
              You won't be notified about <strong>spending spikes</strong>, <strong>low balance warnings</strong>, or other financial alerts.
            </p>
            <div style={MODAL_ACTIONS}>
              <button style={MODAL_BTN_CANCEL} onClick={() => setShowDisableConfirm(false)}>
                Keep alerts on
              </button>
              <button style={MODAL_BTN_CONFIRM} onClick={confirmDisableNotifications}>
                Yes, disable
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Account & Sign Out ──────────────────────────────────────────── */}
      <section style={{ ...styles.section, textAlign: 'center' as const, marginTop: '1rem' }} className="pwa-section">
        <a href="/transactions" style={{ fontSize: '0.85rem', color: '#2ab9b0', fontWeight: 600, textDecoration: 'none' }}>Manage Transactions</a>
        <span style={{ margin: '0 0.75rem', color: '#d1d5db' }}>|</span>
        <a href="/onboarding" style={{ fontSize: '0.85rem', color: '#2ab9b0', fontWeight: 600, textDecoration: 'none' }}>Edit Profile</a>
        <div style={{ marginTop: '1rem' }}>
          <button
            style={{ background: 'none', border: '1px solid #fca5a5', color: '#dc2626', borderRadius: 8, padding: '0.5rem 1.5rem', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}
            onClick={() => signOut({ redirectUrl: '/sign-in' })}
          >
            Sign Out
          </button>
        </div>
      </section>

      {/* ── Support chat ─────────────────────────────────────────────────── */}
      <SupportPanel userPlan={isPro ? 'pro' : 'free'} paywallEnabled={paywallEnabled} />

      {/* ── Bottom navigation (mobile only) ──────────────────────────────── */}
      <nav className="bottom-nav">
        {NAV_TABS.map(tab => (
          <button
            key={tab.id}
            className={`bottom-nav-item${activeTab === tab.id ? ' active' : ''}`}
            onClick={() => {
              setActiveTab(tab.id as typeof activeTab)
              window.scrollTo({ top: 0, behavior: 'smooth' })
            }}
          >
            <svg className="bottom-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d={tab.icon} />
            </svg>
            {tab.label}
          </button>
        ))}
      </nav>
    </main>
  )
}

// ─── Insight section scroll targets ──────────────────────────────────────────

const INSIGHT_SECTION: Record<string, string> = {
  cashflow_negative: 'section-cashflow',
  cashflow_positive: 'section-cashflow',
  mom_spending:      'section-cashflow',
  categories:        'section-categories',
  subscriptions:     'section-subscriptions',
  recurring:         'section-subscriptions',
}

// ─── Bottom nav tabs ──────────────────────────────────────────────────────────

const NAV_TABS = [
  {
    id:    'overview',
    label: 'Overview',
    // Home icon
    icon:  'M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H5a1 1 0 01-1-1V9.5z M9 21V12h6v9',
  },
  {
    id:    'alerts',
    label: 'Alerts',
    // Bell icon
    icon:  'M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0',
  },
  {
    id:    'subscriptions',
    label: 'Expenses',
    // Wallet/spending icon
    icon:  'M21 4H3a2 2 0 00-2 2v12a2 2 0 002 2h18a2 2 0 002-2V6a2 2 0 00-2-2zM1 10h22M7 15h2M12 15h2',
  },
  {
    id:    'allocation',
    label: 'Allocation',
    // Pie/allocation icon
    icon:  'M21 12a9 9 0 11-9-9v9h9zM21 12a9 9 0 01-9 9V12h9z',
  },
]

// ─── Push helpers ─────────────────────────────────────────────────────────────

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw     = window.atob(base64)
  const output  = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i)
  return output
}

// ─── Alert helpers ────────────────────────────────────────────────────────────

function alertIcon(severity: 'low' | 'medium' | 'high') {
  if (severity === 'high')   return '🔴'
  if (severity === 'medium') return '🟡'
  return '🔵'
}

const ALERT_ITEM_BASE: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '0.65rem',
  padding: '0.75rem 1rem', borderRadius: 8, fontSize: '0.9rem', lineHeight: 1.4,
  borderLeftWidth: '4px', borderLeftStyle: 'solid',
}

const ALERT_BADGE_BASE: React.CSSProperties = {
  flexShrink: 0, fontSize: '0.65rem', fontWeight: 700,
  borderRadius: 4, padding: '0.1rem 0.35rem',
  textTransform: 'uppercase', letterSpacing: '0.06em',
  borderWidth: '1px', borderStyle: 'solid',
}

const ALERT_ITEM_STYLES: Record<'low' | 'medium' | 'high', React.CSSProperties> = {
  high:   { ...ALERT_ITEM_BASE,  borderLeftColor: '#dc2626', background: '#fff5f5' },
  medium: { ...ALERT_ITEM_BASE,  borderLeftColor: '#f59e0b', background: '#fffbeb' },
  low:    { ...ALERT_ITEM_BASE,  borderLeftColor: '#3b82f6', background: '#eff6ff' },
}

const ALERT_BADGE_STYLES: Record<'low' | 'medium' | 'high', React.CSSProperties> = {
  high:   { ...ALERT_BADGE_BASE, color: '#dc2626', borderColor: '#dc2626' },
  medium: { ...ALERT_BADGE_BASE, color: '#b45309', borderColor: '#f59e0b' },
  low:    { ...ALERT_BADGE_BASE, color: '#1d4ed8', borderColor: '#3b82f6' },
}

// ─── Recommendation card styles ───────────────────────────────────────────────

const REC_CARD_BASE: React.CSSProperties = {
  borderRadius: 10,
  padding: '0.85rem 1rem',
  borderLeftWidth: 4,
  borderLeftStyle: 'solid',
}

const REC_CARD_STYLES: Record<'low' | 'medium' | 'high', React.CSSProperties> = {
  high:   { ...REC_CARD_BASE, borderLeftColor: '#dc2626', background: '#fff5f5' },
  medium: { ...REC_CARD_BASE, borderLeftColor: '#f59e0b', background: '#fffbeb' },
  low:    { ...REC_CARD_BASE, borderLeftColor: '#10b981', background: '#f0fdf4' },
}

const REC_BADGE_BASE: React.CSSProperties = {
  fontSize: '0.65rem', fontWeight: 700, borderRadius: 4,
  padding: '0.1rem 0.35rem', textTransform: 'uppercase' as const,
  letterSpacing: '0.05em', whiteSpace: 'nowrap' as const,
  borderWidth: 1, borderStyle: 'solid',
}

const REC_BADGE_STYLES: Record<'low' | 'medium' | 'high', React.CSSProperties> = {
  high:   { ...REC_BADGE_BASE, color: '#dc2626', borderColor: '#dc2626', background: '#fee2e2' },
  medium: { ...REC_BADGE_BASE, color: '#b45309', borderColor: '#f59e0b', background: '#fef3c7' },
  low:    { ...REC_BADGE_BASE, color: '#065f46', borderColor: '#10b981', background: '#d1fae5' },
}

const REC_ACTION_COLORS: Record<'low' | 'medium' | 'high', string> = {
  high:   '#dc2626',
  medium: '#b45309',
  low:    '#065f46',
}

// ─── Pie colors ───────────────────────────────────────────────────────────────

const PIE_COLORS = ['#2ab9b0', '#1e3166', '#72d4f0', '#0d7878', '#f59e0b', '#ef4444', '#3b82f6', '#f97316']

// ─── Contextual prompt card ───────────────────────────────────────────────────

// ─── Snapshot preview card (used inside the share modal) ─────────────────────

function SnapshotPreviewCard({ label, value, accent, large = false, locked = false }: {
  label:   string
  value:   string | null
  accent:  string
  large?:  boolean
  locked?: boolean
}) {
  return (
    <div style={{ background: '#f8fbfc', borderRadius: 8, padding: '0.6rem 0.85rem', borderLeft: `3px solid ${accent}`, border: `1px solid #daeef2`, borderLeftColor: accent, borderLeftWidth: 3 }}>
      <div style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.07em', color: '#8aaabb', marginBottom: '0.2rem' }}>{label}</div>
      {locked
        ? <div style={{ fontSize: '0.8rem', color: '#9ca3af' }}>🔒 Pro feature</div>
        : <div style={{ fontSize: large ? '1.15rem' : '0.82rem', fontWeight: 700, color: large ? accent : '#1e3166', lineHeight: 1.4 }}>{value ?? '—'}</div>
      }
    </div>
  )
}

// Small inline upgrade button used inside locked-feature cards.
// Shows price on second line so the user knows what they're clicking into.
function LockedUpgradeBtn({ upgrading, onClick }: { upgrading: boolean; onClick: () => void }) {
  return (
    <button
      style={upgrading
        ? styles.btnDisabled
        : { ...styles.upgradeBtnSm, display: 'flex', flexDirection: 'column', alignItems: 'center', rowGap: '0.1rem', whiteSpace: 'normal', lineHeight: 1.25 }
      }
      onClick={onClick}
      disabled={upgrading}
    >
      {upgrading ? '…' : (
        <>
          <span>Upgrade</span>
          <span style={{ fontSize: '0.62rem', fontWeight: 500, opacity: 0.85 }}>$6.58/mo</span>
        </>
      )}
    </button>
  )
}

function ContextualPromptCard({ message, onUpgrade, upgrading, onDismiss, promptType }: {
  message: string
  onUpgrade: () => void
  upgrading: boolean
  onDismiss: () => void
  promptType: string
}) {
  function handleClick() {
    track(EVENTS.UPGRADE_CTA_CLICKED, {
      user_plan:      'free',
      paywall_enabled: true,
      source_surface: 'contextual',
      prompt_type:    promptType,
    })
    onUpgrade()
  }

  return (
    <div style={CONTEXTUAL_CARD}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.45rem' }}>
        <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#2ab9b0', textTransform: 'uppercase' as const, letterSpacing: '0.08em' }}>Pro Feature</span>
        <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: '0.8rem', padding: 0, lineHeight: 1 }} onClick={onDismiss}>✕</button>
      </div>
      <p style={{ margin: '0 0 0.7rem', fontSize: '0.85rem', color: '#1e3166', lineHeight: 1.5 }}>{message}</p>
      <button
        style={upgrading ? CONTEXTUAL_BTN_DISABLED : CONTEXTUAL_BTN}
        onClick={handleClick}
        disabled={upgrading}
      >
        {upgrading ? 'Redirecting…' : 'Upgrade to Pro →'}
      </button>
      <p style={CONTEXTUAL_PRICE_HINT}>from $6.58/mo · cancel anytime</p>
    </div>
  )
}

const CONTEXTUAL_CARD: React.CSSProperties = {
  background: 'linear-gradient(160deg, #edfafa 0%, #f0f4ff 100%)',
  border: '1.5px solid #b2e8e5',
  borderRadius: 10,
  padding: '0.85rem 1rem',
  marginTop: '0.6rem',
}
const CONTEXTUAL_BTN: React.CSSProperties = {
  background: 'linear-gradient(135deg, #2ab9b0, #1e3166)',
  color: '#fff', border: 'none', borderRadius: 7,
  padding: '0.5rem 1rem', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer',
}
const CONTEXTUAL_BTN_DISABLED: React.CSSProperties = { ...CONTEXTUAL_BTN, background: '#a0d8d5', cursor: 'not-allowed' }
const CONTEXTUAL_PRICE_HINT: React.CSSProperties   = { margin: '0.4rem 0 0', fontSize: '0.72rem', color: '#8aaabb', textAlign: 'center' as const }

// ─── Upgrade card ─────────────────────────────────────────────────────────────

const UPGRADE_BENEFITS = [
  { icon: '✅', headline: 'How much you can spend today', detail: 'A daily number calculated from your actual income, bills, and patterns — not a guess.' },
  { icon: '📲', headline: 'Alerts before problems land', detail: 'Know about spending spikes, unusual charges, and upcoming bills the moment they happen.' },
  { icon: '💡', headline: 'A prioritized action plan', detail: 'See exactly where to cut, what to watch, and what to pay — ranked by impact.' },
]

type UpgradeCopyKey = 'overview' | 'settings' | 'end_recs'
const UPGRADE_COPY: Record<UpgradeCopyKey, { headline: string; subtext: string }> = {
  overview: {
    headline: 'Know what to do next — automatically',
    subtext:  'Pro tells you what\'s safe to spend, what\'s coming up, and what to act on — based on your financial data.',
  },
  settings: {
    headline: 'One plan. All the signal.',
    subtext:  '$9/month gives you a daily spend number, proactive alerts, and a full ranked action plan — based on your financial activity.',
  },
  end_recs: {
    headline: 'There\'s more to your plan.',
    subtext:  'Upgrade to unlock your full action list, 30-day forecast, and your daily safe-to-spend number.',
  },
}

function UpgradeCard({ onUpgrade, upgrading, elevated = false, source = 'unknown' }: { onUpgrade: (plan: 'monthly' | 'annual') => void; upgrading: boolean; elevated?: boolean; source?: string }) {
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'annual'>('annual')

  useEffect(() => {
    track(EVENTS.UPGRADE_CARD_VIEWED, { user_plan: 'free', paywall_enabled: true, source_surface: source, elevated })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])  // fire once on mount — source and elevated are stable at mount time

  const cardStyle = elevated
    ? { ...UPGRADE_CARD_STYLE, border: '2px solid #2ab9b0', boxShadow: '0 0 0 4px rgba(42,185,176,0.10), 0 4px 20px rgba(30,49,102,0.10)' }
    : UPGRADE_CARD_STYLE

  function handleClick() {
    track(EVENTS.UPGRADE_CTA_CLICKED, { user_plan: 'free', paywall_enabled: true, source_surface: source, elevated, plan: selectedPlan })
    onUpgrade(selectedPlan)
  }

  const copyKey: UpgradeCopyKey = (source === 'settings' || source === 'end_recs') ? source : 'overview'
  const copy = UPGRADE_COPY[copyKey]

  return (
    <div style={cardStyle}>
      <p style={UPGRADE_EYEBROW}>StratiFi Pro</p>
      <h3 style={UPGRADE_HEADLINE}>{copy.headline}</h3>
      <p style={UPGRADE_SUBTEXT}>{copy.subtext}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', margin: '1.1rem 0 0' }}>
        {UPGRADE_BENEFITS.map(b => (
          <div key={b.icon} style={UPGRADE_BENEFIT_ROW}>
            <span style={UPGRADE_BENEFIT_ICON}>{b.icon}</span>
            <div>
              <div style={UPGRADE_BENEFIT_HEADLINE}>{b.headline}</div>
              <div style={UPGRADE_BENEFIT_DETAIL}>{b.detail}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Plan selector ───────────────────────────────────────────────── */}
      <div style={PLAN_SELECTOR}>
        <button
          style={selectedPlan === 'annual' ? PLAN_OPTION_ACTIVE : PLAN_OPTION_INACTIVE}
          onClick={() => setSelectedPlan('annual')}
        >
          <div style={PLAN_OPTION_LABEL}>
            Yearly
            <span style={BEST_VALUE_BADGE}>Best value</span>
          </div>
          <div style={PLAN_OPTION_PRICE}>
            $79 <span style={PLAN_OPTION_PERIOD}>/yr &nbsp;·&nbsp; $6.58/mo</span>
          </div>
        </button>
        <button
          style={selectedPlan === 'monthly' ? PLAN_OPTION_ACTIVE : PLAN_OPTION_INACTIVE}
          onClick={() => setSelectedPlan('monthly')}
        >
          <div style={PLAN_OPTION_LABEL}>Monthly</div>
          <div style={PLAN_OPTION_PRICE}>
            $9 <span style={PLAN_OPTION_PERIOD}>/mo</span>
          </div>
        </button>
      </div>

      <button
        style={upgrading ? UPGRADE_BTN_DISABLED : UPGRADE_BTN}
        onClick={handleClick}
        disabled={upgrading}
      >
        {upgrading ? 'Redirecting to checkout…' : 'Upgrade to Pro'}
      </button>
      <p style={UPGRADE_FINE_PRINT}>
        {selectedPlan === 'annual'
          ? '$79 billed once yearly · Cancel anytime'
          : '$9 billed monthly · Cancel anytime'}
      </p>
    </div>
  )
}

const UPGRADE_CARD_STYLE: React.CSSProperties = {
  background:   'linear-gradient(160deg, #edfafa 0%, #f0f4ff 100%)',
  border:       '1.5px solid #b2e8e5',
  borderRadius: 14,
  padding:      'clamp(0.85rem, 3vw, 1.2rem) clamp(0.75rem, 3vw, 1rem) clamp(0.75rem, 3vw, 1rem)',
  overflowWrap: 'break-word',
  boxSizing:    'border-box',
  maxWidth:     '100%',
}
const UPGRADE_EYEBROW: React.CSSProperties    = { margin: '0 0 0.3rem', fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#2ab9b0' }
const UPGRADE_HEADLINE: React.CSSProperties   = { margin: '0 0 0.4rem', fontSize: 'clamp(0.95rem, 4vw, 1.15rem)', fontWeight: 800, color: '#1e3166', lineHeight: 1.25 }
const UPGRADE_SUBTEXT: React.CSSProperties    = { margin: 0, fontSize: 'clamp(0.78rem, 3.2vw, 0.85rem)', color: '#4b6080', lineHeight: 1.5 }
const UPGRADE_BENEFIT_ROW: React.CSSProperties = { display: 'flex', alignItems: 'flex-start', gap: '0.65rem' }
const UPGRADE_BENEFIT_ICON: React.CSSProperties = { fontSize: '1.1rem', lineHeight: 1, marginTop: '0.05rem', flexShrink: 0 }
const UPGRADE_BENEFIT_HEADLINE: React.CSSProperties = { fontSize: 'clamp(0.8rem, 3.2vw, 0.88rem)', fontWeight: 700, color: '#1e3166', marginBottom: '0.1rem' }
const UPGRADE_BENEFIT_DETAIL: React.CSSProperties   = { fontSize: 'clamp(0.72rem, 2.8vw, 0.78rem)', color: '#5b7a99', lineHeight: 1.45 }
const UPGRADE_BTN: React.CSSProperties = {
  display: 'block', width: '100%', padding: '0.85rem',
  background: 'linear-gradient(135deg, #2ab9b0, #1e3166)',
  color: '#fff', border: 'none', borderRadius: 10,
  fontSize: '1rem', fontWeight: 800, cursor: 'pointer',
  letterSpacing: '0.01em',
}
const UPGRADE_BTN_DISABLED: React.CSSProperties = { ...UPGRADE_BTN, background: '#a0d8d5', cursor: 'not-allowed' }
const UPGRADE_FINE_PRINT: React.CSSProperties   = { margin: '0.6rem 0 0', textAlign: 'center', fontSize: '0.75rem', color: '#8aaabb' }

// ─── Plan selector ────────────────────────────────────────────────────────────

const PLAN_SELECTOR: React.CSSProperties = {
  display: 'flex', gap: '0.5rem', margin: '1rem 0 0.85rem',
}

const PLAN_OPTION_BASE: React.CSSProperties = {
  flex: 1, padding: '0.55rem 0.65rem', borderRadius: 9,
  border: '1.5px solid', cursor: 'pointer',
  background: 'none', textAlign: 'left' as const,
  minWidth: 0,  // allow flex children to shrink below content size
}

const PLAN_OPTION_INACTIVE: React.CSSProperties = {
  ...PLAN_OPTION_BASE, borderColor: '#d1e8eb', color: '#5b7a99',
}

const PLAN_OPTION_ACTIVE: React.CSSProperties = {
  ...PLAN_OPTION_BASE, borderColor: '#2ab9b0', background: '#f0fdfc', color: '#1e3166',
}

const PLAN_OPTION_LABEL: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '0.35rem',
  fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.2rem',
}

const PLAN_OPTION_PRICE: React.CSSProperties = {
  fontSize: 'clamp(0.85rem, 3.5vw, 1rem)', fontWeight: 700, lineHeight: 1,
}

const PLAN_OPTION_PERIOD: React.CSSProperties = {
  fontSize: '0.72rem', fontWeight: 400, color: '#8aaabb',
}

const BEST_VALUE_BADGE: React.CSSProperties = {
  fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.06em',
  textTransform: 'uppercase' as const, background: '#2ab9b0',
  color: '#fff', borderRadius: 4, padding: '0.1rem 0.35rem',
}
// ─── Share button ─────────────────────────────────────────────────────────────

// ─── Hero ─────────────────────────────────────────────────────────────────────

const HERO_HEADLINE: React.CSSProperties = {
  fontSize:     'clamp(1.25rem, 5vw, 1.7rem)',
  fontWeight:   800,
  color:        '#1e3166',
  lineHeight:   1.2,
  margin:       '0.25rem 0 0.4rem',
  maxWidth:     '100%',
  overflowWrap: 'break-word',
  wordBreak:    'break-word',
}

const HERO_SUB: React.CSSProperties = {
  fontSize:   'clamp(0.82rem, 3vw, 0.95rem)',
  color:      '#5b7a99',
  margin:     '0 0 0.85rem',
  fontWeight: 500,
  lineHeight: 1.4,
}

const HERO_CTA: React.CSSProperties = {
  display:      'inline-block',
  padding:      '0.75rem 1.5rem',
  background:   'linear-gradient(135deg, #2ab9b0, #1e3166)',
  color:        '#fff',
  border:       'none',
  borderRadius: 10,
  fontSize:     '0.92rem',
  fontWeight:   700,
  cursor:       'pointer',
  marginBottom: '0.75rem',
}

// ─── Proof label ──────────────────────────────────────────────────────────────

const PROOF_LABEL: React.CSSProperties = {
  fontSize:      '0.7rem',
  fontWeight:    700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color:         '#2ab9b0',
  margin:        '0 0 0.5rem',
}

const EMPTY_SETUP: React.CSSProperties = {
  textAlign:    'center',
  padding:      '2rem 1rem',
  background:   '#ffffff',
  borderRadius: 12,
  border:       '1px dashed #cce6ea',
  marginBottom: '1rem',
}

const EMPTY_SETUP_TEXT: React.CSSProperties = {
  fontSize: '0.92rem', color: '#5b7a99', margin: '0 0 1rem', lineHeight: 1.5,
}

const EMPTY_SETUP_CTA: React.CSSProperties = {
  ...HERO_CTA,
  textDecoration: 'none',
}

// ─── Explanation block ────────────────────────────────────────────────────────

const EXPLAIN_BLOCK: React.CSSProperties = {
  textAlign:    'center',
  padding:      '1.25rem 1rem',
  margin:       '0.25rem 0 0.75rem',
}

const EXPLAIN_LINE: React.CSSProperties = {
  fontSize:   'clamp(0.95rem, 3.5vw, 1.1rem)',
  fontWeight: 600,
  color:      '#1e3166',
  margin:     '0 0 0.2rem',
  lineHeight: 1.4,
}

const EXPLAIN_DETAIL: React.CSSProperties = {
  fontSize:   'clamp(0.82rem, 3vw, 0.9rem)',
  color:      '#5b7a99',
  margin:     '0.5rem 0 0',
  lineHeight: 1.55,
}

// ─── Benefit strip ────────────────────────────────────────────────────────────

const BENEFIT_STRIP: React.CSSProperties = {
  display:        'flex',
  gap:            '0.6rem',
  marginBottom:   '0.75rem',
  flexWrap:       'wrap',
}

const BENEFIT_CARD: React.CSSProperties = {
  flex:           '1 1 min(140px, 100%)',
  background:     '#ffffff',
  border:         '1px solid #daeef2',
  borderRadius:   10,
  padding:        '0.85rem 0.75rem',
  minWidth:       0,
}

const BENEFIT_TITLE: React.CSSProperties = {
  fontSize:   '0.82rem',
  fontWeight: 700,
  color:      '#2ab9b0',
  marginBottom: '0.25rem',
}

const BENEFIT_DESC: React.CSSProperties = {
  fontSize:   '0.78rem',
  color:      '#5b7a99',
  lineHeight: 1.45,
}

// ─── CTA reinforcement ───────────────────────────────────────────────────────

const CTA_REINFORCE: React.CSSProperties = {
  textAlign:    'center',
  padding:      '1rem 0',
  marginBottom: '0.75rem',
}

const CTA_REINFORCE_TEXT: React.CSSProperties = {
  fontSize:   'clamp(0.92rem, 3.5vw, 1.05rem)',
  fontWeight: 700,
  color:      '#1e3166',
  margin:     '0 0 0.75rem',
}

// ─── Share button ─────────────────────────────────────────────────────────────

const SHARE_BTN: React.CSSProperties = {
  position:   'absolute' as const,
  top:        '1.25rem',
  right:      '3.25rem',  // sits left of the gear button
  display:    'flex',
  alignItems: 'center',
  background: 'none',
  border:     '1px solid #cce6ea',
  borderRadius: 7,
  cursor:     'pointer',
  color:      '#2ab9b0',
  padding:    '0.3rem 0.55rem',
  fontSize:   '0.78rem',
  fontWeight: 600,
  lineHeight: 1,
}

const SNAPSHOT_BTN_PRIMARY: React.CSSProperties = {
  flex: 1, padding: '0.6rem 0.9rem',
  background: 'linear-gradient(135deg, #2ab9b0, #1e3166)',
  color: '#fff', border: 'none', borderRadius: 8,
  fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer',
}

const SNAPSHOT_BTN_OUTLINE: React.CSSProperties = {
  flex: 1, padding: '0.6rem 0.9rem',
  background: 'transparent', border: '1.5px solid #2ab9b0',
  color: '#2ab9b0', borderRadius: 8,
  fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer',
}

// ─── Demo mode banner ─────────────────────────────────────────────────────────

// ─── Financial Health Score ───────────────────────────────────────────────────

const SCORE_SECTION: React.CSSProperties = {
  background: '#ffffff', borderRadius: 12, padding: 'clamp(1rem, 3vw, 1.5rem)',
  marginBottom: '1rem',
  boxShadow: '0 1px 3px rgba(30,49,102,0.07), 0 1px 2px rgba(30,49,102,0.04)',
  border: '1px solid #daeef2',
}

const SCORE_LAYOUT: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap', justifyContent: 'center',
}

const SCORE_GAUGE_WRAP: React.CSSProperties = {
  position: 'relative', width: 140, height: 140, flexShrink: 0,
}

const SCORE_CENTER: React.CSSProperties = {
  position: 'absolute', inset: 0,
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.15rem',
}

const SCORE_NUMBER: React.CSSProperties = {
  fontSize: '2.25rem', fontWeight: 800, color: '#1e3166', lineHeight: 1,
}

const SCORE_OF: React.CSSProperties = {
  fontSize: '0.85rem', fontWeight: 600, color: '#8aaabb', alignSelf: 'flex-end', paddingBottom: '0.2rem',
}

const SCORE_DETAIL: React.CSSProperties = {
  flex: 1, minWidth: 200, width: '100%',
}

const SCORE_LABEL_ROW: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.15rem',
}

const SCORE_LABEL_TEXT: React.CSSProperties = {
  fontSize: '1.15rem', fontWeight: 700, color: '#1e3166',
}

const SCORE_TREND: React.CSSProperties = {
  fontSize: '0.78rem', fontWeight: 700,
}

const SCORE_SUBTITLE: React.CSSProperties = {
  fontSize: '0.78rem', color: '#8aaabb', margin: '0 0 0.85rem', fontWeight: 600,
  textTransform: 'uppercase', letterSpacing: '0.05em',
}

const SCORE_FACTORS: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: '0.45rem',
}

const SCORE_FACTOR_ROW: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '0.5rem',
}

const SCORE_FACTOR_LABEL: React.CSSProperties = {
  fontSize: '0.78rem', color: '#5b7a99', minWidth: 90, flexShrink: 0, fontWeight: 500,
}

const SCORE_FACTOR_BAR_BG: React.CSSProperties = {
  flex: 1, height: 6, background: '#e5e7eb', borderRadius: 3, overflow: 'hidden',
}

const SCORE_FACTOR_BAR_FILL: React.CSSProperties = {
  height: '100%', borderRadius: 3, transition: 'width 0.6s ease-out',
}

const SCORE_FACTOR_VAL: React.CSSProperties = {
  fontSize: '0.75rem', fontWeight: 700, width: 28, textAlign: 'right',
}

// ─── Allocation tab ──────────────────────────────────────────────────────────

const ALLOC_NET_WORTH: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '0.25rem',
  padding: '0.75rem 0', borderBottom: '1px solid #e5e7eb', marginBottom: '1.25rem',
}
const ALLOC_NW_LABEL: React.CSSProperties = {
  fontSize: '0.85rem', fontWeight: 600, color: '#5b7a99', textTransform: 'uppercase', letterSpacing: '0.05em',
}
const ALLOC_NW_VALUE: React.CSSProperties = {
  fontSize: 'clamp(1.25rem, 5vw, 1.6rem)', fontWeight: 800, color: '#1e3166',
}
const ALLOC_BUCKETS: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: '1.25rem',
}
const ALLOC_BUCKET: React.CSSProperties = {}
const ALLOC_BUCKET_HEADER: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem',
}
const ALLOC_BUCKET_LABEL: React.CSSProperties = {
  fontSize: '0.9rem', fontWeight: 700, color: '#1e3166',
}
const ALLOC_BUCKET_STATUS: React.CSSProperties = {
  fontSize: '0.78rem', fontWeight: 600,
}
const ALLOC_BUCKET_VALUES: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.35rem', flexWrap: 'wrap', gap: '0.25rem',
}
const ALLOC_BUCKET_CURRENT: React.CSSProperties = {
  fontSize: '1.1rem', fontWeight: 700, color: '#1e3166',
}
const ALLOC_BUCKET_TARGET: React.CSSProperties = {
  fontSize: '0.78rem', color: '#8aaabb',
}
const ALLOC_BAR_BG: React.CSSProperties = {
  height: 8, background: '#e5e7eb', borderRadius: 4, overflow: 'hidden',
}
const ALLOC_BAR_FILL: React.CSSProperties = {
  height: '100%', borderRadius: 4, transition: 'width 0.6s ease-out',
}
const ALLOC_GUIDANCE: React.CSSProperties = {
  margin: '0.75rem 0 0', fontSize: '0.85rem', color: '#374151', lineHeight: 1.5,
  background: '#f0f9fb', border: '1px solid #cce6ea', borderRadius: 8, padding: '0.75rem 1rem',
}

// ─── First-run guided experience ─────────────────────────────────────────────

const FR_CONTAINER: React.CSSProperties = {
  minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center',
  justifyContent: 'center', padding: '2rem 1.5rem', background: '#f0f9fb', textAlign: 'center',
}
const FR_CARD: React.CSSProperties = {
  background: '#fff', borderRadius: 16, padding: '2rem 1.5rem', maxWidth: 420, width: '100%',
  boxShadow: '0 4px 24px rgba(30,49,102,0.08)', border: '1px solid #daeef2',
}
const FR_STEP_LABEL: React.CSSProperties = {
  fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em', color: '#2ab9b0',
  textTransform: 'uppercase', marginBottom: '0.5rem',
}
const FR_HEADING: React.CSSProperties = {
  fontSize: 'clamp(1.15rem, 4vw, 1.4rem)', fontWeight: 800, color: '#1e3166', margin: '0 0 0.5rem',
}
const FR_LABEL: React.CSSProperties = {
  fontSize: '1rem', fontWeight: 700, color: '#1e3166', margin: '0 0 0.75rem',
}
const FR_BODY: React.CSSProperties = {
  fontSize: '0.85rem', color: '#5b7a99', lineHeight: 1.6, margin: '0 0 1.25rem',
}
const FR_BTN: React.CSSProperties = {
  display: 'block', width: '100%', padding: '0.75rem', background: 'linear-gradient(135deg, #2ab9b0, #1e3166)',
  color: '#fff', border: 'none', borderRadius: 10, fontSize: '0.92rem', fontWeight: 700, cursor: 'pointer',
}
const FR_BTN_GHOST: React.CSSProperties = {
  display: 'block', width: '100%', padding: '0.5rem', background: 'none',
  color: '#8aaabb', border: 'none', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', marginTop: '0.5rem',
}
const FR_ISSUE: React.CSSProperties = {
  display: 'flex', gap: '0.75rem', alignItems: 'flex-start', textAlign: 'left',
  background: '#fff8f0', border: '1px solid #fde8d0', borderRadius: 10, padding: '0.75rem 1rem',
}
const FR_ISSUE_NUM: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 24, height: 24, borderRadius: '50%', background: '#f59e0b', color: '#fff',
  fontSize: '0.75rem', fontWeight: 700, flexShrink: 0,
}
const FR_ISSUE_TITLE: React.CSSProperties = {
  fontSize: '0.88rem', fontWeight: 700, color: '#1e3166', margin: '0 0 0.15rem',
}
const FR_ISSUE_DESC: React.CSSProperties = {
  fontSize: '0.78rem', color: '#6b7280', margin: 0, lineHeight: 1.4,
}
const FR_ALLOC_BOX: React.CSSProperties = {
  flex: 1, background: '#f0f9fb', borderRadius: 8, padding: '0.6rem', textAlign: 'center',
}
const FR_ALLOC_LABEL: React.CSSProperties = {
  display: 'block', fontSize: '0.72rem', color: '#5b7a99', fontWeight: 600, textTransform: 'uppercase',
  letterSpacing: '0.05em', marginBottom: '0.2rem',
}
const FR_ALLOC_VAL: React.CSSProperties = {
  display: 'block', fontSize: '1.05rem', fontWeight: 700, color: '#1e3166',
}
const FR_READY_ROW: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.88rem', color: '#1e3166',
  textAlign: 'left',
}
const FR_CHECK: React.CSSProperties = {
  color: '#059669', fontWeight: 700, fontSize: '1rem',
}

const ACTION_NUMBER: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 22, height: 22, borderRadius: '50%',
  background: '#1e3166', color: '#fff',
  fontSize: '0.72rem', fontWeight: 700, marginRight: '0.4rem', flexShrink: 0,
}

const SCORE_EXPLAINER: React.CSSProperties = {
  marginTop: '1rem', paddingTop: '0.85rem', borderTop: '1px solid #e5e7eb',
}

const SCORE_EXPLAINER_TEXT: React.CSSProperties = {
  margin: 0, fontSize: '0.78rem', color: '#6b7280', lineHeight: 1.6,
}

const DEMO_BANNER: React.CSSProperties = {
  background:   '#fffbeb',
  border:       '1px solid #fcd34d',
  borderLeft:   '4px solid #f59e0b',
  borderRadius: 10,
  padding:      '0.85rem 1rem',
  marginBottom: '1rem',
  fontSize:     '0.88rem',
  color:        '#78350f',
  lineHeight:   1.5,
  animation:    'fadeIn 0.3s ease-out',
}

const DEMO_BANNER_TEXT: React.CSSProperties = {
  marginBottom: '0.5rem',
}

const DEMO_BANNER_ACTIONS: React.CSSProperties = {
  display:  'flex',
  gap:      '0.6rem',
  flexWrap: 'wrap',
}

const DEMO_BANNER_CTA: React.CSSProperties = {
  display:        'inline-block',
  padding:        '0.4rem 0.9rem',
  background:     'linear-gradient(135deg, #2ab9b0, #1e3166)',
  color:          '#fff',
  border:         'none',
  borderRadius:   6,
  fontSize:       '0.82rem',
  fontWeight:     700,
  textDecoration: 'none',
  cursor:         'pointer',
}

const DEMO_BANNER_LINK: React.CSSProperties = {
  background:     'none',
  border:         '1px solid #2ab9b0',
  color:          '#1e3166',
  borderRadius:   6,
  padding:        '0.4rem 0.9rem',
  fontSize:       '0.82rem',
  fontWeight:     700,
  cursor:         'pointer',
}

const UPGRADE_SUCCESS_BANNER: React.CSSProperties = {
  background: '#d1fae5', border: '1px solid #6ee7b7', borderRadius: 10,
  padding: '0.85rem 1.1rem', marginBottom: '1rem',
  fontSize: '0.9rem', color: '#065f46', lineHeight: 1.4,
  animation: 'fadeIn 0.3s ease-out',
}

const CHECKOUT_POLLING_BANNER: React.CSSProperties = {
  background: '#f0f9fb', border: '1px solid #b2e8e5', borderRadius: 10,
  padding: '0.85rem 1.1rem', marginBottom: '1rem',
  fontSize: '0.9rem', color: '#1e3166', lineHeight: 1.4,
  display: 'flex', alignItems: 'center', gap: '0.6rem',
  animation: 'fadeIn 0.3s ease-out',
}

const CHECKOUT_PENDING_BANNER: React.CSSProperties = {
  background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 10,
  padding: '0.85rem 1.1rem', marginBottom: '1rem',
  fontSize: '0.9rem', color: '#78350f', lineHeight: 1.4,
  animation: 'fadeIn 0.3s ease-out',
}

// Inline spinner — pure CSS, no dependencies
const CHECKOUT_SPINNER: React.CSSProperties = {
  display:       'inline-block',
  width:         14,
  height:        14,
  border:        '2px solid #b2e8e5',
  borderTopColor:'#2ab9b0',
  borderRadius:  '50%',
  animation:     'spin 0.7s linear infinite',
  flexShrink:    0,
}

// ─── Legal / disclaimer ───────────────────────────────────────────────────────

const DISCLAIMER_TEXT: React.CSSProperties = {
  margin:     '0.6rem 0 0',
  fontSize:   '0.72rem',
  color:      '#9ca3af',
  lineHeight: 1.5,
}

const LEGAL_LINKS: React.CSSProperties = {
  display:   'flex',
  alignItems:'center',
  gap:       '0.4rem',
  marginTop: '0.75rem',
}

const LEGAL_LINK: React.CSSProperties = {
  fontSize:       '0.75rem',
  color:          '#6b7280',
  textDecoration: 'underline',
}

const LEGAL_SEP: React.CSSProperties = {
  fontSize: '0.7rem',
  color:    '#d1d5db',
}

// ─── Upgrade error banner ─────────────────────────────────────────────────────

const UPGRADE_ERROR_BANNER: React.CSSProperties = {
  background:   '#fef2f2',
  border:       '1px solid #fca5a5',
  borderRadius: 8,
  padding:      '0.6rem 1rem',
  marginBottom: '0.75rem',
  fontSize:     '0.83rem',
  color:        '#b91c1c',
  display:      'flex',
  alignItems:   'center',
  gap:          '0.25rem',
  flexWrap:     'wrap',
  animation:    'fadeIn 0.3s ease-out',
}

const UPGRADE_ERROR_RETRY: React.CSSProperties = {
  background:  'none',
  border:      'none',
  cursor:      'pointer',
  color:       '#b91c1c',
  fontWeight:  700,
  padding:     0,
  fontSize:    '0.83rem',
  textDecoration: 'underline',
}

// ─── Trust / data freshness ───────────────────────────────────────────────────

const DATA_FRESHNESS_LABEL: React.CSSProperties = {
  margin:       '0.1rem 0 0',
  fontSize:     '0.68rem',
  color:        '#9ca3af',
  letterSpacing: '0.01em',
  wordBreak:    'break-word',
}

const DATA_THROUGH_LABEL: React.CSSProperties = {
  marginLeft:   '0.5rem',
  fontSize:     '0.72rem',
  fontWeight:   400,
  color:        '#9ca3af',
  letterSpacing: '0.01em',
}

const SOURCE_NOTE: React.CSSProperties = {
  margin:     '0 0 0.65rem',
  fontSize:   '0.72rem',
  color:      '#9ca3af',
  lineHeight: 1.4,
}

const CALC_TOGGLE: React.CSSProperties = {
  background:  'none',
  border:      'none',
  cursor:      'pointer',
  padding:     '0.5rem 0.5rem 0.5rem 0',
  fontSize:    '0.75rem',
  color:       '#6b7280',
  fontWeight:  500,
  minHeight:   44,
}

const CALC_BODY: React.CSSProperties = {
  margin:     '0.4rem 0 0',
  fontSize:   '0.78rem',
  color:      '#6b7280',
  lineHeight: 1.55,
}

// ─── Weekly check-in banner ───────────────────────────────────────────────────

const CHECKIN_BANNER: React.CSSProperties = {
  background:   '#ffffff',
  border:       '1px solid #c8eae8',
  borderLeft:   '4px solid #2ab9b0',
  borderRadius: 10,
  padding:      '0.85rem 1rem',
  marginBottom: '0.75rem',
}

const CHECKIN_HEADER: React.CSSProperties = {
  display:        'flex',
  alignItems:     'center',
  justifyContent: 'space-between',
  marginBottom:   '0.5rem',
}

const CHECKIN_TITLE: React.CSSProperties = {
  fontSize:      '0.72rem',
  fontWeight:    700,
  textTransform: 'uppercase',
  letterSpacing: '0.07em',
  color:         '#2ab9b0',
}

const CHECKIN_DISMISS: React.CSSProperties = {
  background:  'none',
  border:      'none',
  cursor:      'pointer',
  color:       '#9ca3af',
  fontSize:    '0.9rem',
  padding:     '0.5rem',
  lineHeight:  1,
  minWidth:    44,
  minHeight:   44,
  display:     'flex',
  alignItems:  'center',
  justifyContent: 'center',
}

const CHECKIN_BODY: React.CSSProperties = {
  display:       'flex',
  flexDirection: 'column',
  gap:           '0.35rem',
}

const CHECKIN_ROW: React.CSSProperties = {
  display:    'flex',
  alignItems: 'flex-start',
  gap:        '0.5rem',
  fontSize:   '0.85rem',
  color:      '#1e3166',
  lineHeight: 1.45,
}

const CHECKIN_DOT_TEAL: React.CSSProperties = {
  flexShrink:   0,
  marginTop:    '0.45em',
  width:        6,
  height:       6,
  borderRadius: '50%',
  background:   '#2ab9b0',
}

const CHECKIN_DOT_NAVY: React.CSSProperties = {
  flexShrink:   0,
  marginTop:    '0.45em',
  width:        6,
  height:       6,
  borderRadius: '50%',
  background:   '#1e3166',
}

// ─── Disable alerts modal ─────────────────────────────────────────────────────

const MODAL_OVERLAY: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 200,
  background: 'rgba(14, 30, 60, 0.45)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: '1rem',
}
const MODAL_BOX: React.CSSProperties = {
  background: '#ffffff',
  borderRadius: 16,
  padding: '1.75rem 1.25rem 1.25rem',
  maxWidth: 'min(360px, 100%)',
  width: '100%',
  boxShadow: '0 8px 40px rgba(14,30,60,0.18)',
  textAlign: 'center',
}
const MODAL_ICON: React.CSSProperties  = { fontSize: '2.25rem', marginBottom: '0.75rem' }
const MODAL_TITLE: React.CSSProperties = { margin: '0 0 0.6rem', fontSize: '1.15rem', fontWeight: 800, color: '#1e3166' }
const MODAL_BODY: React.CSSProperties  = { margin: '0 0 1.5rem', fontSize: '0.88rem', color: '#4b6080', lineHeight: 1.55 }
const MODAL_ACTIONS: React.CSSProperties = { display: 'flex', gap: '0.75rem' }
const MODAL_BTN_CANCEL: React.CSSProperties = {
  flex: 1, padding: '0.75rem', borderRadius: 10, border: '1.5px solid #2ab9b0',
  background: 'transparent', color: '#2ab9b0', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer',
}
const MODAL_BTN_CONFIRM: React.CSSProperties = {
  flex: 1, padding: '0.75rem', borderRadius: 10, border: 'none',
  background: '#1e3166', color: '#ffffff', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer',
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  // This spread is safe: Stat only renders inside `cashflow && (...)`,
  // so it never executes during the SSR/hydration pass (cashflow is null
  // initially). The dynamic object is created only after data loads.
  return (
    <div style={styles.stat}>
      <div style={styles.statLabel}>{label}</div>
      <div style={{ ...styles.statValue, color }}>{value}</div>
    </div>
  )
}

// ─── Skeleton loader (prevents CLS during data load) ─────────────────────────

function SkeletonBlock({ height, width = '100%', mb = '0.75rem' }: { height: number | string; width?: string; mb?: string }) {
  return <div className="skeleton" style={{ height, width, marginBottom: mb }} />
}

function ScoreFactor({ label, value }: { label: string; value: number }) {
  const v = Math.round(value)
  const color = v >= 70 ? '#059669' : v >= 40 ? '#d97706' : '#dc2626'
  return (
    <div style={SCORE_FACTOR_ROW}>
      <span style={SCORE_FACTOR_LABEL}>{label}</span>
      <div style={SCORE_FACTOR_BAR_BG}>
        <div style={{ ...SCORE_FACTOR_BAR_FILL, width: `${v}%`, background: color }} />
      </div>
      <span style={{ ...SCORE_FACTOR_VAL, color }}>{v}</span>
    </div>
  )
}

function SkeletonDashboard() {
  return (
    <div style={{ padding: '1rem 0.75rem', maxWidth: 720, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
      {/* Header */}
      <SkeletonBlock height={80} mb="1.25rem" />

      {/* Stat cards */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <SkeletonBlock height={60} width="100%" mb="0" />
        <SkeletonBlock height={60} width="100%" mb="0" />
        <SkeletonBlock height={60} width="100%" mb="0" />
      </div>

      {/* Section cards */}
      <SkeletonBlock height={140} mb="0.75rem" />
      <SkeletonBlock height={100} mb="0.75rem" />
      <SkeletonBlock height={160} mb="0.75rem" />
      <SkeletonBlock height={120} />
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

// td base is extracted so derived variants (tdGreen, tdRed, tdBold) can
// spread it at definition time rather than creating new objects during render.
const TD_BASE: React.CSSProperties = {
  padding:      '0.6rem 0.75rem',
  borderBottom: '1px solid #e4f0f2',
  color:        '#1e3166',
}

const styles: Record<string, React.CSSProperties> = {
  page:        { maxWidth: 900, margin: '0 auto', padding: 'clamp(1rem, 3vw, 2.5rem) clamp(0.75rem, 3vw, 1.5rem)', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', color: '#1e3166', background: '#f0f9fb', minHeight: '100vh', overflowX: 'clip' as const, boxSizing: 'border-box' as const, width: '100%' } as React.CSSProperties,
  header:      { marginBottom: '1.75rem', position: 'relative' as const },
  logo:        { width: 'min(200px, 50vw)', height: 'auto', display: 'block', marginBottom: '-2rem', mixBlendMode: 'multiply', cursor: 'pointer' } as React.CSSProperties,
  subtitle:    { fontSize: 'clamp(0.78rem, 3vw, 0.9rem)', color: '#1e3166', margin: 0, fontWeight: 900 } as React.CSSProperties,
  section:     { background: '#ffffff', borderRadius: 12, padding: 'clamp(1rem, 3vw, 1.5rem)', marginBottom: '1rem', boxShadow: '0 1px 3px rgba(30,49,102,0.07), 0 1px 2px rgba(30,49,102,0.04)', border: '1px solid #daeef2', overflowWrap: 'break-word' as const },
  heading:     { fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.75rem', color: '#2ab9b0', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' as const, gap: '0.35rem' },
  empty:       { color: '#8aaabb', fontSize: '0.9rem' },
  list:        { listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.6rem' },
  insightItem: { background: '#e8f7f7', border: '1px solid #b0dcd8', borderRadius: 8, padding: '0.7rem 1rem', fontSize: '0.92rem', color: '#1e3166', lineHeight: 1.5 },
  insightCta:  { background: 'none', border: '1px solid #2ab9b0', color: '#2ab9b0', borderRadius: 6, padding: '0.3rem 0.75rem', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' },
  statRow:     { display: 'flex', gap: 'clamp(0.5rem, 2vw, 1rem)', marginBottom: '1rem', flexWrap: 'wrap' },
  stat:        { flex: 1, minWidth: 'min(100px, 100%)' as string, background: '#f0f9fb', borderRadius: 10, padding: 'clamp(0.6rem, 2vw, 1rem) clamp(0.5rem, 2vw, 1.1rem)', border: '1px solid #cce6ea' },
  statLabel:   { fontSize: '0.72rem', color: '#5b7a99', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600 },
  statValue:   { fontSize: 'clamp(1.1rem, 4vw, 1.45rem)', fontWeight: 700, letterSpacing: '-0.02em' },
  table:       { width: '100%', borderCollapse: 'collapse' },
  th:          { textAlign: 'left', padding: '0.5rem 0.75rem', background: '#f0f9fb', borderBottom: '1px solid #cce6ea', fontWeight: 600, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#5b7a99' },
  td:          TD_BASE,
  tdGreen:     { ...TD_BASE, color: '#0d7878' },
  tdRed:       { ...TD_BASE, color: '#dc2626' },
  tdBold:      { ...TD_BASE, fontWeight: 600 },
  subTotalRow:   { display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f0f9fb', border: '1px solid #cce6ea', borderRadius: 10, padding: '0.9rem 1.1rem', marginBottom: '1rem' },
  subTotalLabel: { fontSize: '0.85rem', color: '#5b7a99', fontWeight: 600 },
  subTotalValue: { fontSize: '1.35rem', fontWeight: 700, color: '#1e3166', letterSpacing: '-0.02em' },
  wasteBox:      { background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8, padding: '0.75rem 1rem', marginBottom: '1rem' },
  wasteTitle:    { fontSize: '0.8rem', fontWeight: 700, color: '#92400e', marginBottom: '0.4rem', textTransform: 'uppercase' as const, letterSpacing: '0.05em' },
  wasteItem:     { fontSize: '0.85rem', color: '#78350f', padding: '0.2rem 0' },
  subRowTop:     { ...TD_BASE, background: '#f0f9fb' },
  topBadge:      { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, borderRadius: '50%', background: '#2ab9b0', color: '#fff', fontSize: '0.65rem', fontWeight: 700, marginRight: '0.4rem' },
  tdDormant:     { ...TD_BASE, color: '#b45309' },
  dormantTag:    { marginLeft: '0.4rem', fontSize: '0.65rem', fontWeight: 600, color: '#b45309', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 4, padding: '0.1rem 0.35rem', textTransform: 'uppercase' as const, letterSpacing: '0.04em' },
  confBadge:     { display: 'inline-block', fontSize: '0.78rem', fontWeight: 700, border: '1px solid', borderRadius: 6, padding: '0.15rem 0.45rem' },
  btn:           { background: '#2ab9b0', color: '#ffffff', border: 'none', borderRadius: 8, padding: '0.6rem 1.2rem', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer' },
  btnDanger:     { background: 'transparent', color: '#dc2626', border: '1px solid #dc2626', borderRadius: 8, padding: '0.5rem 1rem', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', marginTop: '1rem' },
  upgradeBtn:    { background: 'linear-gradient(135deg, #2ab9b0, #1e3166)', color: '#ffffff', border: 'none', borderRadius: 8, padding: '0.6rem 1.2rem', fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer', marginTop: '0.5rem' },
  proBadge:      { display: 'inline-block', background: 'linear-gradient(135deg, #2ab9b0, #1e3166)', color: '#fff', fontSize: '0.65rem', fontWeight: 700, borderRadius: 4, padding: '0.15rem 0.5rem', letterSpacing: '0.06em', textTransform: 'uppercase' as const, marginTop: '0.35rem' },
  gearBtn:       { position: 'absolute' as const, top: '1rem', right: '1rem', background: 'none', border: 'none', cursor: 'pointer', color: '#8aaabb', padding: '0.55rem', borderRadius: 6, display: 'flex', alignItems: 'center', minWidth: 44, minHeight: 44, justifyContent: 'center' },
  gearBtnActive: { position: 'absolute' as const, top: '1rem', right: '1rem', background: '#e8f7f7', border: 'none', cursor: 'pointer', color: '#2ab9b0', padding: '0.55rem', borderRadius: 6, display: 'flex', alignItems: 'center', minWidth: 44, minHeight: 44, justifyContent: 'center' },
  proLabel:        { display: 'inline-block', background: '#f0fdf4', color: '#065f46', border: '1px solid #10b981', fontSize: '0.6rem', fontWeight: 700, borderRadius: 4, padding: '0.08rem 0.35rem', letterSpacing: '0.05em', textTransform: 'uppercase' as const, verticalAlign: 'middle', marginLeft: '0.4rem' },
  upgradeBtnSm:    { background: 'linear-gradient(135deg, #2ab9b0, #1e3166)', color: '#fff', border: 'none', borderRadius: 6, padding: '0.35rem 0.65rem', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' as const, flexShrink: 0, minHeight: 44 },
  lockedCard:      { display: 'flex', alignItems: 'center', gap: '0.6rem', background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: 10, padding: '0.75rem 0.85rem', flexWrap: 'wrap' as const },
  lockIcon:        { fontSize: '1.1rem', flexShrink: 0 },
  lockedNotifLabel:{ fontSize: '0.72rem', color: '#9ca3af', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.25rem' },
  btnOutline:    { background: 'transparent', color: '#2ab9b0', border: '1px solid #2ab9b0', borderRadius: 8, padding: '0.5rem 1rem', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' },
  btnDisabled:   { background: '#a0d8d5', color: '#ffffff', border: 'none', borderRadius: 8, padding: '0.6rem 1.2rem', fontSize: '0.9rem', fontWeight: 600, cursor: 'not-allowed' },
  connectedRow:  { display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' },
  connectedItem: { fontSize: '0.92rem', color: '#0d7878', fontWeight: 600, marginBottom: '0.25rem' },
  center:        { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontFamily: 'system-ui, sans-serif', background: '#f0f9fb', color: '#5b7a99' },
  introScreen:   { position: 'fixed' as const, inset: 0, zIndex: 999, display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center', background: '#f0f9fb', gap: '0.75rem', animation: 'fadeIn 0.6s ease, introFadeOut 3s ease forwards', padding: '2rem' },
  introLogo:     { width: 'min(220px, 55vw)', height: 'auto', mixBlendMode: 'multiply' as const } as React.CSSProperties,
  introTagline:  { fontSize: 'clamp(0.95rem, 4vw, 1.15rem)', fontWeight: 700, color: '#1e3166', letterSpacing: '0.01em', margin: 0, textAlign: 'center' as const },
  alertList:        { display: 'flex', flexDirection: 'column', gap: '0.6rem' },
  alertIcon:        { fontSize: '0.85rem', flexShrink: 0 },
  alertMsg:         { flex: 1, color: '#1e3166' },
  alertReadOverlay: { opacity: 0.45 },
  alertUnreadDot:   { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginLeft: '0.5rem', minWidth: 18, height: 18, borderRadius: 9, background: '#dc2626', color: '#fff', fontSize: '0.65rem', fontWeight: 700, padding: '0 4px' },
  alertActions:     { display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 },
  alertActionBtn:   { background: 'none', border: 'none', fontSize: '0.75rem', color: '#5b7a99', cursor: 'pointer', padding: '0.4rem 0.6rem', borderRadius: 4, fontWeight: 600, minHeight: 36 },
  alertDismissBtn:  { background: 'none', border: 'none', fontSize: '0.8rem', color: '#9ca3af', cursor: 'pointer', padding: '0.4rem 0.6rem', borderRadius: 4, lineHeight: 1, minHeight: 36 },
  notifEnableBtn:   { background: 'none', border: '1px solid #2ab9b0', color: '#2ab9b0', borderRadius: 6, padding: '0.15rem 0.6rem', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer' },
  notifDisableBtn:  { background: 'none', border: '1px solid #9ca3af', color: '#0d7878', borderRadius: 6, padding: '0.15rem 0.6rem', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer' },
  notifEnabledLabel:{ fontSize: '0.72rem', color: '#0d7878', fontWeight: 600 },
  pieWrapper:  { display: 'flex', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap' } as React.CSSProperties,
  pieDetail:   { flex: 1, minWidth: 'min(200px, 100%)' } as React.CSSProperties,
  detailPanel: { background: '#f0f9fb', border: '1px solid #cce6ea', borderRadius: 10, padding: '1.1rem 1.25rem' },
  detailTitle: { fontWeight: 700, fontSize: '1rem', marginBottom: '0.75rem', textTransform: 'capitalize', color: '#1e3166' },
  detailRow:   { display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0', borderBottom: '1px solid #e4f0f2', fontSize: '0.875rem', color: '#1e3166' },
}
