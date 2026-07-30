/**
 * Seeds the local SQLite store with Cueful dogfood data and optionally runs
 * a discovery scan against Reddit via OpenCLI.
 *
 * Usage:
 *   REDRADAR_LOCAL=1 node --import tsx scripts/seed-cueful.mjs
 *   # or after server is up:
 *   REDRADAR_LOCAL=1 pnpm seed:cueful
 */

import { createRequire } from 'node:module'

process.env.REDRADAR_LOCAL = '1'

const require = createRequire(import.meta.url)

// Load compiled server utils via dynamic import after ensuring env is set.
async function main() {
  const {
    ensureLocalUser,
    createLocalOrg,
    getOrgForUser,
    upsertBrand,
    listBrands,
    listCampaigns,
    createCampaign,
    listKeywords,
    addKeyword,
    upsertLeads,
  } = await import('../server/utils/local-db.ts')

  const { createRedditAdapter } = await import('../server/utils/reddit.ts')
  const { scoreLead } = await import('../server/utils/scoring.ts')
  const { generateReplyDraft } = await import('../server/utils/llm.ts')

  const user = ensureLocalUser('dogfood@cueful.bio')
  let org = getOrgForUser(user.id)
  if (!org) {
    org = createLocalOrg(user.id, 'Cueful')
    console.log('Created org', org.slug)
  } else {
    console.log('Using org', org.slug)
  }

  let brands = listBrands(org.id)
  let brand = brands[0]
  if (!brand) {
    brand = upsertBrand({
      org_id: org.id,
      name: 'Cueful',
      tagline: 'Link in bio with shops + referral codes',
      description:
        'Cueful is a free link-in-bio for creators who want shops and referral codes on the same page — not just a link list. Built as a Linktree alternative for people who sell.',
      voice: 'Plain, direct, no hype. Happy to say when we are not the right fit. Disclose affiliation.',
      competitors: ['Linktree', 'Beacons', 'Stan Store', 'Later'],
    })
    console.log('Created brand Cueful')
  }

  let campaigns = listCampaigns([brand.id])
  let campaign = campaigns.find(c => c.name === 'Creator link-in-bio') || campaigns[0]
  if (!campaign) {
    campaign = createCampaign(brand.id, 'Creator link-in-bio')
    console.log('Created campaign', campaign.name)
  }

  const seedKeywords = [
    'linktree alternative',
    'link in bio tool',
    'best linktree alternative',
    'creator storefront link in bio',
  ]

  const existing = new Set(listKeywords(campaign.id).map(k => k.phrase.toLowerCase()))
  for (const phrase of seedKeywords) {
    if (existing.has(phrase.toLowerCase())) continue
    addKeyword(campaign.id, phrase, null)
    console.log('Added keyword', phrase)
  }

  const reddit = createRedditAdapter({
    userAgent: process.env.REDDIT_USER_AGENT || 'redradar/0.1 (cueful dogfood)',
  })

  const keywords = listKeywords(campaign.id)
  const best = new Map()
  const errors = []
  let scanned = 0

  for (const keyword of keywords) {
    try {
      console.log('Scanning', keyword.phrase)
      const posts = await reddit.search({
        query: keyword.phrase,
        sort: 'new',
        time: 'month',
        limit: 15,
      })
      scanned += posts.length
      for (const post of posts) {
        const { score, signals } = scoreLead(post, keyword.phrase, brand)
        const prev = best.get(post.id)
        if (!prev || score > prev.score) {
          best.set(post.id, { post, score, signals, keyword: keyword.phrase })
        }
      }
    } catch (error) {
      errors.push(`${keyword.phrase}: ${error.message}`)
      console.error(errors[errors.length - 1])
    }
  }

  const candidates = [...best.values()]
  const result = upsertLeads(
    campaign.id,
    candidates.map(c => ({
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
  )

  console.log(JSON.stringify({ scanned, ...result, keywords: keywords.length, errors }, null, 2))

  // Attach a template draft to the top lead so the inbox is immediately useful.
  const { listLeads, updateLead } = await import('../server/utils/local-db.ts')
  const leads = listLeads(campaign.id)
  const top = leads[0]
  if (top && !top.reply_draft) {
    const { draft, model } = await generateReplyDraft(
      { brand, lead: top },
      process.env.ANTHROPIC_API_KEY || undefined,
    )
    updateLead(top.id, { reply_draft: draft })
    console.log('Drafted top lead with', model)
  }

  console.log('Cueful dogfood ready. Sign in as dogfood@cueful.bio in local mode.')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
