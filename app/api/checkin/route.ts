import { auth }                   from '@clerk/nextjs/server'
import { NextResponse }            from 'next/server'
import { getLastCheckinAt, recordCheckin } from '@/lib/db/checkin'
import { getRecommendations }      from '@/lib/db/recommendations'
import { getCashflow }             from '@/lib/db/cashflow'
import { getPushSubscriptions }    from '@/lib/db/push'
import { getWebpush }              from '@/lib/push/client'
import { deletePushSubscription }  from '@/lib/db/push'

const CHECKIN_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

export interface CheckinData {
  safe_to_spend: string | null
  changes:       string[]
  recommendation: string | null
}

export async function POST(): Promise<Response> {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    // ── Enforce 7-day minimum interval ──────────────────────────────────────
    const lastAt = await getLastCheckinAt(userId)
    const now    = Date.now()
    const due    = !lastAt || (now - lastAt.getTime()) >= CHECKIN_INTERVAL_MS

    if (!due) {
      return NextResponse.json({ due: false })
    }

    // ── Assemble check-in data ───────────────────────────────────────────────
    const [recs, cashflow] = await Promise.all([
      getRecommendations(userId),
      getCashflow(userId),
    ])

    // Safe-to-spend from highest-priority rec
    const safeRec = recs.find(r => r.type === 'safe_to_spend_today')
    const safe_to_spend = safeRec
      ? safeRec.title   // e.g. "You can safely spend $42 today"
      : null

    // 1–2 notable changes from recent cashflow months
    const changes: string[] = []
    const months = cashflow.by_month
    if (months.length >= 2) {
      const curr = months[months.length - 1]
      const prev = months[months.length - 2]
      const diff = curr.outflow - prev.outflow
      if (Math.abs(diff) >= 50) {
        const dir = diff > 0 ? 'up' : 'down'
        changes.push(`Spending is ${dir} $${Math.abs(diff).toFixed(0)} vs last month`)
      }
      const netDiff = curr.net - prev.net
      if (Math.abs(netDiff) >= 100 && changes.length < 2) {
        const dir = netDiff > 0 ? 'improved' : 'dropped'
        changes.push(`Monthly net ${dir} by $${Math.abs(netDiff).toFixed(0)}`)
      }
    }

    // Top recommendation (non-safe-to-spend)
    const topRec = recs.find(r => r.type !== 'safe_to_spend_today') ?? null
    const recommendation = topRec ? topRec.title : null

    const data: CheckinData = { safe_to_spend, changes, recommendation }

    // ── Record the check-in ──────────────────────────────────────────────────
    await recordCheckin(userId)

    // ── Send push notification if subscriptions exist ────────────────────────
    const subscriptions = await getPushSubscriptions(userId)
    let push_sent = false

    if (subscriptions.length > 0) {
      const lines: string[] = []
      if (safe_to_spend)   lines.push(safe_to_spend)
      if (changes[0])      lines.push(changes[0])
      if (recommendation)  lines.push(recommendation)

      const payload = JSON.stringify({
        title:   'Your weekly money check-in',
        message: lines.join(' · ') || 'Open StratiFi to review your finances.',
      })

      const results = await Promise.allSettled(
        subscriptions.map(sub =>
          getWebpush().sendNotification(
            { endpoint: sub.endpoint, keys: sub.keys },
            payload
          ).catch(async (err: { statusCode?: number }) => {
            if (err.statusCode === 410) {
              await deletePushSubscription(sub.endpoint)
            }
            throw err
          })
        )
      )

      push_sent = results.some(r => r.status === 'fulfilled')
    }

    return NextResponse.json({ due: true, push_sent, data })
  } catch (err) {
    console.error('[/api/checkin]', err)
    return NextResponse.json({ error: 'Check-in failed.' }, { status: 500 })
  }
}
