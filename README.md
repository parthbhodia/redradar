# RedRadar

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

### 2. Create a Supabase project

RedRadar uses **its own** Supabase project — it does not share a database with anything else.
Create one at [supabase.com/dashboard](https://supabase.com/dashboard), then apply the schema:

- **Dashboard:** paste `supabase/migrations/0001_init.sql` into the SQL Editor and run it.
- **CLI:** `supabase link --project-ref <ref> && supabase db push`

This creates `orgs`, `org_members`, `brands`, `campaigns`, `keywords`, and `leads`, plus
RLS policies that scope every row to the caller's org membership and a `create_org()`
function that makes an org and its first membership atomically.

### 3. Configure environment

```bash
cp .env.example .env
```

| Variable | Where to get it | Required |
| --- | --- | --- |
| `SUPABASE_URL` | Supabase → Project Settings → API | yes |
| `SUPABASE_KEY` | the anon / publishable key | yes |
| `NUXT_SUPABASE_SECRET_KEY` | the secret / service-role key — server-only, used by `/api/discover` to upsert past RLS | yes |
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) — used by `/api/draft` | for drafts |
| `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET` | a "script" app at [reddit.com/prefs/apps](https://www.reddit.com/prefs/apps) | optional |

Without Reddit credentials, discovery falls back to the public `www.reddit.com` JSON
endpoints. That works locally but is rate-limited hard and blocked from many hosting
providers — add credentials before deploying.

### 4. Auth redirect

In Supabase → Authentication → URL Configuration, add `http://localhost:3000/confirm`
(and your production equivalent) to the redirect allow-list. Magic links work out of the
box; **Continue with Google** additionally needs the Google provider enabled under
Authentication → Providers.

### 5. Run

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
