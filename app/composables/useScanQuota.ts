import type { ScanQuotaInfo } from '#shared/types'

function nextUtcMidnight(): string {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString()
}

/**
 * Shared so the header badge and the scan button always agree. A scan response
 * carries the updated quota, so the common case costs no extra request.
 */
export function useScanQuota() {
  const quota = useState<ScanQuotaInfo | null>('rr:quota', () => null)
  const loaded = useState<boolean>('rr:quota-loaded', () => false)

  const exhausted = computed(
    () => Boolean(quota.value && !quota.value.unlimited && quota.value.remaining <= 0),
  )

  async function load(force = false) {
    if (loaded.value && !force) return
    try {
      quota.value = await $fetch<ScanQuotaInfo | null>('/api/quota')
    } catch {
      // A missing quota shouldn't break the page it's decorating.
      quota.value = null
    } finally {
      loaded.value = true
    }
  }

  /** Applied from a scan response so the badge updates without a round trip. */
  function set(next: ScanQuotaInfo | null | undefined) {
    if (next !== undefined) {
      quota.value = next
      loaded.value = true
    }
  }

  /** Local fallback when a 429 tells us the allowance is gone. */
  function markExhausted(fromServer?: ScanQuotaInfo | null) {
    if (fromServer) {
      quota.value = fromServer
      return
    }
    const limit = quota.value?.limit || useRuntimeConfig().public.dailyScanLimit
    quota.value = {
      limit,
      used: limit,
      remaining: 0,
      // Same rule the server uses, so the countdown is right even if we never
      // managed to load the real quota.
      resetsAt: quota.value?.resetsAt ?? nextUtcMidnight(),
      unlimited: false,
    }
  }

  function resetsIn() {
    if (!quota.value?.resetsAt) return 'tomorrow'
    const hours = Math.max(0, (new Date(quota.value.resetsAt).getTime() - Date.now()) / 3_600_000)
    if (hours < 1) return `in ${Math.max(1, Math.round(hours * 60))} minutes`
    const h = Math.round(hours)
    return `in ${h} hour${h === 1 ? '' : 's'}`
  }

  return { quota, loaded, exhausted, load, set, markExhausted, resetsIn }
}
