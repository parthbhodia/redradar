import type { RedditPost } from '#shared/types'
import { createOpenCliAdapter } from './opencli-reddit'
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
    q: options.query,
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

/** App-only OAuth (client_credentials). Higher, more predictable rate limits. */
function createOAuthAdapter(creds: Required<Pick<RedditCredentials, 'clientId' | 'clientSecret'>> & { userAgent: string }): RedditAdapter {
  let token: string | null = null
  let expiresAt = 0

  async function accessToken() {
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
    return token
  }

  return {
    mode: 'oauth',
    async search(options) {
      const payload = await $fetch(`https://oauth.reddit.com${searchPath(options)}`, {
        headers: {
          Authorization: `Bearer ${await accessToken()}`,
          'User-Agent': creds.userAgent,
        },
        retry: 1,
        timeout: 15_000,
      })
      return parseListing(payload)
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
export function createRedditAdapter(creds: RedditCredentials): RedditAdapter {
  if (creds.clientId && creds.clientSecret) {
    return createOAuthAdapter({
      clientId: creds.clientId,
      clientSecret: creds.clientSecret,
      userAgent: creds.userAgent,
    })
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
