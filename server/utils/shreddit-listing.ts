import type { RedditPost } from '#shared/types'
import type { RedditAdapter } from './reddit'

/**
 * Discovery via Reddit's own internal frontend endpoint — the one the current
 * site calls to lazy-load more posts as you scroll a subreddit. Free, no key.
 *
 * Verified 2026-08-02: four rapid repeats across three subreddits returned
 * full data with no degradation — more durable than RSS, which throttled on
 * the very next request. Real timestamps and real reply counts, which the
 * search-index adapter (search-index.ts) cannot provide at all.
 *
 * The trade is real and worth restating here, not just in PRIMARY.md: this is
 * an undocumented implementation detail of the current frontend, not a
 * published API — it can change shape or close with no notice. It also
 * cannot search; there is no "browse all of Reddit" endpoint, only "browse one
 * named subreddit". A keyword with no subreddit set gets a clear error, not a
 * silent empty result, so a scan doesn't quietly look like it covered a
 * keyword it structurally cannot reach this way. See PRIMARY.md section 3.9.5
 * for the full reasoning and the decision to use this as a free stopgap.
 */

const ENDPOINT = 'https://www.reddit.com/svc/shreddit/community-more-posts'

/** Reddit escapes title text as HTML entities inside the attribute value. */
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, '\'')
}

function parseAttrs(tagBody: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  const re = /([a-z0-9-]+)="([^"]*)"/gi
  let m: RegExpExecArray | null
  // eslint-disable-next-line no-cond-assign
  while ((m = re.exec(tagBody))) attrs[m[1]!] = m[2]!
  return attrs
}

// /r/<sub>/comments/<id>/<slug>/ — anything else isn't a thread permalink.
const PERMALINK = /^\/r\/([A-Za-z0-9_]+)\/comments\/([a-z0-9]+)\//i

function toPost(attrs: Record<string, string>): RedditPost | null {
  const permalink = attrs.permalink
  if (!permalink) return null

  const match = permalink.match(PERMALINK)
  if (!match) return null
  const [, subreddit, id] = match

  const title = decodeEntities(attrs['post-title'] ?? '')
  if (!title) return null

  return {
    id: id!,
    title,
    // Self-text isn't in these attributes, only the title. Scoring degrades
    // gracefully on an empty body — it just can't credit body-only matches —
    // rather than needing null-handling the way numComments/createdAt did.
    body: '',
    subreddit: subreddit!,
    author: attrs.author ?? '',
    url: `https://www.reddit.com${permalink}`,
    createdAt: attrs['created-timestamp'] || null,
    numComments: attrs['comment-count'] !== undefined ? Number(attrs['comment-count']) : null,
    ups: attrs.score !== undefined ? Number(attrs.score) : null,
    // Attribute name unconfirmed — not present on any post seen during
    // testing (none were NSFW). Defaults false, matching how the official
    // adapter already treats a missing over_18 field.
    over18: attrs.nsfw === 'true' || attrs['over-18'] === 'true',
  }
}

export function createShredditListingAdapter(userAgent: string): RedditAdapter {
  // Scoped to one adapter instance — i.e. one scan. Several keywords sharing
  // a subreddit hit the network once, not once per keyword; being a quieter
  // caller matters more here than for a documented API.
  const cache = new Map<string, Promise<RedditPost[]>>()

  async function fetchSubreddit(subreddit: string): Promise<RedditPost[]> {
    const key = subreddit.toLowerCase()
    let pending = cache.get(key)
    if (!pending) {
      pending = (async () => {
        const html = await $fetch<string>(
          `${ENDPOINT}/new/?name=${encodeURIComponent(subreddit)}`,
          {
            headers: {
              'User-Agent': userAgent,
              // Confirmed necessary, not cosmetic: a plain fetch() sending only
              // User-Agent gets 403'd where curl (which sets Accept: */* by
              // default) gets 200 on the identical URL. Node's fetch doesn't
              // add either header on its own the way curl and real browsers do.
              Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
              'Accept-Language': 'en-US,en;q=0.9',
            },
            responseType: 'text',
            timeout: 15_000,
            retry: 1,
          },
        )

        const posts: RedditPost[] = []
        const tagRe = /<shreddit-post\b([^>]*)>/g
        let m: RegExpExecArray | null
        // eslint-disable-next-line no-cond-assign
        while ((m = tagRe.exec(html))) {
          const post = toPost(parseAttrs(m[1]!))
          if (post) posts.push(post)
        }
        return posts
      })()
      cache.set(key, pending)
    }
    return pending
  }

  return {
    mode: 'listing',
    async search(options) {
      const sub = options.subreddit?.replace(/^\/?r\//i, '').trim()
      if (!sub) {
        // No "browse all of Reddit" endpoint exists here, only named-subreddit
        // listings — thrown rather than returning [] so a keyword with no
        // subreddit set shows up as a clear per-keyword error, not a scan that
        // silently looks like it covered ground it structurally cannot reach.
        throw new Error(
          'This keyword has no subreddit set. The free listing method can only browse a named subreddit, not search all of Reddit — add a subreddit to this keyword.',
        )
      }
      return fetchSubreddit(sub)
    },
  }
}
