import { auth }         from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { isDemoUser }   from '@/lib/demo'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ is_demo: false })

  try {
    const is_demo = await isDemoUser(userId)
    return NextResponse.json({ is_demo })
  } catch {
    return NextResponse.json({ is_demo: false })
  }
}
