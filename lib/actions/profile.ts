'use server'

import { auth }              from '@clerk/nextjs/server'
import { query }             from '@/lib/db/client'
import { profileSchema }     from '@/lib/schemas/profile'
import { computeAndSaveScores } from '@/lib/actions/score'
import { redirect }          from 'next/navigation'

export async function saveProfile(data: unknown): Promise<{ error: string }> {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const parsed = profileSchema.safeParse(data)
  if (!parsed.success) {
    return { error: 'Invalid profile data. Please check your entries.' }
  }

  try {
    const cols  = Object.keys(parsed.data)
    const vals  = Object.values(parsed.data)
    const sets  = cols.map((c, i) => `${c} = $${i + 2}`).join(', ')
    const placeholders = cols.map((_, i) => `$${i + 2}`).join(', ')

    await query(
      `INSERT INTO profiles (id, ${cols.join(', ')})
       VALUES ($1, ${placeholders})
       ON CONFLICT (id) DO UPDATE SET ${sets}`,
      [userId, ...vals]
    )
  } catch (err) {
    return { error: (err as Error).message }
  }

  await computeAndSaveScores(userId, parsed.data)
  redirect('/')
}
