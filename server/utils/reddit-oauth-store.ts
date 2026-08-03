import type { SupabaseClient } from '@supabase/supabase-js'
import type { OAuthState, OAuthStateStore } from './reddit'

/**
 * Backs OAuthStateStore with the reddit_oauth_state singleton row (migration
 * 0009). Failures degrade to "no cached state" rather than throwing — a
 * missing table (migration not yet applied) or a transient read error should
 * make the adapter fetch a fresh token, not break the scan.
 */
export function createSupabaseOAuthStore(admin: SupabaseClient): OAuthStateStore {
  return {
    async read(): Promise<OAuthState | null> {
      const { data, error } = await admin
        .from('reddit_oauth_state')
        .select('access_token, token_expires_at, rate_limit_remaining, rate_limit_reset_at')
        .eq('id', 1)
        .maybeSingle()

      if (error || !data) return null

      return {
        token: data.access_token as string | null,
        expiresAt: data.token_expires_at ? new Date(data.token_expires_at as string).getTime() : 0,
        rateLimitRemaining: data.rate_limit_remaining as number | null,
        rateLimitResetAt: data.rate_limit_reset_at ? new Date(data.rate_limit_reset_at as string).getTime() : null,
      }
    },

    async write(state: OAuthState): Promise<void> {
      const { error } = await admin
        .from('reddit_oauth_state')
        .update({
          access_token: state.token,
          token_expires_at: state.expiresAt ? new Date(state.expiresAt).toISOString() : null,
          rate_limit_remaining: state.rateLimitRemaining,
          rate_limit_reset_at: state.rateLimitResetAt ? new Date(state.rateLimitResetAt).toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', 1)

      if (error) console.warn('[reddit-oauth-store] could not persist state:', error.message)
    },
  }
}
