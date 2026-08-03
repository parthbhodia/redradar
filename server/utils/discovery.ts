import type { SupabaseClient } from '@supabase/supabase-js'
import type { Brand, RedditPost } from '#shared/types'
import type { RedditAdapter } from './reddit'
import { enforceRedditPacing } from './reddit-rate-limit'
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

/** Per-keyword outcome for one scan, recorded in scan_run_keywords. */
export interface KeywordOutcome {
  phrase: string
  subreddit_filter: string | null
  /** Threads Reddit returned for this phrase. */
  scanned: number
  /** Threads that survived filtering and won their dedupe against other keywords. */
  matched: number
  top_score: number | null
  error: string | null
}

export interface CollectResult {
  candidates: Candidate[]
  scanned: number
  errors: string[]
  perKeyword: KeywordOutcome[]
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
  const perKeyword: KeywordOutcome[] = []
  let scanned = 0

  for (const keyword of keywords) {
    const outcome: KeywordOutcome = {
      phrase: keyword.phrase,
      subreddit_filter: keyword.subreddit_filter,
      scanned: 0,
      matched: 0,
      top_score: null,
      error: null,
    }
    perKeyword.push(outcome)

    let posts: RedditPost[]
    try {
      // Enforce rate limiting: 1 second minimum between Reddit API calls
      await enforceRedditPacing()
      posts = await reddit.search({
        query: keyword.phrase,
        subreddit: keyword.subreddit_filter,
        sort: 'new',
        time: 'month',
        limit,
      })
    } catch (error) {
      const message = (error as Error).message
      outcome.error = message
      errors.push(`"${keyword.phrase}": ${message}`)
      continue
    }

    scanned += posts.length
    outcome.scanned = posts.length

    for (const post of posts) {
      // `u/Someone` is a user profile page, not a community. Reddit search
      // returns them, but a reply there reaches nobody.
      if (/^u[/_]/i.test(post.subreddit ?? '')) continue

      const { score, signals, matchStrength } = scoreLead(post, keyword.phrase, brand)
      if (outcome.top_score === null || score > outcome.top_score) {
        outcome.top_score = score
      }

      // A weak match means the keyword never actually appeared in any
      // meaningful way — the scorer only capped its score as a signal for
      // debugging. Letting it through anyway is how an unrelated recipe post
      // ends up in the inbox next to "linktree alternative" leads.
      if (matchStrength === 'weak') continue

      const existing = best.get(post.id)
      if (!existing || score > existing.score) {
        best.set(post.id, { post, score, signals, keyword: keyword.phrase })
      }
    }
  }

  // Attribute each surviving candidate to the keyword that actually won it,
  // so `matched` sums to the candidate count rather than double-counting
  // threads several keywords found.
  const wonBy = new Map<string, number>()
  for (const c of best.values()) {
    wonBy.set(c.keyword, (wonBy.get(c.keyword) ?? 0) + 1)
  }
  for (const outcome of perKeyword) {
    outcome.matched = wonBy.get(outcome.phrase) ?? 0
  }

  return { candidates: [...best.values()], scanned, errors, perKeyword }
}

export interface UpsertResult {
  inserted: number
  updated: number
  errors: string[]
  /** inserted/updated split per keyword, for scan_run_keywords. */
  byKeyword: Map<string, { inserted: number, updated: number }>
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
  const byKeyword = new Map<string, { inserted: number, updated: number }>()
  const bump = (keyword: string, field: 'inserted' | 'updated') => {
    const row = byKeyword.get(keyword) ?? { inserted: 0, updated: 0 }
    row[field] += 1
    byKeyword.set(keyword, row)
  }

  if (!candidates.length) {
    return { inserted: 0, updated: 0, errors, byKeyword }
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
          num_comments: c.post.numComments,
        })),
        { count: 'exact' },
      )

    if (insertError) {
      throw new Error(insertError.message)
    }
    inserted = count ?? toInsert.length
    for (const c of toInsert) bump(c.keyword, 'inserted')
  }

  let updated = 0
  for (const c of toUpdate) {
    const patch: Record<string, unknown> = {
      title: c.post.title,
      body: c.post.body,
      score: c.score,
      signals: c.signals,
      matched_keyword: c.keyword,
    }
    // A source with no engagement data (the search index) reports null —
    // never let that erase a comment count an earlier OAuth/OpenCLI scan
    // already recorded, or the "new activity since you replied" delta
    // breaks the moment a scan happens to fall back to a weaker source.
    if (c.post.numComments !== null) patch.num_comments = c.post.numComments

    const { error: updateError } = await admin
      .from('leads')
      .update(patch)
      .eq('id', existingByExternalId.get(c.post.id)!)

    if (updateError) {
      errors.push(`update ${c.post.id}: ${updateError.message}`)
      continue
    }
    updated += 1
    bump(c.keyword, 'updated')
  }

  return { inserted, updated, errors, byKeyword }
}
