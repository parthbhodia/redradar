import type { RedditPost } from '#shared/types'
import { createOpenCliAdapter } from './opencli-reddit'
import { phraseQuery } from './reddit-query'
import { createSearchIndexAdapter } from './search-index'
import { createShredditListingAdapter } from './shreddit-listing'

export interface RedditSearchOptions {
  query: string
  /** Restrict to a single subreddit (no leading `r/`). */
  subreddit?: string | null
  sort?: 'relevance' | 'new' | 'top' | 'comments'
  time?: 'hour' | 'day' | 'week' | 'month' | 'year' | 'all'
  limit?: number
}

/**
 * The one thing the rest of the app knows about Reddit. Swap the implementation
 * for the official API or a SERP provider without touching discovery/scoring.
 */
export interface RedditAdapter {
  readonly mode: 'oauth' | 'public' | 'search' | 'listing'
  search(options: RedditSearchOptions): Promise<RedditPost[]>
}

export interface RedditCredentials {
  clientId?: string
  clientSecret?: string
  userAgent: string
  /** Exa key. Enables the search-index route — see `search-index.ts`. */
  searchApiKey?: string
}

/** OAuth token + last-seen rate-limit reading, as persisted across requests. */
export interface OAuthState {
  token: string | null
  /** Epoch ms. */
  expiresAt: number
  rateLimitRemaining: number | null
  /** Epoch ms — already resolved from Reddit's relative "seconds until reset" at write time, so a stale read is still meaningful. */
  rateLimitResetAt: number | null
}

/**
 * createRedditAdapter() is called fresh on every /api/discover and
 * cron/scan-all request — there is no long-lived process to hold this state
 * in memory across requests. A store makes it survive anyway. Optional: with
 * no store (local mode, where discover.post.ts has no service-role client),
 * the adapter just refetches every time, same as before this existed — fine
 * for a single, non-shared local developer.
 */
export interface OAuthStateStore {
  read(): Promise<OAuthState | null>
  write(state: OAuthState): Promise<void>
}

interface RawListing {
  data?: {
    children?: Array<{ data?: RawPost }>
  }
}

interface RawPost {
  id?: string
  title?: string
  selftext?: string
  subreddit?: string
  author?: string
  permalink?: string
  created_utc?: number
  num_comments?: number
  ups?: number
  over_18?: boolean
}

function normalize(raw: RawPost | undefined): RedditPost | null {
  if (!raw?.id || !raw.permalink) return null
  return {
    id: raw.id,
    title: raw.title ?? '',
    body: raw.selftext ?? '',
    subreddit: raw.subreddit ?? '',
    author: raw.author ?? '',
    url: `https://www.reddit.com${raw.permalink}`,
    createdAt: new Date((raw.created_utc ?? 0) * 1000).toISOString(),
    // Reddit always sends these; `null` rather than `0` on the off chance it
    // doesn't, so a missing field reads as unknown instead of "no replies".
    numComments: raw.num_comments ?? null,
    ups: raw.ups ?? null,
    over18: raw.over_18 ?? false,
  }
}

function parseListing(payload: unknown): RedditPost[] {
  const listing = payload as RawListing
  const children = listing?.data?.children ?? []
  return children
    .map(child => normalize(child?.data))
    .filter((post): post is RedditPost => post !== null)
}

function searchPath(options: RedditSearchOptions) {
  const params = new URLSearchParams({
    q: phraseQuery(options.query),
    sort: options.sort ?? 'new',
    t: options.time ?? 'month',
    limit: String(options.limit ?? 25),
    type: 'link',
    raw_json: '1',
  })

  const sub = options.subreddit?.replace(/^\/?r\//i, '').trim()
  if (sub) {
    params.set('restrict_sr', 'on')
    return `/r/${encodeURIComponent(sub)}/search?${params.toString()}`
  }
  return `/search?${params.toString()}`
}

/**
 * Unauthenticated JSON endpoints. Fine for local dev and low volume; Reddit
 * rate-limits these aggressively and blocks many datacenter IPs outright.
 */
function createPublicAdapter(userAgent: string): RedditAdapter {
  return {
    mode: 'public',
    async search(options) {
      const path = searchPath(options).replace('/search?', '/search.json?')
      const payload = await $fetch(`https://www.reddit.com${path}`, {
        headers: { 'User-Agent': userAgent },
        retry: 1,
        timeout: 15_000,
      })
      return parseListing(payload)
    },
  }
}

/**
 * Below this many requests left in the current window, stop trusting the
 * fixed 1s pacing in reddit-rate-limit.ts and wait out Reddit's own reset
 * window instead. 5 is a buffer, not the wire — Reddit's OAuth limit is
 * ~60/min/app, shared across every workspace scanning concurrently, so
 * "remaining" can already be low from someone else's scan by the time this
 * one's first request lands.
 */
const RATE_LIMIT_LOW_WATERMARK = 5
const RATE_LIMIT_MAX_WAIT_MS = 60_000

/** App-only OAuth (client_credentials). Higher, more predictable rate limits. */
function createOAuthAdapter(
  creds: Required<Pick<RedditCredentials, 'clientId' | 'clientSecret'>> & { userAgent: string },
  store?: OAuthStateStore,
): RedditAdapter {
  let token: string | null = null
  let expiresAt = 0
  let rateLimitRemaining: number | null = null
  let rateLimitResetAt: number | null = null
  let stateLoaded = false

  // Runs once per adapter instance (i.e. once per request), before the first
  // token check or rate-limit check. With no store this is a no-op — the
  // adapter behaves exactly as it did before the store existed.
  async function ensureStateLoaded() {
    if (stateLoaded) return
    stateLoaded = true
    if (!store) return

    const cached = await store.read()
    if (!cached) return
    token = cached.token
    expiresAt = cached.expiresAt
    rateLimitRemaining = cached.rateLimitRemaining
    rateLimitResetAt = cached.rateLimitResetAt
  }

  async function persistState() {
    if (!store) return
    await store.write({ token, expiresAt, rateLimitRemaining, rateLimitResetAt })
  }

  async function accessToken() {
    await ensureStateLoaded()
    if (token && Date.now() < expiresAt) return token

    const basic = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString('base64')
    const res = await $fetch<{ access_token: string, expires_in: number }>(
      'https://www.reddit.com/api/v1/access_token',
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${basic}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': creds.userAgent,
        },
        body: new URLSearchParams({ grant_type: 'client_credentials' }).toString(),
        timeout: 15_000,
      },
    )

    token = res.access_token
    // Refresh a minute early so an in-flight scan never trips over expiry.
    expiresAt = Date.now() + (res.expires_in - 60) * 1000
    await persistState()
    return token
  }

  /**
   * Waits out Reddit's own reset window when the last response said we're
   * close to the ceiling. A no-op the vast majority of the time — this only
   * fires when the fixed pacing in reddit-rate-limit.ts wasn't conservative
   * enough for what Reddit is actually reporting right now. With a store,
   * "the last response" may be from a different workspace's scan entirely —
   * that's the point.
   */
  async function waitForRateLimitHeadroom() {
    await ensureStateLoaded()
    if (rateLimitRemaining === null || rateLimitRemaining > RATE_LIMIT_LOW_WATERMARK) return
    const waitMs = Math.min(RATE_LIMIT_MAX_WAIT_MS, Math.max(0, (rateLimitResetAt ?? Date.now() + 10_000) - Date.now()))
    console.warn(`[reddit] ${rateLimitRemaining} requests left, waiting ${Math.round(waitMs / 1000)}s for Reddit's own reset`)
    await new Promise(resolve => setTimeout(resolve, waitMs))
  }

  return {
    mode: 'oauth',
    async search(options) {
      await waitForRateLimitHeadroom()

      const response = await $fetch.raw(`https://oauth.reddit.com${searchPath(options)}`, {
        headers: {
          Authorization: `Bearer ${await accessToken()}`,
          'User-Agent': creds.userAgent,
        },
        retry: 1,
        timeout: 15_000,
      })

      // Absent on some responses (e.g. auth errors) — leave the prior reading
      // in place rather than resetting to "unknown" on a fluke.
      const remaining = response.headers.get('x-ratelimit-remaining')
      const reset = response.headers.get('x-ratelimit-reset')
      if (remaining !== null) rateLimitRemaining = Math.floor(Number(remaining))
      // Reddit reports reset as seconds-from-now, which stops meaning anything
      // the moment it's stored — resolve to an absolute time immediately.
      if (reset !== null) rateLimitResetAt = Date.now() + Number(reset) * 1000
      await persistState()

      return parseListing(response._data)
    },
  }
}

/**
 * Picks a data source, best first.
 *
 * The landscape as of 2026-08: OAuth credentials can no longer be issued, and
 * the public JSON endpoints return 403 to every user agent. OpenCLI works but
 * drives a real Chrome, so it exists only on a developer's machine — never on
 * Vercel. The shreddit-listing adapter is free and currently open even in
 * production, but it can only browse a named subreddit, not search all of
 * Reddit, and it is an undocumented frontend detail rather than a published
 * API — see PRIMARY.md 3.9.5 and 3.9.7. The search index costs money and is
 * used only if a key is configured.
 */
export function createRedditAdapter(creds: RedditCredentials, oauthStore?: OAuthStateStore): RedditAdapter {
  if (creds.clientId && creds.clientSecret) {
    return createOAuthAdapter({
      clientId: creds.clientId,
      clientSecret: creds.clientSecret,
      userAgent: creds.userAgent,
    }, oauthStore)
  }

  const searchIndex = creds.searchApiKey
    ? createSearchIndexAdapter(creds.searchApiKey)
    : null

  // OpenCLI still wins where it exists: it sees reply counts and upvotes, which
  // the search index cannot, and those drive two of the scorer's signals. The
  // listing adapter sees the same fields as OpenCLI, for free, but only for
  // keywords that have a subreddit set — it throws otherwise, which the chain
  // below treats as "try the next source", not "nothing found".
  const opencli = process.env.REDDIT_USE_OPENCLI !== '0' ? createOpenCliAdapter() : null
  const listing = createShredditListingAdapter(creds.userAgent)
  const pub = createPublicAdapter(creds.userAgent)

  const chain = [opencli, listing, searchIndex, pub].filter((a): a is RedditAdapter => a !== null)

  return {
    mode: opencli ? 'oauth' : searchIndex ? 'search' : 'listing',
    async search(options) {
      let firstError: unknown
      for (const adapter of chain) {
        try {
          const posts = await adapter.search(options)
          // An empty result from a working adapter is a real answer, but from
          // OpenCLI on a machine with no Chrome it's indistinguishable from a
          // silent failure — so keep going when nothing came back.
          if (posts.length) return posts
        } catch (error) {
          firstError ??= error
        }
      }
      if (firstError) throw firstError
      return []
    },
  }
}
