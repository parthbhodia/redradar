import Database from 'better-sqlite3'
import { nanoid } from 'nanoid'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Brand, Campaign, Keyword, Lead, LeadStatus, Org } from '#shared/types'

const GLOBAL_KEY = '__redradar_sqlite__'

type GlobalStore = {
  db: Database.Database
}

function dbPath() {
  const configured = process.env.REDRADAR_DB_PATH
  if (configured) return configured
  return join(process.cwd(), 'data', 'redradar.sqlite')
}

function migrate(db: Database.Database) {
  db.exec(`
    create table if not exists users (
      id text primary key,
      email text not null unique,
      created_at text not null
    );

    create table if not exists orgs (
      id text primary key,
      name text not null,
      slug text not null unique,
      created_at text not null
    );

    create table if not exists org_members (
      org_id text not null references orgs(id) on delete cascade,
      user_id text not null references users(id) on delete cascade,
      role text not null default 'owner',
      created_at text not null,
      primary key (org_id, user_id)
    );

    create table if not exists brands (
      id text primary key,
      org_id text not null references orgs(id) on delete cascade,
      name text not null,
      tagline text,
      description text,
      voice text,
      competitors text not null default '[]',
      created_at text not null
    );

    create table if not exists campaigns (
      id text primary key,
      brand_id text not null references brands(id) on delete cascade,
      name text not null,
      status text not null default 'active',
      created_at text not null
    );

    create table if not exists keywords (
      id text primary key,
      campaign_id text not null references campaigns(id) on delete cascade,
      phrase text not null,
      subreddit_filter text,
      created_at text not null,
      unique (campaign_id, phrase)
    );

    create table if not exists leads (
      id text primary key,
      campaign_id text not null references campaigns(id) on delete cascade,
      platform text not null default 'reddit',
      external_id text not null,
      url text not null,
      title text,
      body text,
      subreddit text,
      author text,
      score integer not null default 0,
      signals text not null default '[]',
      matched_keyword text,
      status text not null default 'new',
      reply_draft text,
      posted_at text,
      claimed_by text,
      claimed_at text,
      discovered_at text not null,
      updated_at text not null,
      unique (campaign_id, platform, external_id)
    );
  `)

  // `create table if not exists` leaves an existing leads table untouched, so
  // columns added after a DB was first created won't appear. Add them
  // defensively — SQLite has no `add column if not exists`, so we read the
  // current columns and only add what's missing.
  const leadColumns = new Set(
    (db.prepare('pragma table_info(leads)').all() as Array<{ name: string }>).map(c => c.name),
  )
  if (!leadColumns.has('claimed_by')) db.exec('alter table leads add column claimed_by text')
  if (!leadColumns.has('claimed_at')) db.exec('alter table leads add column claimed_at text')
}

export function isLocalMode() {
  return process.env.REDRADAR_LOCAL === '1' || process.env.REDRADAR_LOCAL === 'true'
}

export function getLocalDb() {
  const g = globalThis as typeof globalThis & { [GLOBAL_KEY]?: GlobalStore }
  if (!g[GLOBAL_KEY]) {
    const path = dbPath()
    mkdirSync(dirname(path), { recursive: true })
    const db = new Database(path)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    migrate(db)
    g[GLOBAL_KEY] = { db }
  }
  return g[GLOBAL_KEY]!.db
}

function now() {
  return new Date().toISOString()
}

function slugify(name: string) {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'workspace'
  return base
}

function parseJsonArray(value: string | null | undefined): string[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

function mapBrand(row: Record<string, unknown>): Brand {
  return {
    id: String(row.id),
    org_id: String(row.org_id),
    name: String(row.name),
    tagline: (row.tagline as string | null) ?? null,
    description: (row.description as string | null) ?? null,
    voice: (row.voice as string | null) ?? null,
    competitors: parseJsonArray(row.competitors as string),
    created_at: String(row.created_at),
  }
}

function mapLead(row: Record<string, unknown>): Lead {
  return {
    id: String(row.id),
    campaign_id: String(row.campaign_id),
    platform: String(row.platform),
    external_id: String(row.external_id),
    url: String(row.url),
    title: (row.title as string | null) ?? null,
    body: (row.body as string | null) ?? null,
    subreddit: (row.subreddit as string | null) ?? null,
    author: (row.author as string | null) ?? null,
    score: Number(row.score) || 0,
    signals: parseJsonArray(row.signals as string),
    matched_keyword: (row.matched_keyword as string | null) ?? null,
    status: row.status as LeadStatus,
    reply_draft: (row.reply_draft as string | null) ?? null,
    posted_at: (row.posted_at as string | null) ?? null,
    claimed_by: (row.claimed_by as string | null) ?? null,
    claimed_at: (row.claimed_at as string | null) ?? null,
    discovered_at: String(row.discovered_at),
    updated_at: String(row.updated_at),
    // "New activity since you replied" is cloud-only (migration 0008), same
    // as scan history — local mode's SQLite schema doesn't track either.
    num_comments: null,
    replied_num_comments: null,
  }
}

export function ensureLocalUser(email: string) {
  const db = getLocalDb()
  const existing = db.prepare('select id, email, created_at from users where email = ?').get(email.toLowerCase()) as
    | { id: string, email: string, created_at: string }
    | undefined

  if (existing) return existing

  const user = { id: nanoid(), email: email.toLowerCase(), created_at: now() }
  db.prepare('insert into users (id, email, created_at) values (@id, @email, @created_at)').run(user)
  return user
}

export function getLocalUser(userId: string) {
  return getLocalDb().prepare('select id, email, created_at from users where id = ?').get(userId) as
    | { id: string, email: string, created_at: string }
    | undefined
}

export function createLocalOrg(userId: string, name: string): Org {
  const db = getLocalDb()
  const trimmed = name.trim()
  if (!trimmed) throw new Error('workspace name is required')

  let slug = slugify(trimmed)
  let n = 0
  while (db.prepare('select 1 from orgs where slug = ?').get(slug)) {
    n += 1
    slug = `${slugify(trimmed)}-${n}`
  }

  const org: Org = { id: nanoid(), name: trimmed, slug, created_at: now() }
  const tx = db.transaction(() => {
    db.prepare('insert into orgs (id, name, slug, created_at) values (@id, @name, @slug, @created_at)').run(org)
    db.prepare('insert into org_members (org_id, user_id, role, created_at) values (?, ?, ?, ?)').run(
      org.id,
      userId,
      'owner',
      now(),
    )
  })
  tx()
  return org
}

export function getOrgForUser(userId: string): Org | null {
  const row = getLocalDb()
    .prepare(`
      select o.id, o.name, o.slug, o.created_at
      from org_members m
      join orgs o on o.id = m.org_id
      where m.user_id = ?
      order by m.created_at
      limit 1
    `)
    .get(userId) as Org | undefined
  return row ?? null
}

export function listBrands(orgId: string): Brand[] {
  const rows = getLocalDb()
    .prepare('select * from brands where org_id = ? order by created_at')
    .all(orgId) as Record<string, unknown>[]
  return rows.map(mapBrand)
}

export function upsertBrand(input: {
  id?: string
  org_id: string
  name: string
  tagline?: string | null
  description?: string | null
  voice?: string | null
  competitors?: string[]
}): Brand {
  const db = getLocalDb()
  if (input.id) {
    db.prepare(`
      update brands set
        name = @name,
        tagline = @tagline,
        description = @description,
        voice = @voice,
        competitors = @competitors
      where id = @id and org_id = @org_id
    `).run({
      id: input.id,
      org_id: input.org_id,
      name: input.name,
      tagline: input.tagline ?? null,
      description: input.description ?? null,
      voice: input.voice ?? null,
      competitors: JSON.stringify(input.competitors ?? []),
    })
    return mapBrand(db.prepare('select * from brands where id = ?').get(input.id) as Record<string, unknown>)
  }

  const brand = {
    id: nanoid(),
    org_id: input.org_id,
    name: input.name,
    tagline: input.tagline ?? null,
    description: input.description ?? null,
    voice: input.voice ?? null,
    competitors: JSON.stringify(input.competitors ?? []),
    created_at: now(),
  }
  db.prepare(`
    insert into brands (id, org_id, name, tagline, description, voice, competitors, created_at)
    values (@id, @org_id, @name, @tagline, @description, @voice, @competitors, @created_at)
  `).run(brand)
  return mapBrand(brand)
}

export function listCampaigns(brandIds: string[]): Campaign[] {
  if (!brandIds.length) return []
  const placeholders = brandIds.map(() => '?').join(',')
  return getLocalDb()
    .prepare(`select * from campaigns where brand_id in (${placeholders}) order by created_at`)
    .all(...brandIds) as Campaign[]
}

export function createCampaign(brandId: string, name: string): Campaign {
  const campaign: Campaign = {
    id: nanoid(),
    brand_id: brandId,
    name: name.trim(),
    status: 'active',
    created_at: now(),
  }
  getLocalDb()
    .prepare('insert into campaigns (id, brand_id, name, status, created_at) values (@id, @brand_id, @name, @status, @created_at)')
    .run(campaign)
  return campaign
}

export function listKeywords(campaignId: string): Keyword[] {
  return getLocalDb()
    .prepare('select * from keywords where campaign_id = ? order by created_at')
    .all(campaignId) as Keyword[]
}

export function addKeyword(campaignId: string, phrase: string, subredditFilter: string | null): Keyword {
  const keyword: Keyword = {
    id: nanoid(),
    campaign_id: campaignId,
    phrase: phrase.trim(),
    subreddit_filter: subredditFilter,
    created_at: now(),
  }
  getLocalDb()
    .prepare('insert into keywords (id, campaign_id, phrase, subreddit_filter, created_at) values (@id, @campaign_id, @phrase, @subreddit_filter, @created_at)')
    .run(keyword)
  return keyword
}

export function removeKeyword(id: string) {
  getLocalDb().prepare('delete from keywords where id = ?').run(id)
}

export function listLeads(campaignId: string): Lead[] {
  const rows = getLocalDb()
    .prepare('select * from leads where campaign_id = ? order by score desc')
    .all(campaignId) as Record<string, unknown>[]
  return rows.map(mapLead)
}

/** A lead plus the campaign/brand it belongs to, for the cross-brand dashboard. */
export type LeadWithContext = Lead & {
  campaign_name: string
  brand_id: string
  brand_name: string
}

/**
 * Every lead across every campaign the org owns, each tagged with its campaign
 * and brand. The dashboard's work queue spans brands, so it can't go
 * campaign-by-campaign like the inbox does.
 */
export function listAllLeads(orgId: string): LeadWithContext[] {
  const rows = getLocalDb()
    .prepare(`
      select l.*, c.name as campaign_name, b.id as brand_id, b.name as brand_name
      from leads l
      join campaigns c on c.id = l.campaign_id
      join brands b on b.id = c.brand_id
      where b.org_id = ?
      order by l.score desc
    `)
    .all(orgId) as Record<string, unknown>[]

  return rows.map(row => ({
    ...mapLead(row),
    campaign_name: String(row.campaign_name),
    brand_id: String(row.brand_id),
    brand_name: String(row.brand_name),
  }))
}

export function getLead(id: string): Lead | null {
  const row = getLocalDb().prepare('select * from leads where id = ?').get(id) as Record<string, unknown> | undefined
  return row ? mapLead(row) : null
}

export function updateLead(id: string, patch: Partial<Pick<Lead, 'status' | 'reply_draft' | 'score' | 'signals' | 'title' | 'body' | 'matched_keyword' | 'claimed_by' | 'claimed_at'>>) {
  const current = getLead(id)
  if (!current) return null

  const next = {
    ...current,
    ...patch,
    signals: patch.signals ?? current.signals,
    updated_at: now(),
  }

  getLocalDb().prepare(`
    update leads set
      status = @status,
      reply_draft = @reply_draft,
      score = @score,
      signals = @signals,
      title = @title,
      body = @body,
      matched_keyword = @matched_keyword,
      claimed_by = @claimed_by,
      claimed_at = @claimed_at,
      updated_at = @updated_at
    where id = @id
  `).run({
    id,
    status: next.status,
    reply_draft: next.reply_draft,
    score: next.score,
    signals: JSON.stringify(next.signals),
    title: next.title,
    body: next.body,
    matched_keyword: next.matched_keyword,
    claimed_by: next.claimed_by,
    claimed_at: next.claimed_at,
    updated_at: next.updated_at,
  })

  return getLead(id)
}

export function getCampaignWithBrand(campaignId: string) {
  const db = getLocalDb()
  const campaign = db.prepare('select * from campaigns where id = ?').get(campaignId) as Campaign | undefined
  if (!campaign) return null
  const brandRow = db.prepare('select * from brands where id = ?').get(campaign.brand_id) as Record<string, unknown> | undefined
  if (!brandRow) return null
  return { campaign, brand: mapBrand(brandRow) }
}

export function userCanAccessCampaign(userId: string, campaignId: string) {
  const row = getLocalDb()
    .prepare(`
      select 1
      from campaigns c
      join brands b on b.id = c.brand_id
      join org_members m on m.org_id = b.org_id
      where c.id = ? and m.user_id = ?
    `)
    .get(campaignId, userId)
  return Boolean(row)
}

export function upsertLeads(
  campaignId: string,
  candidates: Array<{
    external_id: string
    url: string
    title: string
    body: string
    subreddit: string
    author: string
    score: number
    signals: string[]
    matched_keyword: string
    /** Null when the source reported no date — the column is nullable. */
    posted_at: string | null
  }>,
) {
  const db = getLocalDb()
  const existing = db
    .prepare('select id, external_id from leads where campaign_id = ? and platform = ?')
    .all(campaignId, 'reddit') as Array<{ id: string, external_id: string }>
  const byExternal = new Map(existing.map(row => [row.external_id, row.id]))

  let inserted = 0
  let updated = 0
  const stamp = now()

  const insert = db.prepare(`
    insert into leads (
      id, campaign_id, platform, external_id, url, title, body, subreddit, author,
      score, signals, matched_keyword, status, reply_draft, posted_at, claimed_by, discovered_at, updated_at
    ) values (
      @id, @campaign_id, 'reddit', @external_id, @url, @title, @body, @subreddit, @author,
      @score, @signals, @matched_keyword, 'new', null, @posted_at, null, @discovered_at, @updated_at
    )
  `)

  const update = db.prepare(`
    update leads set
      title = @title,
      body = @body,
      score = @score,
      signals = @signals,
      matched_keyword = @matched_keyword,
      updated_at = @updated_at
    where id = @id
  `)

  const tx = db.transaction(() => {
    for (const c of candidates) {
      const existingId = byExternal.get(c.external_id)
      if (existingId) {
        update.run({
          id: existingId,
          title: c.title,
          body: c.body,
          score: c.score,
          signals: JSON.stringify(c.signals),
          matched_keyword: c.matched_keyword,
          updated_at: stamp,
        })
        updated += 1
      } else {
        insert.run({
          id: nanoid(),
          campaign_id: campaignId,
          external_id: c.external_id,
          url: c.url,
          title: c.title,
          body: c.body,
          subreddit: c.subreddit,
          author: c.author,
          score: c.score,
          signals: JSON.stringify(c.signals),
          matched_keyword: c.matched_keyword,
          posted_at: c.posted_at,
          discovered_at: stamp,
          updated_at: stamp,
        })
        inserted += 1
      }
    }
  })
  tx()

  return { inserted, updated }
}
