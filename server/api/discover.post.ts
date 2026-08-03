import type { DiscoverRequest, DiscoverResponse } from '#shared/types'
import { collectCandidates, upsertCandidates } from '../utils/discovery'
import { requireCampaign } from '../utils/guard'
import { isLocalMode, listKeywords, upsertLeads } from '../utils/local-db'
import { createRedditAdapter } from '../utils/reddit'
import { checkRedditRateLimitStatus } from '../utils/reddit-rate-limit'
import { createSupabaseOAuthStore } from '../utils/reddit-oauth-store'
import { getScanQuota, untilReset } from '../utils/scan-quota'
import { completeScan, requestScanAccess, type ScanQueueStatus } from '../utils/scan-queue'
import { checkCampaignScanState, failScanRun, finishScanRun, startScanRun } from '../utils/scan-runs'

export default defineEventHandler(async (event): Promise<DiscoverResponse & { queueStatus?: ScanQueueStatus }> => {
  const body = await readBody<DiscoverRequest>(event)
  if (!body?.campaignId) {
    throw createError({ statusCode: 400, statusMessage: 'campaignId is required.' })
  }

  const { client, campaign, brand, local, user } = await requireCampaign(event, body.campaignId)

  // Local mode keeps its own SQLite store and has no scan history — the
  // per-campaign lock/cooldown below only applies where scan_runs exists.
  const cloud = !(local || isLocalMode())
  const admin = cloud
    ? (await import('#supabase/server')).serverSupabaseServiceRole(event)
    : null

  // DB-backed, not the in-memory queue below: source of truth across every
  // serverless instance, and specific to this campaign rather than global
  // Reddit-credential access. Checked first so a scan that's going to be
  // blocked or need confirming never reserves a queue slot for nothing.
  if (admin) {
    const state = await checkCampaignScanState(admin, campaign.id)

    if (state.blocked) {
      throw createError({
        statusCode: 409,
        statusMessage: state.blockedBy
          ? `${state.blockedBy} started a scan for this campaign. Wait for it to finish.`
          : 'A scan for this campaign is already running.',
        data: { scanBlocked: true, blockedBy: state.blockedBy, startedAt: state.blockedStartedAt },
      })
    }

    if (state.needsConfirm && !body.force) {
      throw createError({
        statusCode: 409,
        statusMessage: 'This campaign was scanned recently.',
        data: { needsConfirm: true, lastScannedAt: state.lastScannedAt },
      })
    }
  }

  // Check global scan queue (protects shared Reddit OAuth credentials)
  const queueResult = requestScanAccess(user?.id ?? 'anonymous', body.campaignId)
  if (!queueResult.canProceed) {
    throw createError({
      statusCode: 202, // 202 Accepted - queued, not rejected
      statusMessage: queueResult.status.message,
      data: { queueStatus: queueResult.status },
    })
  }

  const scanToken = queueResult.token!

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
  // Without this, createRedditAdapter's OAuth token and rate-limit tracking
  // reset to nothing on every single scan request — it's created fresh here,
  // not held in a long-lived process. The store makes both survive across
  // requests (and across every workspace sharing this one Reddit app). No
  // store in local mode: no service-role client to back it with, and a
  // single local developer refetching a token every scan is harmless.
  const oauthStore = admin ? createSupabaseOAuthStore(admin) : undefined
  const reddit = createRedditAdapter({
    clientId: config.redditClientId,
    clientSecret: config.redditClientSecret,
    userAgent: config.redditUserAgent,
    searchApiKey: config.searchApiKey,
  }, oauthStore)

  // Hard cap at 25 regardless of what a direct call asks for — the UI never
  // sends `limit` itself, so this only matters against someone hitting the
  // endpoint straight, and 100 results/keyword is a lot of unpaced Reddit
  // API surface to hand out on request.
  const limit = Math.min(Math.max(body.limit ?? 25, 1), 25)

  // Rate limit before doing any work. Enforced here rather than in the UI
  // because the endpoint is reachable directly.
  let quota = null
  if (admin && user?.id) {
    quota = await getScanQuota(
      admin,
      user.id,
      user.email,
      config.adminEmails,
      config.public.dailyScanLimit,
    )
    if (quota.remaining <= 0) {
      throw createError({
        statusCode: 429,
        statusMessage: `Daily scan limit reached (${quota.limit} per day). Resets ${untilReset(quota.resetsAt)}.`,
        // Carried on the error so the client can show the real reset time
        // rather than guessing at it.
        data: { quota },
      })
    }
  }

  // Opened before touching Reddit, so a scan that dies mid-flight is still
  // visible as `running` instead of leaving no trace. It also consumes the
  // quota slot: a scan that errors still cost a Reddit round trip.
  const runId = admin
    ? await startScanRun(admin, campaign.id, { trigger: 'manual', triggeredBy: user?.id ?? null })
    : null

  // The run just opened counts against the allowance.
  const quotaAfter = quota && !quota.unlimited
    ? { ...quota, used: quota.used + 1, remaining: Math.max(0, quota.remaining - 1) }
    : quota

  const rateLimitStatus = quotaAfter ? checkRedditRateLimitStatus(quotaAfter) : null

  let collected
  try {
    collected = await collectCandidates(keywords, brand, reddit, limit)
  } catch (error) {
    completeScan(scanToken) // Release queue slot
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
    completeScan(scanToken) // Release queue slot
    return { scanned, inserted: 0, updated: 0, skipped: 0, keywords: keywords.length, errors, quota: quotaAfter }
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
    completeScan(scanToken) // Release queue slot
    return {
      scanned,
      inserted: result.inserted,
      updated: result.updated,
      skipped: scanned - candidates.length,
      keywords: keywords.length,
      errors,
      quota: quotaAfter,
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

    completeScan(scanToken) // Release queue slot
    return {
      scanned,
      inserted: result.inserted,
      updated: result.updated,
      skipped: scanned - candidates.length,
      keywords: keywords.length,
      errors: allErrors,
      quota: quotaAfter,
    }
  } catch (error) {
    completeScan(scanToken) // Release queue slot
    await failScanRun(admin, runId, (error as Error).message)
    throw createError({ statusCode: 500, statusMessage: (error as Error).message })
  }
})
