import type { H3Event } from 'h3'
import { getCookie, setCookie, deleteCookie } from 'h3'
import {
  getCampaignWithBrand,
  getLocalUser,
  isLocalMode,
  userCanAccessCampaign,
} from './local-db'

export const LOCAL_SESSION_COOKIE = 'rr_local_uid'

export function setLocalSession(event: H3Event, userId: string) {
  setCookie(event, LOCAL_SESSION_COOKIE, userId, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  })
}

export function clearLocalSession(event: H3Event) {
  deleteCookie(event, LOCAL_SESSION_COOKIE, { path: '/' })
}

export async function requireUserClient(event: H3Event) {
  if (isLocalMode()) {
    const userId = getCookie(event, LOCAL_SESSION_COOKIE)
    if (!userId) {
      throw createError({ statusCode: 401, statusMessage: 'Not signed in.' })
    }
    const user = getLocalUser(userId)
    if (!user) {
      throw createError({ statusCode: 401, statusMessage: 'Not signed in.' })
    }
    return { user: { id: user.id, email: user.email }, client: null as null, local: true as const }
  }

  // Lazy import so local-mode routes that only need cookies don't fail when the
  // Supabase Nuxt module isn't generating the #supabase/server alias.
  const mod = await import('#supabase/server') as {
    serverSupabaseClient: (event: H3Event) => Promise<any>
    serverSupabaseUser: (event: H3Event) => Promise<any>
  }
  const claims = await mod.serverSupabaseUser(event)
  if (!claims) {
    throw createError({ statusCode: 401, statusMessage: 'Not signed in.' })
  }

  // @nuxtjs/supabase v2 resolves this from `auth.getClaims()`, so it is a JWT
  // payload rather than a User: the id lives on `sub`. Reading `.id` yields
  // undefined, which silently writes a NULL user_id and trips RLS instead of
  // failing loudly. Normalise here so callers never have to know.
  const id = claims.sub ?? claims.id
  if (!id) {
    throw createError({ statusCode: 401, statusMessage: 'Session has no user id.' })
  }

  return {
    user: { ...claims, id, email: claims.email },
    client: await mod.serverSupabaseClient(event),
    local: false as const,
  }
}

export async function requireCampaign(event: H3Event, campaignId: string) {
  const auth = await requireUserClient(event)

  if (auth.local) {
    if (!userCanAccessCampaign(auth.user.id, campaignId)) {
      throw createError({ statusCode: 404, statusMessage: 'Campaign not found.' })
    }
    const row = getCampaignWithBrand(campaignId)
    if (!row) {
      throw createError({ statusCode: 404, statusMessage: 'Campaign not found.' })
    }
    return { ...auth, campaign: row.campaign, brand: row.brand }
  }

  const { data, error } = await auth.client!
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

  return { ...auth, campaign: data, brand }
}
