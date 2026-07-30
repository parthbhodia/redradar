import type { Brand, RedditPost } from '#shared/types'

export interface ScoreResult {
  score: number
  signals: string[]
}

/** Phrases that suggest someone is actively shopping rather than just chatting. */
const INTENT_PATTERNS: Array<[RegExp, string]> = [
  [/\balternatives?\s+to\b|\balternative\b/i, 'looking for an alternative'],
  [/\brecommend(ations?|ing)?\b|\bsuggestions?\b/i, 'asking for recommendations'],
  [/\blooking for\b|\bin search of\b|\bneed a\b/i, 'stated need'],
  [/\bbest\b.*\b(for|to)\b/i, 'best-X-for query'],
  [/\bvs\.?\b|\bcompared? to\b|\bor\b.*\?/i, 'comparison'],
  [/\bswitch(ing|ed)? (from|to)\b|\bmigrat(e|ing) (from|to)\b/i, 'switching tools'],
  [/\bworth it\b|\bany good\b|\banyone use[ds]?\b/i, 'evaluating options'],
  [/\bhelp me (find|choose|pick)\b/i, 'explicit help request'],
]

/** Threads that are structurally bad targets no matter how well they match. */
const NEGATIVE_PATTERNS: Array<[RegExp, string, number]> = [
  [/\bgiveaway\b|\bpromo code\b|\bdiscount code\b|\bcoupon\b/i, 'promo thread', 18],
  [/\bhiring\b|\bfor hire\b|\bjob post\b/i, 'hiring thread', 20],
  [/\bmegathread\b|\bweekly (thread|discussion)\b|\bdaily thread\b/i, 'recurring megathread', 25],
  [/^\s*\[?meta\]?\b/i, 'meta/mod post', 15],
]

const BOT_AUTHORS = new Set(['automoderator', '[deleted]'])

function tokenize(phrase: string) {
  return phrase
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(t => t.length > 2)
}

function hoursSince(iso: string) {
  const then = new Date(iso).getTime()
  if (!Number.isFinite(then) || then <= 0) return Number.POSITIVE_INFINITY
  return (Date.now() - then) / 3_600_000
}

/**
 * Heuristic 0-100 relevance score. Deliberately explainable — every point moved
 * is attached to a signal string the inbox can show, so a bad score is
 * debuggable without rerunning the scan.
 */
export function scoreLead(post: RedditPost, phrase: string, brand?: Pick<Brand, 'name' | 'competitors'> | null): ScoreResult {
  const signals: string[] = []
  let score = 0

  const title = post.title ?? ''
  const body = post.body ?? ''
  const haystack = `${title}\n${body}`
  const needle = phrase.trim().toLowerCase()

  // --- keyword match -------------------------------------------------------
  if (needle && title.toLowerCase().includes(needle)) {
    score += 35
    signals.push(`exact phrase in title: "${phrase}"`)
  } else if (needle && body.toLowerCase().includes(needle)) {
    score += 18
    signals.push(`exact phrase in body: "${phrase}"`)
  } else {
    const tokens = tokenize(phrase)
    if (tokens.length) {
      const inTitle = tokens.filter(t => title.toLowerCase().includes(t)).length
      const ratio = inTitle / tokens.length
      if (ratio === 1) {
        score += 20
        signals.push('all keyword terms in title')
      } else if (ratio >= 0.5) {
        score += 10
        signals.push('partial keyword match in title')
      } else {
        signals.push('weak keyword match')
      }
    }
  }

  // --- intent --------------------------------------------------------------
  let intentHit = false
  for (const [pattern, label] of INTENT_PATTERNS) {
    if (pattern.test(title)) {
      score += intentHit ? 6 : 20
      signals.push(label)
      intentHit = true
    } else if (!intentHit && pattern.test(body)) {
      score += 10
      signals.push(`${label} (in body)`)
      intentHit = true
    }
  }

  if (title.includes('?')) {
    score += 8
    signals.push('question in title')
  }

  // --- competitors ---------------------------------------------------------
  const competitors = (brand?.competitors ?? []).filter(Boolean)
  const mentioned = competitors.filter(c => haystack.toLowerCase().includes(c.toLowerCase()))
  if (mentioned.length) {
    score += 12
    signals.push(`mentions ${mentioned.slice(0, 3).join(', ')}`)
  }

  // Already talking about you — worth seeing, but it's a different play.
  if (brand?.name && haystack.toLowerCase().includes(brand.name.toLowerCase())) {
    score += 6
    signals.push(`mentions ${brand.name}`)
  }

  // --- freshness -----------------------------------------------------------
  const age = hoursSince(post.createdAt)
  if (age <= 24) {
    score += 15
    signals.push('posted in the last 24h')
  } else if (age <= 72) {
    score += 10
    signals.push('posted in the last 3 days')
  } else if (age <= 24 * 7) {
    score += 5
    signals.push('posted this week')
  } else if (age > 24 * 30) {
    score -= 10
    signals.push('older than a month')
  }

  // --- engagement ----------------------------------------------------------
  // Few comments means the question is probably still open; a big pile means
  // anything you write lands at the bottom.
  if (post.numComments <= 5) {
    score += 8
    signals.push('few replies so far')
  } else if (post.numComments > 60) {
    score -= 8
    signals.push('crowded thread')
  }

  if (post.ups >= 20) {
    score += 4
    signals.push('has traction')
  }

  // --- disqualifiers -------------------------------------------------------
  for (const [pattern, label, penalty] of NEGATIVE_PATTERNS) {
    if (pattern.test(title)) {
      score -= penalty
      signals.push(`penalty: ${label}`)
    }
  }

  if (post.over18) {
    score -= 30
    signals.push('penalty: NSFW')
  }

  if (BOT_AUTHORS.has(post.author.toLowerCase())) {
    score = 0
    signals.push('penalty: bot or deleted author')
  }

  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    signals,
  }
}
