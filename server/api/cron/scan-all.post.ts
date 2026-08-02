import { collectCandidates, upsertCandidates } from '../../utils/discovery'
import { createRedditAdapter } from '../../utils/reddit'
import { failScanRun, finishScanRun, startScanRun } from '../../utils/scan-runs'

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
    searchApiKey: config.searchApiKey,
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

    // Nobody is watching a 3am run, so the run row is the only report.
    const runId = await startScanRun(admin, campaign.id, { trigger: 'scheduled' })

    try {
      const { candidates, scanned, errors, perKeyword } = await collectCandidates(keywords, brand, reddit, 25)
      const upsert = await upsertCandidates(admin, campaign.id, candidates)
      const allErrors = [...errors, ...upsert.errors]

      await finishScanRun(admin, runId, {
        keywords: keywords.length,
        scanned,
        inserted: upsert.inserted,
        updated: upsert.updated,
        skipped: scanned - candidates.length,
        errors: allErrors,
        perKeyword,
        byKeyword: upsert.byKeyword,
      })

      results.push({
        campaign: campaign.name,
        runId,
        scanned,
        inserted: upsert.inserted,
        updated: upsert.updated,
        errors: allErrors,
      })
    } catch (scanError) {
      const message = (scanError as Error).message
      await failScanRun(admin, runId, message)
      results.push({ campaign: campaign.name, runId, error: message })
    }
  }

  return { ranAt: new Date().toISOString(), campaigns: results.length, results }
})
