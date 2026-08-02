import type { RedditPost } from '#shared/types'
import type { RedditAdapter, RedditSearchOptions } from './reddit'

/**
 * Discovery via a licensed web-search index, restricted to reddit.com.
 *
 * Reddit's Responsible Builder Policy requires approval before accessing Reddit
 * data, self-serve API credentials are no longer issuable, and the public JSON
 * endpoints now return 403. This route sidesteps all of that by not talking to
 * Reddit at all: we query a search engine we have a commercial relationship
 * with, and it returns links it has already indexed.
 *
 * The trade is real. An index knows a thread's title, URL and date; it does not
 * know its reply count or upvotes. Those come back null, and `scoreLead` skips
 * the engagement signals rather than assuming zero.
 */

interface ExaResult {
  id?: string
  title?: string | null
  url?: string
  publishedDate?: string | null
  author?: string | null
  text?: string | null
}

/**
 * Reddit permalinks look like /r/<sub>/comments/<id>/<slug>. Anything else —
 * subreddit landing pages, /u/ profiles, /wiki/ — is not a thread and must not
 * become a lead. Ingesting profile pages was a real bug once already.
 */
const PERMALINK = /reddit\.com\/r\/([A-Za-z0-9_]+)\/comments\/([a-z0-9]+)/i

function toPost(result: ExaResult): RedditPost | null {
  const url = result.url
  if (!url) return null

  const match = url.match(PERMALINK)
  if (!match) return null

  const [, subreddit, id] = match
  const title = (result.title ?? '').trim()
  if (!title) return null

  return {
    id: id!,
    title,
    body: (result.text ?? '').slice(0, 4000),
    subreddit: subreddit!,
    // The index reports the page author inconsistently for Reddit; an empty
    // string is honest, and nothing scores on it.
    author: (result.author ?? '').trim(),
    // Canonicalised: the index may hand back an old.reddit or share URL, and
    // dedupe upstream keys on (platform, external_id) plus this.
    url: `https://www.reddit.com/r/${subreddit}/comments/${id}/`,
    createdAt: result.publishedDate ?? new Date().toISOString(),
    numComments: null,
    ups: null,
    // The index does not expose NSFW status. Treated as false so the scorer's
    // penalty simply never fires, rather than blanket-penalising every lead.
    over18: false,
  }
}

function windowStart(time: RedditSearchOptions['time']): string | undefined {
  const hours: Record<string, number> = {
    hour: 1,
    day: 24,
    week: 24 * 7,
    month: 24 * 30,
    year: 24 * 365,
  }
  const span = hours[time ?? 'month']
  if (!span) return undefined // 'all'
  return new Date(Date.now() - span * 3_600_000).toISOString()
}

export function createSearchIndexAdapter(apiKey: string): RedditAdapter {
  return {
    mode: 'search',

    async search(options) {
      // Subreddit scoping is a query hint, not a filter: the index has no
      // notion of subreddits. Results are filtered properly below.
      const sub = options.subreddit?.replace(/^\/?r\//i, '').trim()
      const query = sub
        ? `${options.query} site:reddit.com/r/${sub}`
        : `${options.query} reddit discussion`

      const payload = await $fetch<{ results?: ExaResult[] }>('https://api.exa.ai/search', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'content-type': 'application/json',
        },
        body: {
          query,
          numResults: options.limit ?? 25,
          includeDomains: ['reddit.com'],
          startPublishedDate: windowStart(options.time),
          contents: { text: { maxCharacters: 2000 } },
        },
        retry: 1,
        timeout: 20_000,
      })

      const posts = (payload.results ?? [])
        .map(toPost)
        .filter((p): p is RedditPost => p !== null)

      // The index can return the same thread under several URLs.
      const seen = new Set<string>()
      const unique = posts.filter((p) => {
        if (seen.has(p.id)) return false
        seen.add(p.id)
        return true
      })

      // Honour `sort: 'new'` client-side. The index ranks by relevance and has
      // no sort parameter, so this is the closest we can get.
      if (options.sort === 'new') {
        unique.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      }

      // Post-filter to the requested subreddit, since the query hint above only
      // biases the index rather than constraining it.
      return sub
        ? unique.filter(p => p.subreddit.toLowerCase() === sub.toLowerCase())
        : unique
    },
  }
}
