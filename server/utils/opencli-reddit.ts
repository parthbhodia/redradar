import { execFile } from 'node:child_process'
import { dirname, delimiter } from 'node:path'
import { promisify } from 'node:util'
import type { RedditPost } from '#shared/types'
import type { RedditAdapter, RedditSearchOptions } from './reddit'

const execFileAsync = promisify(execFile)

/**
 * `opencli` is a `#!/usr/bin/env node` script, so it runs on whichever Node is
 * first on PATH — under nvm that's often an old default (v16), and OpenCLI
 * refuses to start below v20. Put this process's own Node first so the child
 * inherits the version already running the server.
 */
function childEnv() {
  const ownBin = dirname(process.execPath)
  return {
    ...process.env,
    PATH: [ownBin, process.env.PATH].filter(Boolean).join(delimiter),
  }
}

interface OpenCliRow {
  id?: string
  title?: string
  subreddit?: string
  author?: string
  score?: number
  comments?: number
  url?: string
  created_utc?: number | string
  selftext?: string
}

function normalizeSubreddit(value: string | undefined) {
  return (value ?? '').replace(/^\/?r\//i, '').trim()
}

function toPost(row: OpenCliRow): RedditPost | null {
  if (!row.id || !row.url) return null
  const created = typeof row.created_utc === 'string'
    ? Number(row.created_utc)
    : (row.created_utc ?? 0)

  return {
    id: String(row.id),
    title: row.title ?? '',
    body: row.selftext ?? '',
    subreddit: normalizeSubreddit(row.subreddit),
    author: row.author ?? '',
    url: row.url.startsWith('http') ? row.url : `https://www.reddit.com${row.url}`,
    createdAt: new Date((Number.isFinite(created) ? created : 0) * 1000).toISOString(),
    numComments: Number(row.comments) || 0,
    ups: Number(row.score) || 0,
    over18: false,
  }
}

/**
 * Uses the OpenCLI Chrome bridge (`opencli reddit search`) when the public
 * Reddit JSON endpoints are blocked. Requires a connected browser session.
 */
export function createOpenCliAdapter(): RedditAdapter {
  return {
    mode: 'oauth',
    async search(options: RedditSearchOptions) {
      const args = [
        'reddit',
        'search',
        options.query,
        '--sort', options.sort ?? 'new',
        '--time', options.time ?? 'month',
        '--limit', String(options.limit ?? 25),
        '-f', 'json',
        '--window', 'background',
      ]

      const sub = options.subreddit?.replace(/^\/?r\//i, '').trim()
      if (sub) {
        args.push('--subreddit', sub)
      }

      try {
        const { stdout } = await execFileAsync('opencli', args, {
          timeout: 90_000,
          maxBuffer: 8 * 1024 * 1024,
          env: childEnv(),
        })
        const parsed = JSON.parse(stdout) as OpenCliRow[] | { error?: string }
        if (!Array.isArray(parsed)) {
          throw new Error((parsed as { error?: string }).error || 'Unexpected OpenCLI response')
        }
        return parsed.map(toPost).filter((post): post is RedditPost => post !== null)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        throw new Error(`OpenCLI Reddit search failed: ${message}`)
      }
    },
  }
}
