'use server'

import { auth }          from '@clerk/nextjs/server'
import { query }         from '@/lib/db/client'
import { revalidatePath } from 'next/cache'

/** Enable public sharing for the current user's report. */
export async function enableSharing(): Promise<{ error?: string; userId?: string }> {
  const { userId } = await auth()
  if (!userId) return { error: 'Not authenticated' }

  try {
    await query(`UPDATE profiles SET share_enabled = true WHERE id = $1`, [userId])
  } catch (err) {
    return { error: (err as Error).message }
  }

  revalidatePath('/')
  return { userId }
}

/** Disable public sharing for the current user's report. */
export async function disableSharing(): Promise<{ error?: string }> {
  const { userId } = await auth()
  if (!userId) return { error: 'Not authenticated' }

  try {
    await query(`UPDATE profiles SET share_enabled = false WHERE id = $1`, [userId])
  } catch (err) {
    return { error: (err as Error).message }
  }

  revalidatePath('/')
  return {}
}
