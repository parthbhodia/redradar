/**
 * Reddit API Rate Limiting Strategy
 *
 * Reddit's OAuth rate limits (app-only, client_credentials):
 * - 60 requests per minute per app
 * - Resets every 60 seconds
 *
 * Public API rate limits (unauthenticated):
 * - 30 requests per minute per IP
 * - Heavily rate-limited and often returns 403
 *
 * Strategy:
 * - Minimum 1 second between Reddit API calls (safe buffer: 60/min < 60/min limit)
 * - Per-user rate limit: 3 scans/day (configurable via DAILY_SCAN_LIMIT)
 * - Each scan can hit multiple keywords; pacing prevents abuse
 * - If a scan queries 3 keywords: 3 * 1000ms = 3 seconds total
 */

const REDDIT_API_MIN_DELAY_MS = 1000 // 1 second minimum between requests
const LAST_REDDIT_CALL = new Map<string, number>() // Per-adapter tracking

/**
 * Enforces minimum delay between Reddit API calls to avoid rate limiting.
 * Call before each Reddit API request.
 */
export async function enforceRedditPacing(adapterId: string = 'default') {
  const now = Date.now()
  const lastCall = LAST_REDDIT_CALL.get(adapterId) ?? 0
  const elapsed = now - lastCall

  if (elapsed < REDDIT_API_MIN_DELAY_MS) {
    const delay = REDDIT_API_MIN_DELAY_MS - elapsed
    await new Promise(resolve => setTimeout(resolve, delay))
  }

  LAST_REDDIT_CALL.set(adapterId, Date.now())
}

/**
 * Reset pacing (useful for testing or when switching adapters).
 */
export function resetRedditPacing() {
  LAST_REDDIT_CALL.clear()
}

export interface RateLimitStatus {
  remaining: number
  resetAt: string
  canScan: boolean
  message?: string
}

export function checkRedditRateLimitStatus(quota: any): RateLimitStatus {
  if (quota?.unlimited) {
    return {
      remaining: Infinity,
      resetAt: new Date().toISOString(),
      canScan: true,
    }
  }

  const canScan = (quota?.remaining ?? 0) > 0

  return {
    remaining: quota?.remaining ?? 0,
    resetAt: quota?.resetsAt ?? new Date().toISOString(),
    canScan,
    message: canScan
      ? `${quota?.remaining} scan${quota?.remaining === 1 ? '' : 's'} remaining today`
      : `Daily limit reached. Resets ${new Date(quota?.resetsAt).toLocaleString()}`,
  }
}
