import type { SupabaseClient } from '@supabase/supabase-js'

/** Manual scans a non-admin account may run per UTC day. */
export const DAILY_SCAN_LIMIT = 3

export interface ScanQuota {
  limit: number
  used: number
  remaining: number
  /** ISO timestamp of the next UTC midnight, so the UI can say when it resets. */
  resetsAt: string
  unlimited: boolean
}

/**
 * Admins are configured by email, not hardcoded: this repo is public, and a
 * literal address in source is both a privacy leak and a redeploy away from
 * being wrong. Set ADMIN_EMAILS to a comma-separated list.
 */
export function isAdminEmail(email: string | null | undefined, adminEmails: string): boolean {
  if (!email) return false
  const allow = adminEmails
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean)

  return allow.includes(email.trim().toLowerCase())
}

function nextUtcMidnight(): Date {
  const now = new Date()
  return new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
  ))
}

function startOfUtcDay(): Date {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

/**
 * Counts the caller's manual scans today. Scheduled runs are excluded: nobody
 * pressed anything, so they shouldn't consume a human's allowance.
 *
 * Counted through the service role, because a user could otherwise stay under
 * their limit by scanning a campaign they later lose access to.
 */
export async function getScanQuota(
  admin: SupabaseClient,
  userId: string,
  email: string | null | undefined,
  adminEmails: string,
): Promise<ScanQuota> {
  const resetsAt = nextUtcMidnight().toISOString()

  if (isAdminEmail(email, adminEmails)) {
    return { limit: Infinity, used: 0, remaining: Infinity, resetsAt, unlimited: true }
  }

  const { count, error } = await admin
    .from('scan_runs')
    .select('id', { count: 'exact', head: true })
    .eq('triggered_by', userId)
    .eq('trigger', 'manual')
    .gte('started_at', startOfUtcDay().toISOString())

  if (error) {
    throw new Error(`Could not check the scan quota: ${error.message}`)
  }

  const used = count ?? 0
  return {
    limit: DAILY_SCAN_LIMIT,
    used,
    remaining: Math.max(0, DAILY_SCAN_LIMIT - used),
    resetsAt,
    unlimited: false,
  }
}

/** Human-readable "in 4 hours" for the limit message. */
export function untilReset(resetsAt: string): string {
  const hours = Math.max(0, (new Date(resetsAt).getTime() - Date.now()) / 3_600_000)
  if (hours < 1) return `in ${Math.max(1, Math.round(hours * 60))} minutes`
  return `in ${Math.round(hours)} hour${Math.round(hours) === 1 ? '' : 's'}`
}
