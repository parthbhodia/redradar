import type { H3Event } from 'h3'
import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'

/**
 * Returns a Supabase client bound to the caller's session, so every query below
 * still runs under RLS. Throws 401 when there's no session.
 */
export async function requireUserClient(event: H3Event) {
  const user = await serverSupabaseUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Not signed in.' })
  }
  return { user, client: await serverSupabaseClient(event) }
}

/**
 * Loads a campaign with its brand. RLS does the authorization — a campaign in
 * someone else's org simply doesn't come back.
 */
export async function requireCampaign(event: H3Event, campaignId: string) {
  const { client } = await requireUserClient(event)

  const { data, error } = await client
    .from('campaigns')
    .select('id, name, status, brand_id, brands(id, org_id, name, tagline, description, voice, competitors)')
    .eq('id', campaignId)
    .single()

  if (error || !data) {
    throw createError({ statusCode: 404, statusMessage: 'Campaign not found.' })
  }

  const brand = Array.isArray(data.brands) ? data.brands[0] : data.brands
  if (!brand) {
    throw createError({ statusCode: 404, statusMessage: 'Campaign has no brand.' })
  }

  return { client, campaign: data, brand }
}
