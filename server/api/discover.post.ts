import type { DiscoverRequest, DiscoverResponse } from '#shared/types'
import { collectCandidates, upsertCandidates } from '../utils/discovery'
import { requireCampaign } from '../utils/guard'
import { isLocalMode, listKeywords, upsertLeads } from '../utils/local-db'
import { createRedditAdapter } from '../utils/reddit'
import { failScanRun, finishScanRun, startScanRun } from '../utils/scan-runs'

export default defineEventHandler(async (event): Promise<DiscoverResponse> => {
  const body = await readBody<DiscoverRequest>(event)
  if (!body?.campaignId) {
    throw createError({ statusCode: 400, statusMessage: 'campaignId is required.' })
  }

  const { client, campaign, brand, local, user } = await requireCampaign(event, body.campaignId)

  let keywords: Array<{ phrase: string, subreddit_filter: string | null }>
  if (local) {
    keywords = listKeywords(campaign.id).map(k => ({
      phrase: k.phrase,
      subreddit_filter: k.subreddit_filter,
    }))
  } else {
    const { data, error: keywordError } = await client!
      .from('keywords')
      .select('phrase, subreddit_filter')
      .eq('campaign_id', campaign.id)

    if (keywordError) {
      throw createError({ statusCode: 500, statusMessage: keywordError.message })
    }
    keywords = data ?? []
  }

  if (!keywords.length) {
    throw createError({ statusCode: 409, statusMessage: 'Add at least one keyword before scanning.' })
  }

  const config = useRuntimeConfig(event)
  const reddit = createRedditAdapter({
    clientId: config.redditClientId,
    clientSecret: config.redditClientSecret,
    userAgent: config.redditUserAgent,
  })

  const limit = Math.min(Math.max(body.limit ?? 25, 1), 100)

  // Local mode keeps its own SQLite store and has no scan history.
  const cloud = !(local || isLocalMode())
  const admin = cloud
    ? (await import('#supabase/server')).serverSupabaseServiceRole(event)
    : null

  // Opened before touching Reddit, so a scan that dies mid-flight is still
  // visible as `running` instead of leaving no trace.
  const runId = admin
    ? await startScanRun(admin, campaign.id, { trigger: 'manual', triggeredBy: user?.id ?? null })
    : null

  let collected
  try {
    collected = await collectCandidates(keywords, brand, reddit, limit)
  } catch (error) {
    if (admin) await failScanRun(admin, runId, (error as Error).message)
    throw createError({ statusCode: 502, statusMessage: (error as Error).message })
  }

  const { candidates, scanned, errors, perKeyword } = collected

  if (!candidates.length) {
    if (admin) {
      await finishScanRun(admin, runId, {
        keywords: keywords.length,
        scanned,
        inserted: 0,
        updated: 0,
        skipped: 0,
        errors,
        perKeyword,
        byKeyword: new Map(),
      })
    }
    return { scanned, inserted: 0, updated: 0, skipped: 0, keywords: keywords.length, errors }
  }

  if (!admin) {
    const result = upsertLeads(
      campaign.id,
      candidates.map(c => ({
        external_id: c.post.id,
        url: c.post.url,
        title: c.post.title,
        body: c.post.body,
        subreddit: c.post.subreddit,
        author: c.post.author,
        score: c.score,
        signals: c.signals,
        matched_keyword: c.keyword,
        posted_at: c.post.createdAt,
      })),
    )
    return {
      scanned,
      inserted: result.inserted,
      updated: result.updated,
      skipped: scanned - candidates.length,
      keywords: keywords.length,
      errors,
    }
  }

  try {
    const result = await upsertCandidates(admin, campaign.id, candidates)
    const allErrors = [...errors, ...result.errors]

    await finishScanRun(admin, runId, {
      keywords: keywords.length,
      scanned,
      inserted: result.inserted,
      updated: result.updated,
      skipped: scanned - candidates.length,
      errors: allErrors,
      perKeyword,
      byKeyword: result.byKeyword,
    })

    return {
      scanned,
      inserted: result.inserted,
      updated: result.updated,
      skipped: scanned - candidates.length,
      keywords: keywords.length,
      errors: allErrors,
    }
  } catch (error) {
    await failScanRun(admin, runId, (error as Error).message)
    throw createError({ statusCode: 500, statusMessage: (error as Error).message })
  }
})
