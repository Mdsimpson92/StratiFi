/**
 * Sliding-window rate limiter backed by Upstash Redis.
 *
 * Strategy: fixed-window counter stored as a Redis key with TTL.
 *   Key format:  rl:{prefix}:{userId}
 *   Value:       integer counter
 *   Expiry:      windowMs (auto-set on first increment)
 *
 * Falls back to in-memory Map when Redis is unavailable
 * (missing env vars or network failure). Fallback is logged once.
 *
 * Usage:
 *   const limiter = createRateLimiter('chat', 10, 60_000)
 *   if (await limiter.check(userId)) return 429
 */

import { Redis } from '@upstash/redis'

// ─── Redis client (singleton) ─────────────────────────────────────────────────

let redis: Redis | null = null
let redisDisabled = false

function getRedis(): Redis | null {
  if (redisDisabled) return null
  if (redis) return redis

  const url   = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN

  if (!url || !token) {
    console.warn('[rate-limit] UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN not set — using in-memory fallback')
    redisDisabled = true
    return null
  }

  redis = new Redis({ url, token })
  return redis
}

// ─── In-memory fallback ───────────────────────────────────────────────────────

interface MemEntry {
  count:       number
  windowStart: number
}

function createMemoryFallback(maxRequests: number, windowMs: number) {
  const store = new Map<string, MemEntry>()

  return {
    check(key: string): boolean {
      const now   = Date.now()
      const entry = store.get(key)

      if (!entry || now - entry.windowStart >= windowMs) {
        store.set(key, { count: 1, windowStart: now })
        return false
      }

      if (entry.count >= maxRequests) return true
      entry.count++
      return false
    },
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface RateLimiter {
  /** Returns true if the caller is blocked (over limit). Never throws. */
  check(key: string): Promise<boolean>
}

/**
 * Create a rate limiter.
 *
 * @param prefix      - namespace for Redis keys (e.g. 'chat', 'escalate')
 * @param maxRequests - max allowed requests per window
 * @param windowMs    - window duration in milliseconds
 */
export function createRateLimiter(
  prefix:      string,
  maxRequests: number,
  windowMs:    number,
): RateLimiter {
  const fallback = createMemoryFallback(maxRequests, windowMs)
  const windowSec = Math.ceil(windowMs / 1000)

  return {
    async check(key: string): Promise<boolean> {
      const client = getRedis()

      // No Redis → use in-memory fallback
      if (!client) return fallback.check(key)

      const redisKey = `rl:${prefix}:${key}`

      try {
        const count = await client.incr(redisKey)

        // First request in the window — set the TTL
        if (count === 1) {
          await client.expire(redisKey, windowSec)
        }

        return count > maxRequests
      } catch (err) {
        // Redis unreachable at runtime — degrade to in-memory
        console.error('[rate-limit] Redis error, falling back to memory:', (err as Error).message)
        return fallback.check(key)
      }
    },
  }
}
