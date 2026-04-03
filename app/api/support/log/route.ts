import { auth }            from '@clerk/nextjs/server'
import { NextResponse }     from 'next/server'
import { getInteractions }  from '@/lib/support/log'

/**
 * GET /api/support/log
 *
 * Returns persisted support interactions for the authenticated user.
 *
 * Query params:
 *   ?escalated=true   — filter to escalated entries only
 *   ?limit=50         — cap result count (default 100, max 500)
 */
export async function GET(req: Request): Promise<Response> {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const escalatedOnly    = searchParams.get('escalated') === 'true'
  const limit            = Math.min(parseInt(searchParams.get('limit') ?? '100', 10), 500)

  try {
    const entries = await getInteractions(userId, { escalatedOnly, limit })

    return NextResponse.json({
      count:   entries.length,
      entries,
    })
  } catch (err) {
    console.error('[support/log]', err)
    return NextResponse.json({ error: 'Failed to load support log.' }, { status: 500 })
  }
}
