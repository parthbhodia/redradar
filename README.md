# RedIntelli

Find the Reddit threads where people are already asking for what you sell, score them
by intent, and draft a reply that won't get you downvoted.

Multi-tenant SaaS: **Nuxt 4 · Vue 3 (Options API) · Tailwind v4 · Supabase**.

---

## What it does today

1. **Brand** — name, one-liner, what it does, voice notes, competitors
2. **Campaigns + keywords** — the phrases people type when shopping, optionally pinned to a subreddit
3. **Discovery** — searches Reddit per keyword, scores each thread 0-100, upserts leads
4. **AI drafts** — a reply written from your brand context, via Claude
5. **Inbox** — filter by status (`new` / `queued` / `replied` / `skipped` / `won`), edit the draft, copy, open the thread

Not built yet: billing, Chrome extension, auto-posting to Reddit, LLM citation tracking.

---

## Setup

### 1. Install

Node 20.19+ (an `.nvmrc` pins 22).

```bash
nvm use && pnpm install
```

### 2. Local dogfood (no Supabase required)

```bash
cp .env.example .env
# keep REDRADAR_LOCAL=1
pnpm seed:cueful   # Cueful brand + keywords + live Reddit scan via OpenCLI
pnpm dev --port 3010
```

Open http://localhost:3010/login, continue as `dogfood@cueful.bio`, then open **Inbox**.

Local mode stores data in `data/redradar.sqlite`. Discovery prefers
`opencli reddit search` (Chrome bridge), then public Reddit JSON.

### 3. Cloud / multi-tenant Supabase

Unset `REDRADAR_LOCAL` and point env at **RedIntelli's own** Supabase project
(not Cueful's). Create one at [supabase.com/dashboard](https://supabase.com/dashboard),
then apply `supabase/migrations/0001_init.sql` (SQL Editor or `supabase db push`).

| Variable | Where to get it | Required |
| --- | --- | --- |
| `SUPABASE_URL` | Supabase → Project Settings → API | cloud |
| `SUPABASE_KEY` | the anon / publishable key | cloud |
| `NUXT_SUPABASE_SECRET_KEY` | service-role key — server-only, used by `/api/discover` | cloud |
| `QWEN_API_KEY` | [Alibaba DashScope console](https://dashscope.console.aliyun.com) | drafts, brand setup, keyword suggestions |
| `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET` | [reddit.com/prefs/apps](https://www.reddit.com/prefs/apps) | optional |

In Supabase → Authentication → URL Configuration, allow `http://localhost:3010/confirm`.

### 4. Run (cloud)

```bash
pnpm dev
```

Sign in, name a workspace, fill in the brand, add a campaign and a few keywords, then
**Scan now**.

---

## Layout

```
app/
  assets/css/main.css     design tokens + component classes (Tailwind v4)
  components/             LeadCard, RadarMark
  composables/            useWorkspace — org / brands / campaigns state
  layouts/                default (marketing), app (dashboard)
  middleware/             auth.global.ts — gates /app/**
  pages/                  index, login, confirm, app/index, app/inbox
server/
  api/discover.post.ts    keyword scan → score → upsert leads
  api/draft.post.ts       brand + thread → reply draft
  utils/reddit.ts         fetch layer (OAuth or public JSON)
  utils/scoring.ts        explainable 0-100 relevance heuristic
  utils/llm.ts            Claude call for drafts
  utils/guard.ts          session + campaign access checks
shared/types.ts           types shared by app and server
supabase/migrations/      schema + RLS
```

### How scoring works

`server/utils/scoring.ts` is a transparent heuristic, not a model. Every point it moves
is attached to a signal string stored on the lead (`signals`) and shown in the inbox, so
a bad score is debuggable without re-running the scan. It rewards exact keyword matches
in the title, intent language ("alternative to", "any recommendations"), recency, low
reply counts, and competitor mentions; it penalises megathreads, promo posts, crowded
threads, and NSFW.

### Rescans are safe

`/api/discover` refreshes `score`, `signals`, and thread text on threads it has seen
before, but never touches `status` or `reply_draft` — your CRM state survives a rescan.

---

## Dogfooding on Cueful

Create a workspace, add Cueful as the brand (competitors: Linktree, Beacons, Stan Store),
and seed keywords like `linktree alternative`, `link in bio for creators`,
`best link in bio tool`. Then run a scan — no manual JSON import.
