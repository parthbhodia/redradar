import type { Brand, RedditPost } from '#shared/types'

export interface ScoreResult {
  score: number
  signals: string[]
}

/** Phrases that suggest someone is actively shopping rather than just chatting. */
const INTENT_PATTERNS: Array<[RegExp, string]> = [
  [/\balternatives?\s+to\b|\balternative\b/i, 'looking for an alternative'],
  [/\brecommend(ations?|ing)?\b|\bsuggestions?\b/i, 'asking for recommendations'],
  // `need a` on its own matched any expressed need ("I need a logical landing
  // spot"), so it now has to be a need for a *thing you'd shop for*.
  [/\blooking for\b|\bin search of\b|\bneed (a |an )?(good |free |decent |better )?(tool|app|service|software|alternative|option|recommendation)/i, 'stated need'],
  [/\bbest\b.*\b(for|to)\b/i, 'best-X-for query'],
  // `or ... ?` used to live here. It matched any question containing the word
  // "or" — "Any tips or fixes?", "Should I Stay Put or Make a Move?" — and was
  // the single largest source of false positives.
  [/\bvs\.?\b|\bversus\b|\bcompared? to\b/i, 'comparison'],
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

/** Ceiling for threads that never actually matched the keyword. */
const WEAK_MATCH_CAP = 20

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
  // Tracked as a strength, not just points: everything else in this function is
  // circumstantial, and circumstantial signals must not be able to promote a
  // thread that isn't on topic. See the cap at the end.
  let matchStrength: 'strong' | 'partial' | 'weak' = 'weak'

  if (needle && title.toLowerCase().includes(needle)) {
    score += 35
    matchStrength = 'strong'
    signals.push(`exact phrase in title: "${phrase}"`)
  } else if (needle && body.toLowerCase().includes(needle)) {
    score += 18
    matchStrength = 'strong'
    signals.push(`exact phrase in body: "${phrase}"`)
  } else {
    const tokens = tokenize(phrase)
    if (tokens.length) {
      const lowerTitle = title.toLowerCase()
      const inTitle = tokens.filter(t => lowerTitle.includes(t)).length
      const ratio = inTitle / tokens.length

      if (ratio === 1 && tokens.length >= 2) {
        score += 20
        matchStrength = 'strong'
        signals.push('all keyword terms in title')
      } else if (ratio === 1) {
        // Only one token survived tokenising — e.g. "rezi vs" reduces to "rezi",
        // so any thread naming the brand would otherwise read as a full match.
        score += 10
        matchStrength = 'partial'
        signals.push('single keyword term matched')
      } else if (inTitle >= 2 && ratio >= 0.5) {
        // Two or more terms. A single hit is never enough — half of "ATS resume"
        // is "resume", which is also an ordinary English verb.
        score += 10
        matchStrength = 'partial'
        signals.push('partial keyword match in title')
      } else if (inTitle === 1) {
        signals.push('only one keyword term matched')
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
  // A thread's value decays fast, and the old curve was flat between one week
  // and one month: an 8-day thread scored the same as a 29-day one and could
  // still top the inbox. Replying that late lands under everything.
  // Skipped entirely when the source has no date. Assuming "now" would hand
  // every undated thread the +15 and put months-old threads at the top of the
  // inbox — the precise failure this scorer exists to prevent.
  const age = post.createdAt === null ? null : hoursSince(post.createdAt)
  if (age === null) {
    signals.push('post date unavailable')
  } else if (age <= 24) {
    score += 15
    signals.push('posted in the last 24h')
  } else if (age <= 72) {
    score += 10
    signals.push('posted in the last 3 days')
  } else if (age <= 24 * 7) {
    score += 5
    signals.push('posted this week')
  } else if (age <= 24 * 14) {
    score -= 8
    signals.push('over a week old')
  } else if (age <= 24 * 30) {
    score -= 15
    signals.push('over two weeks old')
  } else {
    score -= 25
    signals.push('older than a month')
  }

  // --- engagement ----------------------------------------------------------
  // Few comments means the question is probably still open; a big pile means
  // anything you write lands at the bottom.
  //
  // Both are skipped when the source doesn't report them rather than treated as
  // zero. A search-index result has no thread stats, and `0 <= 5` would award
  // every single lead "few replies so far" — the signal would fire universally
  // and stop meaning anything. Silence is the honest answer; the trailing
  // signal says so, because the inbox promises every point is explainable.
  if (post.numComments === null) {
    signals.push('reply count unavailable')
  } else if (post.numComments <= 5) {
    score += 8
    signals.push('few replies so far')
  } else if (post.numComments > 60) {
    score -= 8
    signals.push('crowded thread')
  }

  if (post.ups !== null && post.ups >= 20) {
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

  // Recency, a quiet thread and a question mark total 31 on their own. Without
  // this, an off-topic post lands mid-band and looks like a real lead.
  if (matchStrength === 'weak' && score > WEAK_MATCH_CAP) {
    score = WEAK_MATCH_CAP
    signals.push(`capped at ${WEAK_MATCH_CAP} — the keyword didn't really match`)
  }

  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    signals,
  }
}
