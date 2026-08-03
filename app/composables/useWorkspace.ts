import type { Brand, Campaign, Org } from '#shared/types'

/**
 * Shared workspace state for the dashboard: the caller's org, its brands, and
 * the campaigns under them. Kept in `useState` so the layout and both pages
 * read the same objects without refetching per navigation.
 */
export function useWorkspace() {
  const org = useState<Org | null>('rr:org', () => null)
  const brands = useState<Brand[]>('rr:brands', () => [])
  const campaigns = useState<Campaign[]>('rr:campaigns', () => [])
  const activeBrandId = useState<string | null>('rr:brand', () => null)
  const activeCampaignId = useState<string | null>('rr:campaign', () => null)
  const ready = useState<boolean>('rr:ready', () => false)
  const localMode = useState<boolean>('rr:local', () => false)

  const config = useRuntimeConfig()
  const supabase = config.public.localMode ? null : useSupabaseClient()

  const activeBrand = computed(() => {
    if (!activeBrandId.value) return brands.value[0] ?? null
    return brands.value.find(b => b.id === activeBrandId.value) ?? brands.value[0] ?? null
  })
  const activeCampaign = computed(
    () => campaigns.value.find(c => c.id === activeCampaignId.value) ?? null,
  )

  async function load(force = false) {
    if (ready.value && !force) return

    if (config.public.localMode) {
      localMode.value = true
      const data = await $fetch<{ org: Org | null, brands: Brand[], campaigns: Campaign[] }>('/api/workspace')
      org.value = data.org
      brands.value = data.brands ?? []
      campaigns.value = data.campaigns ?? []
      if (!activeBrandId.value && brands.value.length) {
        activeBrandId.value = brands.value[0]!.id
      }
      if (!activeCampaignId.value || !campaigns.value.some(c => c.id === activeCampaignId.value)) {
        activeCampaignId.value = campaigns.value[0]?.id ?? null
      }
      ready.value = true
      return
    }

    const { data: memberships, error } = await supabase!
      .from('org_members')
      .select('orgs(id, name, slug, created_at)')
      .limit(1)

    if (error) throw new Error(error.message)

    const first = memberships?.[0] as { orgs: Org | Org[] } | undefined
    const found = first ? (Array.isArray(first.orgs) ? first.orgs[0] : first.orgs) : null
    org.value = found ?? null

    if (!org.value) {
      brands.value = []
      campaigns.value = []
      ready.value = true
      return
    }

    const { data: brandRows } = await supabase!
      .from('brands')
      .select('*')
      .eq('org_id', org.value.id)
      .order('created_at')

    brands.value = (brandRows ?? []) as Brand[]

    if (!activeBrandId.value && brands.value.length) {
      activeBrandId.value = brands.value[0]!.id
    }

    if (brands.value.length) {
      const { data: campaignRows } = await supabase!
        .from('campaigns')
        .select('*')
        .in('brand_id', brands.value.map(b => b.id))
        .order('created_at')

      campaigns.value = (campaignRows ?? []) as Campaign[]
    } else {
      campaigns.value = []
    }

    if (!activeCampaignId.value || !campaigns.value.some(c => c.id === activeCampaignId.value)) {
      activeCampaignId.value = campaigns.value[0]?.id ?? null
    }

    ready.value = true
  }

  async function createOrg(name: string) {
    if (config.public.localMode) {
      await $fetch('/api/workspace', { method: 'POST', body: { action: 'create_org', name } })
      await load(true)
      return
    }
    // Untyped Database (supabase.types is off) types rpc args as undefined.
    const { error } = await (supabase as any).rpc('create_org', { p_name: name })
    if (error) throw new Error(error.message)
    await load(true)
  }

  return {
    org,
    brands,
    campaigns,
    activeBrandId,
    activeCampaignId,
    activeBrand,
    activeCampaign,
    ready,
    localMode,
    load,
    createOrg,
    supabase,
  }
}
