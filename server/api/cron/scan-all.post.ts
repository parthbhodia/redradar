import { collectCandidates, upsertCandidates } from '../../utils/discovery'
import { createRedditAdapter } from '../../utils/reddit'

/**
 * Scans every active campaign. No user session: this is the scheduled entry
 * point, guarded by a shared secret instead. Point any scheduler at it:
 *
 *   curl -X POST https://your-host/api/cron/scan-all -H "x-cron-secret: $CRON_SECRET"
 */
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)

  if (!config.cronSecret) {
    throw createError({ statusCode: 503, statusMessage: 'Set CRON_SECRET to enable scheduled scans.' })
  }
  if (getHeader(event, 'x-cron-secret') !== config.cronSecret) {
    throw createError({ statusCode: 401, statusMessage: 'Bad cron secret.' })
  }

  const { serverSupabaseServiceRole } = await import('#supabase/server')
  // The project runs with supabase.types disabled, so the client generics
  // collapse to `never`; type rows locally instead.
  const admin = serverSupabaseServiceRole(event) as import('@supabase/supabase-js').SupabaseClient<any>

  const { data: campaigns, error } = await admin
    .from('campaigns')
    .select('id, name, status, brands(name, competitors)')
    .eq('status', 'active')

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  const reddit = createRedditAdapter({
    clientId: config.redditClientId,
    clientSecret: config.redditClientSecret,
    userAgent: config.redditUserAgent,
  })

  const results = []

  for (const campaign of campaigns ?? []) {
    const brand = Array.isArray(campaign.brands) ? campaign.brands[0] : campaign.brands
    if (!brand) continue

    const { data: keywords } = await admin
      .from('keywords')
      .select('phrase, subreddit_filter')
      .eq('campaign_id', campaign.id)

    if (!keywords?.length) continue

    try {
      const { candidates, scanned, errors } = await collectCandidates(keywords, brand, reddit, 25)
      const { inserted, updated, errors: upsertErrors } = await upsertCandidates(admin, campaign.id, candidates)
      results.push({
        campaign: campaign.name,
        scanned,
        inserted,
        updated,
        errors: [...errors, ...upsertErrors],
      })
    } catch (scanError) {
      results.push({ campaign: campaign.name, error: (scanError as Error).message })
    }
  }

  return { ranAt: new Date().toISOString(), campaigns: results.length, results }
})
