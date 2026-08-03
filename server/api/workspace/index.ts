import {
  addKeyword,
  createCampaign,
  createLocalOrg,
  getOrgForUser,
  listAllLeads,
  listBrands,
  listCampaigns,
  listKeywords,
  listLeads,
  removeKeyword,
  updateLead,
  upsertBrand,
} from '../../utils/local-db'
import { requireUserClient } from '../../utils/guard'
import { isLocalMode } from '../../utils/local-db'

export default defineEventHandler(async (event) => {
  if (!isLocalMode()) {
    throw createError({ statusCode: 404, statusMessage: 'Local workspace API is disabled.' })
  }

  const { user } = await requireUserClient(event)
  const method = event.method

  if (method === 'GET') {
    const query = getQuery(event)
    const me = { id: user.id, email: user.email }
    const org = getOrgForUser(user.id)
    if (!org) {
      return { org: null, brands: [], campaigns: [], keywords: [], leads: [], me }
    }

    const brands = listBrands(org.id)
    const campaigns = listCampaigns(brands.map(b => b.id))

    if (query.keywords === '1' && typeof query.campaignId === 'string') {
      return { keywords: listKeywords(query.campaignId) }
    }

    if (query.leads === '1' && typeof query.campaignId === 'string') {
      return { leads: listLeads(query.campaignId) }
    }

    // Cross-campaign work queue for the dashboard: every lead the org owns,
    // tagged with its brand/campaign, plus who's asking (for the greeting and
    // the "mine" split).
    if (query.allLeads === '1') {
      return { leads: listAllLeads(org.id), me }
    }

    return { org, brands, campaigns, me }
  }

  if (method === 'POST') {
    const body = await readBody<{
      action?: string
      name?: string
      brand?: {
        id?: string
        name: string
        tagline?: string | null
        description?: string | null
        voice?: string | null
        competitors?: string[]
      }
      brandId?: string
      campaignId?: string
      phrase?: string
      subreddit?: string | null
      keywordId?: string
      leadId?: string
      patch?: { status?: string, reply_draft?: string, claimed_by?: string | null, claimed_at?: string | null }
    }>(event)

    switch (body.action) {
      case 'create_org': {
        const org = createLocalOrg(user.id, body.name || '')
        return { org }
      }
      case 'upsert_brand': {
        const org = getOrgForUser(user.id)
        if (!org) throw createError({ statusCode: 409, statusMessage: 'Create a workspace first.' })
        if (!body.brand?.name) throw createError({ statusCode: 400, statusMessage: 'Brand name required.' })
        const brand = upsertBrand({ ...body.brand, org_id: org.id })
        return { brand }
      }
      case 'create_campaign': {
        if (!body.brandId || !body.name) {
          throw createError({ statusCode: 400, statusMessage: 'brandId and name required.' })
        }
        const campaign = createCampaign(body.brandId, body.name)
        return { campaign }
      }
      case 'add_keyword': {
        if (!body.campaignId || !body.phrase) {
          throw createError({ statusCode: 400, statusMessage: 'campaignId and phrase required.' })
        }
        // Rate limit: 10 keywords per campaign (1 sec × 10 = 10 sec max scan)
        const MAX_KEYWORDS_PER_CAMPAIGN = 10
        const existingKeywords = listKeywords(body.campaignId)
        if (existingKeywords.length >= MAX_KEYWORDS_PER_CAMPAIGN) {
          throw createError({
            statusCode: 409,
            statusMessage: `Keyword limit (${MAX_KEYWORDS_PER_CAMPAIGN}) reached. Remove some to add more.`,
          })
        }
        const keyword = addKeyword(
          body.campaignId,
          body.phrase,
          body.subreddit?.replace(/^\/?r\//i, '').trim() || null,
        )
        return { keyword }
      }
      case 'remove_keyword': {
        if (!body.keywordId) throw createError({ statusCode: 400, statusMessage: 'keywordId required.' })
        removeKeyword(body.keywordId)
        return { ok: true }
      }
      case 'update_lead': {
        if (!body.leadId || !body.patch) {
          throw createError({ statusCode: 400, statusMessage: 'leadId and patch required.' })
        }
        const patch = body.patch as any
        // When status changes to 'queued', claim the lead for this user and
        // stamp when. When it goes back to 'new', release it — clear both, so
        // the dashboard's "claimed but stale" logic can't fire on a free lead.
        if (patch.status === 'queued') {
          patch.claimed_by = user.id
          patch.claimed_at = new Date().toISOString()
        } else if (patch.status === 'new') {
          patch.claimed_by = null
          patch.claimed_at = null
        }
        const lead = updateLead(body.leadId, patch)
        return { lead }
      }
      default:
        throw createError({ statusCode: 400, statusMessage: 'Unknown action.' })
    }
  }

  throw createError({ statusCode: 405, statusMessage: 'Method not allowed.' })
})
