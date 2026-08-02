/**
 * Shared team/seats state so the header badge and the Settings page agree
 * without each holding its own copy. Local mode has no team concept — the
 * badge and Settings page both just don't render for it.
 */
export function useTeam() {
  const members = useState<any[]>('rr:members', () => [])
  const loaded = useState<boolean>('rr:members-loaded', () => false)
  const config = useRuntimeConfig()
  const supabase = config.public.localMode ? null : useSupabaseClient()

  async function load(force = false) {
    if (config.public.localMode || !supabase) return
    if (loaded.value && !force) return

    const { data, error } = await supabase
      .from('org_members')
      .select('user_id, role, created_at, profiles!org_members_user_profile_fkey(display_name, email)')
      .order('created_at')

    // Before migration 0002 the profiles table doesn't exist; degrade to an
    // empty list rather than breaking whatever page asked for it.
    if (!error) members.value = data ?? []
    loaded.value = true
  }

  return { members, loaded, load, supabase }
}
