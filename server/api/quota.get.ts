import type { ScanQuotaInfo } from '#shared/types'
import { requireUserClient } from '../utils/guard'
import { getScanQuota } from '../utils/scan-quota'

/**
 * The caller's scan allowance, so the header badge can show it without waiting
 * for someone to run a scan.
 */
export default defineEventHandler(async (event): Promise<ScanQuotaInfo | null> => {
  const { user, local } = await requireUserClient(event)

  // Local mode has no scan history and no limit.
  if (local) return null

  const config = useRuntimeConfig(event)
  const { serverSupabaseServiceRole } = await import('#supabase/server')
  const admin = serverSupabaseServiceRole(event) as import('@supabase/supabase-js').SupabaseClient<any>

  const quota = await getScanQuota(admin, user.id, user.email, config.adminEmails)

  // Infinity doesn't survive JSON; the flag is what the UI reads anyway.
  return {
    ...quota,
    limit: quota.unlimited ? 0 : quota.limit,
    remaining: quota.unlimited ? 0 : quota.remaining,
  }
})
