import type { SupabaseClient } from '@supabase/supabase-js'
import type { Brand, RedditPost } from '#shared/types'
import type { RedditAdapter } from './reddit'
import { scoreLead } from './scoring'

export interface Candidate {
  post: RedditPost
  score: number
  signals: string[]
  keyword: string
}

export interface KeywordRow {
  phrase: string
  subreddit_filter: string | null
}

export interface CollectResult {
  candidates: Candidate[]
  scanned: number
  errors: string[]
}

/**
 * Search Reddit for every keyword, score what comes back, and keep the best
 * match per thread. Shared by the interactive scan and the cron scan.
 */
export async function collectCandidates(
  keywords: KeywordRow[],
  brand: Pick<Brand, 'name' | 'competitors'>,
  reddit: RedditAdapter,
  limit: number,
): Promise<CollectResult> {
  const errors: string[] = []
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
      // `u/Someone` is a user profile page, not a community. Reddit search
      // returns them, but a reply there reaches nobody.
      if (/^u[/_]/i.test(post.subreddit ?? '')) continue

      const { score, signals } = scoreLead(post, keyword.phrase, brand)
      const existing = best.get(post.id)
      if (!existing || score > existing.score) {
        best.set(post.id, { post, score, signals, keyword: keyword.phrase })
      }
    }
  }

  return { candidates: [...best.values()], scanned, errors }
}

export interface UpsertResult {
  inserted: number
  updated: number
  errors: string[]
}

/**
 * Write candidates through the service role. Refreshes scoring and thread text
 * on threads seen before, but never touches status, drafts, claims, or the
 * posted reply: that state belongs to the team, not the scanner.
 */
export async function upsertCandidates(
  admin: SupabaseClient,
  campaignId: string,
  candidates: Candidate[],
): Promise<UpsertResult> {
  const errors: string[] = []

  if (!candidates.length) {
    return { inserted: 0, updated: 0, errors }
  }

  const { data: existingRows, error: existingError } = await admin
    .from('leads')
    .select('id, external_id')
    .eq('campaign_id', campaignId)
    .eq('platform', 'reddit')
    .in('external_id', candidates.map(c => c.post.id))

  if (existingError) {
    throw new Error(existingError.message)
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
          campaign_id: campaignId,
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
      throw new Error(insertError.message)
    }
    inserted = count ?? toInsert.length
  }

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

  return { inserted, updated, errors }
}
