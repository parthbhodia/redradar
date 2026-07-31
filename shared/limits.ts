/**
 * Product limits.
 *
 * These are only the fallbacks. Both are set from env at runtime — see
 * `runtimeConfig.public` in nuxt.config.ts — so the numbers can change without
 * a code edit. Read them through `useLimits()` (client) or `useRuntimeConfig()`
 * (server) rather than importing these directly, or an env change won't apply.
 */

/** Seats per workspace, including the owner. `MAX_ORG_MEMBERS`. */
export const DEFAULT_MAX_ORG_MEMBERS = 3

/** Manual scans per user per UTC day. `DAILY_SCAN_LIMIT`. */
export const DEFAULT_DAILY_SCAN_LIMIT = 3

/** Env values arrive as strings and may be absent or junk. */
export function positiveIntOr(fallback: number, raw: string | number | undefined | null): number {
  const n = typeof raw === 'number' ? raw : Number.parseInt(String(raw ?? ''), 10)
  return Number.isFinite(n) && n > 0 ? n : fallback
}
