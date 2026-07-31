/**
 * The signed-in user, with a usable `id`.
 *
 * @nuxtjs/supabase v2 populates its user state from `auth.getClaims()`, so what
 * `useSupabaseUser()` returns is a JWT payload, not a User: the id lives on
 * `sub` and reading `.id` yields undefined. That silently breaks any comparison
 * against a `user_id` column rather than failing loudly. `requireUserClient`
 * normalises the same way on the server; this is the client half.
 */
export function useMe() {
  const config = useRuntimeConfig()
  if (config.public.localMode) return ref(null)

  const claims = useSupabaseUser()
  return computed(() => {
    if (!claims.value) return null
    const raw = claims.value as Record<string, any>
    const id = raw.sub ?? raw.id ?? null
    return id ? { ...raw, id } : null
  })
}
