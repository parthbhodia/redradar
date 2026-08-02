export type LeadStatus = 'new' | 'queued' | 'replied' | 'skipped' | 'won'

export const LEAD_STATUSES: LeadStatus[] = ['new', 'queued', 'replied', 'skipped', 'won']

export type CampaignStatus = 'active' | 'paused' | 'archived'

export interface Org {
  id: string
  name: string
  slug: string
  created_at: string
}

export interface Brand {
  id: string
  org_id: string
  name: string
  tagline: string | null
  description: string | null
  voice: string | null
  competitors: string[]
  created_at: string
}

export interface Campaign {
  id: string
  brand_id: string
  name: string
  status: CampaignStatus
  created_at: string
}

export interface Keyword {
  id: string
  campaign_id: string
  phrase: string
  subreddit_filter: string | null
  created_at: string
}

export interface Lead {
  id: string
  campaign_id: string
  platform: string
  external_id: string
  url: string
  title: string | null
  body: string | null
  subreddit: string | null
  author: string | null
  score: number
  signals: string[]
  matched_keyword: string | null
  status: LeadStatus
  reply_draft: string | null
  posted_at: string | null
  discovered_at: string
  updated_at: string
}

/** A thread as returned by the Reddit fetch layer, before scoring. */
export interface RedditPost {
  id: string
  title: string
  body: string
  subreddit: string
  author: string
  url: string
  /**
   * Null when the source can't report it. A search index returns no date at
   * all for Reddit threads, and defaulting to `now` would award every one of
   * them the scorer's +15 "posted in the last 24h" — fabricating the freshness
   * the whole product is sold on.
   */
  createdAt: string | null
  /**
   * Null when the source can't report it. A search index returns titles and
   * dates but no thread stats, and defaulting those to 0 would hand every
   * result the scorer's "few replies" bonus — inflating every score and
   * turning the signal into noise. Null means unknown, not zero.
   */
  numComments: number | null
  ups: number | null
  over18: boolean
}

export interface DiscoverRequest {
  campaignId: string
  /** Optional cap on threads fetched per keyword. Defaults to 25. */
  limit?: number
}

export interface ScanQuotaInfo {
  limit: number
  used: number
  remaining: number
  /** ISO timestamp of the next UTC midnight. */
  resetsAt: string
  unlimited: boolean
}

export interface DiscoverResponse {
  scanned: number
  inserted: number
  updated: number
  skipped: number
  keywords: number
  errors: string[]
  /** Null in local mode, which has no quota. */
  quota?: ScanQuotaInfo | null
}

export interface DraftRequest {
  leadId: string
  /** Optional nudge, e.g. "shorter" or "lead with the migration story". */
  instruction?: string
}

export interface DraftResponse {
  draft: string
  model: string
}
