import { serverSupabaseServiceRole } from '#supabase/server'
import type { DiscoverRequest, DiscoverResponse, RedditPost } from '#shared/types'
import { requireCampaign } from '../utils/guard'
import { createRedditAdapter } from '../utils/reddit'
import { scoreLead } from '../utils/scoring'

interface Candidate {
  post: RedditPost
  score: number
  signals: string[]
  keyword: string
}

export default defineEventHandler(async (event): Promise<DiscoverResponse> => {
  const body = await readBody<DiscoverRequest>(event)
  if (!body?.campaignId) {
    throw createError({ statusCode: 400, statusMessage: 'campaignId is required.' })
  }

  // Authorization happens here, under RLS, before any service-role write below.
  const { client, campaign, brand } = await requireCampaign(event, body.campaignId)

  const { data: keywords, error: keywordError } = await client
    .from('keywords')
    .select('phrase, subreddit_filter')
    .eq('campaign_id', campaign.id)

  if (keywordError) {
    throw createError({ statusCode: 500, statusMessage: keywordError.message })
  }
  if (!keywords?.length) {
    throw createError({ statusCode: 409, statusMessage: 'Add at least one keyword before scanning.' })
  }

  const config = useRuntimeConfig(event)
  const reddit = createRedditAdapter({
    clientId: config.redditClientId,
    clientSecret: config.redditClientSecret,
    userAgent: config.redditUserAgent,
  })

  const limit = Math.min(Math.max(body.limit ?? 25, 1), 100)
  const errors: string[] = []

  // A thread can match several keywords — keep whichever match scored best.
  const best = new Map<string, Candidate>()
  let scanned = 0

  for (const keyword of keywords) {
    let posts: RedditPost[]
    try {
      posts = await reddit.search({
        query: keyword.phrase,
        subreddit: keyword.subreddit_filter,
        sort: 'new',
        time: 'month',
        limit,
      })
    } catch (error) {
      errors.push(`"${keyword.phrase}": ${(error as Error).message}`)
      continue
    }

    scanned += posts.length

    for (const post of posts) {
      const { score, signals } = scoreLead(post, keyword.phrase, brand)
      const existing = best.get(post.id)
      if (!existing || score > existing.score) {
        best.set(post.id, { post, score, signals, keyword: keyword.phrase })
      }
    }
  }

  const candidates = [...best.values()]
  if (!candidates.length) {
    return { scanned, inserted: 0, updated: 0, skipped: 0, keywords: keywords.length, errors }
  }

  // Writes bypass RLS, which is why the access check above is not optional.
  const admin = serverSupabaseServiceRole(event)

  const { data: existingRows, error: existingError } = await admin
    .from('leads')
    .select('id, external_id')
    .eq('campaign_id', campaign.id)
    .eq('platform', 'reddit')
    .in('external_id', candidates.map(c => c.post.id))

  if (existingError) {
    throw createError({ statusCode: 500, statusMessage: existingError.message })
  }

  const existingByExternalId = new Map((existingRows ?? []).map(row => [row.external_id, row.id]))

  const toInsert = candidates.filter(c => !existingByExternalId.has(c.post.id))
  const toUpdate = candidates.filter(c => existingByExternalId.has(c.post.id))

  let inserted = 0
  if (toInsert.length) {
    const { error: insertError, count } = await admin
      .from('leads')
      .insert(
        toInsert.map(c => ({
          campaign_id: campaign.id,
          platform: 'reddit',
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
        { count: 'exact' },
      )

    if (insertError) {
      throw createError({ statusCode: 500, statusMessage: insertError.message })
    }
    inserted = count ?? toInsert.length
  }

  // Refresh scoring and thread text on re-scan, but never touch status or
  // reply_draft — those are the user's CRM state.
  let updated = 0
  for (const c of toUpdate) {
    const { error: updateError } = await admin
      .from('leads')
      .update({
        title: c.post.title,
        body: c.post.body,
        score: c.score,
        signals: c.signals,
        matched_keyword: c.keyword,
      })
      .eq('id', existingByExternalId.get(c.post.id)!)

    if (updateError) {
      errors.push(`update ${c.post.id}: ${updateError.message}`)
      continue
    }
    updated += 1
  }

  return {
    scanned,
    inserted,
    updated,
    skipped: scanned - candidates.length,
    keywords: keywords.length,
    errors,
  }
})
