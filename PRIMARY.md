# PRIMARY

Running state of RedIntelli: the decisions, the limits, and the things that will
bite you. [README.md](README.md) covers setup and how to run it — this file
covers everything you'd otherwise have to rediscover.

Updated as part of every commit — see §7 for what's landed.

---

## 1. What exists

Multi-tenant Reddit lead discovery. **Nuxt 4 · Vue 3 Options API · Tailwind v4 ·
Supabase**, deployed on Vercel at `www.redintelli.com`.

The loop: brand → campaign → keywords → scan Reddit → score 0-100 → inbox →
claim a lead → AI draft → reply on Reddit → mark the status.

Built and working: auth (magic link, Google OAuth, password), workspaces, teams
with invites and roles, per-user drafts, thread claiming with duplicate
protection, scan history, scheduled scans, daily scan limits, seat limits,
dashboard, inbox, marketing site, legal pages.

Not built: billing, Chrome extension, auto-posting to Reddit, role transfer,
LLM citation tracking.

---

## 2. Product limits

| Limit | Default | Env var | Where enforced |
| --- | --- | --- | --- |
| Manual scans | 3 per **user** per UTC day | `DAILY_SCAN_LIMIT` | `server/utils/scan-quota.ts`, checked in `discover.post.ts` before any Reddit work |
| Workspace seats | 3 **including the owner** | `MAX_ORG_MEMBERS` | `invite.post.ts` + trigger from `0007_seat_limit_from_setting.sql` |

Both are read from `runtimeConfig.public` — never import the constants from
[`shared/limits.ts`](shared/limits.ts) directly, or an env change won't apply.
Those exports are fallbacks only.

On Vercel they can also be set as `NUXT_PUBLIC_MAX_ORG_MEMBERS` /
`NUXT_PUBLIC_DAILY_SCAN_LIMIT`, which take effect **without a rebuild** — Nitro
reads `NUXT_PUBLIC_*` at boot. Verified against a built server: the SSR payload
picked up `7` and `9` from env with no rebuild.

⚠️ **The seat limit has a second knob.** Postgres cannot read Vercel's
environment, so the trigger reads its own database setting. Changing
`MAX_ORG_MEMBERS` alone leaves the trigger at its previous value, and invites
will fail at whichever number is lower. To change both:

```sql
alter database postgres set app.max_org_members = 5;
```

Unset, the trigger falls back to 3.

**Admins** are exempt from the scan limit only — not the seat limit. Configured
by `ADMIN_EMAILS` (comma-separated), *not* hardcoded, because this repo is
public. Unset in an environment means nobody is exempt there.

### Caveats on the limits

- **Scans are counted per user, not per workspace.** A full 3-seat team has 9
  scans/day of capacity, all feeding one shared inbox. This is deliberate — a
  shared cap of 3 would make the collaboration features useless — but it does
  mean spend scales with headcount. The cheap bypass isn't invites (each needs a
  real inbox that can receive a Supabase invite mail), it's just signing up
  again: a new account gets a new workspace and a fresh 3.
- **The quota slot is consumed when the `scan_runs` row opens, not on success.**
  A scan that errors still cost a Reddit round trip, and metering only successes
  would turn a failing keyword into an unmetered retry loop.
- **Scheduled runs don't count.** Nobody pressed anything.
- **Counted through the service role**, so losing access to a campaign you
  scanned can't quietly reset your allowance.
- Quota resets at **UTC** midnight, not local midnight.

---

## 3. Caveats and gotchas

### 3.1 `@nuxtjs/supabase` v2 gives you JWT claims, not a `User` — id is on `sub`

**This has caused two separate production bugs. Assume it will cause a third.**

Both `serverSupabaseUser(event)` and the client-side `useSupabaseUser()` resolve
from `auth.getClaims()`. What you get is a JWT payload: the user id is on `sub`,
and reading `.id` returns `undefined` — silently, with no error.

Both failures looked like something else:

- **Server:** `user.id` was `undefined`, PostgREST dropped the key, `user_id`
  was written as `NULL`, and `NULL = auth.uid()` is never true → *"new row
  violates row-level security policy for table `lead_drafts`"*. Spent a whole
  session blaming RLS policies that were fine.
- **Client:** `canInvite` compared `undefined` against `org_members.user_id` and
  was always false, so **the invite form never rendered for anyone**, including
  the owner. `LeadCard` had it too — it never matched a user to their own saved
  draft, so per-user drafts silently fell back to the shared AI seed.

Normalised in exactly two places. **Use them; never read `.id` off a raw
Supabase user.**

- Server → `requireUserClient()` in [`server/utils/guard.ts`](server/utils/guard.ts)
- Client → `useMe()` in [`app/composables/useMe.ts`](app/composables/useMe.ts)

Truthiness checks (`if (user.value)`) are unaffected and still fine.

### 3.2 The seat limit is enforced at two layers, with two knobs

`/api/invite` counts seats before inviting, but that's a read followed by a
write — two concurrent invites can both pass it. The `BEFORE INSERT` trigger
(`0007_seat_limit_from_setting.sql`, superseding `0006`) is the actual
guarantee and also covers every other write path.

0007 is applied in production, so the cap is genuinely enforced. On a fresh
database that hasn't had it run, the cap is advisory — the app-level check still
covers the normal single-request case, so it degrades gracefully rather than
failing open loudly.

The two layers read *different sources*: the app reads env, the trigger reads
`app.max_org_members` from Postgres. They must be changed together — see §2.
The app number is the one users see explained in the UI; the trigger number is
the one that actually refuses the insert.

### 3.3 Member removal is deliberately ordered, and not atomic

`member-remove.post.ts` releases the member's claimed leads **first**, then drops
the membership row. Two service-role calls, no transaction.

The order is the point: if step 2 fails you get a still-present member whose
leads are re-claimable (harmless, retry). The reverse would strand a lead
assigned to someone who can't reach it, and `prevent_duplicate_thread_claim`
would then block anyone else from taking that thread — permanently.

Removal is also why the seat cap needed a remove button at all: a workspace that
filled to 3 previously had no way to free a seat.

### 3.4 Roles are a one-way street

Invitees are always inserted as `member`. There is **no promote/demote UI and no
way to transfer ownership**, which is why `member-remove.post.ts` refuses to
remove an `owner` — doing so would leave an org nobody can administer. In
practice a workspace is: 1 owner + up to 2 members.

### 3.5 `supabase.types: false`

Type generation is disabled project-wide (`nuxt.config.ts`), because placeholder
keys made the whole app shell hard-fail. Consequence: every service-role client
must be cast, or every query resolves to `never`:

```ts
const admin = serverSupabaseServiceRole(event) as import('@supabase/supabase-js').SupabaseClient<any>
```

`app/types/database.types.ts` is hand-written and can drift from the real schema.

### 3.6 Tailwind v4: `@apply` can't reference custom component classes

`@apply btn` fails with *"Cannot apply unknown utility class"* if `btn` is itself
a `@layer components` class. Shared styles use grouped selectors instead. See
`app/assets/css/main.css`.

### 3.7 Toolchain pins

- **TypeScript is pinned to `^5.9.3`.** TypeScript 7 has no `lib/tsc`, and
  `vue-tsc` fails with `ERR_PACKAGE_PATH_NOT_EXPORTED`.
- **pnpm build approvals live in `pnpm-workspace.yaml`** (`allowBuilds`), not
  `package.json` — pnpm 11 ignores `pnpm.onlyBuiltDependencies` there.
- **Node 22** via `.nvmrc`.

### 3.8 OpenCLI needs its Node on PATH

The Chrome-bridge Reddit adapter shells out to `opencli`, whose shebang is
`#!/usr/bin/env node`. If an older Node resolves first it dies with *"requires
Node.js >= 20.0.0"*. Fixed by prepending `dirname(process.execPath)` to the
child's PATH.

### 3.9 Local mode is a different product

`REDRADAR_LOCAL=1` runs on SQLite with no Supabase. **No teams, no invites, no
seat limit, no scan quota, no toasts driven by quota.** `/api/quota` returns
`null` and the badge hides. Anything touching `org_members` throws a 400 in
local mode by design.

### 3.10 Rescans preserve CRM state

`/api/discover` refreshes `score`, `signals`, and thread text on threads it has
seen, but never touches `status` or `reply_draft`.

### 3.11 Scoring is a heuristic, not a model

Every point moved is attached to a signal string stored on the lead and shown in
the inbox, so a bad score is debuggable without re-running the scan. Known past
false positives, all fixed: `\bor\b.*\?` matching any question containing "or",
no relevance gate, `\bneed a\b` being too generic, a single-token keyword hole,
and `u/` profile pages being ingested.

---

## 4. Migrations

Applied in order, by hand in the Supabase SQL editor.

| File | What it does |
| --- | --- |
| `0001_init.sql` | orgs, brands, campaigns, keywords, leads, RLS |
| `0002_team.sql` | profiles, roles, `lead_events`, `lead_drafts`, `leads.assigned_to` |
| `0003_repair_team_policies.sql` | re-applies team policies 0002 could abort before reaching |
| `0004_thread_claims.sql` | `lead_thread_claims` view + duplicate-claim trigger |
| `0005_scan_runs.sql` | scan history — prerequisite for trustworthy cron scans |
| `0006_seat_limit.sql` | seat-limit trigger, with `3` baked into the function |
| `0007_seat_limit_from_setting.sql` | same trigger, reading `app.max_org_members` instead. Supersedes 0006 — running only this one is fine |

All applied to production as of 2026-07-30.

> ⚠️ **The Supabase MCP connected to this workspace points at a different
> project** (its migrations are `profile_faqs`, `creator_growth_foundations`,
> `shop_media_and_disclosures`). Do **not** apply RedIntelli migrations through
> it. Run them in the RedIntelli SQL editor.

---

## 5. Environment

Set in `.env` (local), `.env.vercel`, and Vercel project settings. All three are
gitignored except `.env.example`.

| Variable | Notes |
| --- | --- |
| `SUPABASE_URL` / `SUPABASE_KEY` | RedIntelli's own project — **not** Cueful's |
| `NUXT_SUPABASE_SECRET_KEY` | service role; server-only |
| `ANTHROPIC_API_KEY` | drafts fall back to a template if unset |
| `ADMIN_EMAILS` | scan-limit exemption; **must be set on Vercel or you rate-limit yourself in production** |
| `MAX_ORG_MEMBERS` | seats per workspace, default 3. App layer only — the DB trigger needs its own setting, see §2 |
| `DAILY_SCAN_LIMIT` | manual scans per user per day, default 3 |
| `CRON_SECRET` | `x-cron-secret` for `/api/cron/scan-all`; empty disables the endpoint |
| `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET` | optional; falls back to OpenCLI then public JSON |
| `REDRADAR_LOCAL` | `1` for SQLite mode |

Internal env var names and table names still say `redradar`. **This is
intentional** — the rename to RedIntelli was user-visible strings only.

### Deploy notes

- Cloudflare DNS for `www` and the apex must be **DNS-only, not proxied**.
  Proxied records resolve to `172.67.x` / `104.21.x` instead of Vercel's
  `216.198.x` / `64.29.x`, and the deployment breaks.
- Supabase → Authentication → URL Configuration needs Site URL and the redirect
  allowlist set to `https://www.redintelli.com/**`.
- Google OAuth: authorised **JS origins** and **redirect URIs** are not
  interchangeable. Swapping them produces `redirect_uri_mismatch`; the real
  reason is base64-encoded in Google's `authError` query param.

---

## 6. Open items

- [x] ~~Confirm `0007_seat_limit_from_setting.sql` is applied~~ — done 2026-07-30.
- [ ] Seat limits are global, not per-plan. When billing lands, this wants to be
      a `seat_limit` column on `orgs` rather than one env var for everyone —
      that also collapses the two knobs in §2 back into one.
- [ ] **Rotate two credentials that were pasted into a chat transcript**: the
      Supabase `sb_secret_…` key and the Google OAuth client secret.
- [ ] Google Branding: app name, privacy URL, terms URL (needed for OAuth
      verification; `/privacy` and `/terms` exist).
- [ ] Landing page direction unresolved — a Cueful-style image-tile treatment was
      floated and dropped. Current page stands.
- [ ] The landing stat band has no real numbers behind it. Wiring it to live DB
      counts is the honest fix; inventing figures on a page whose whole pitch is
      anti-hype is self-defeating.
- [ ] `.claude/launch.json` is untracked — a dev-server config for the preview
      tooling. Commit it if it should be shared.

---

## 7. Recent history

| Commit | Change |
| --- | --- |
| `0427399` | Both limits configurable from env; trigger reads a DB setting |
| `dd60512` | This file |
| `006048b` | Remove-a-teammate, releasing their claims first |
| `4501a4d` | 3-member seat cap; fixed client-side `user.id` (see 3.1) |
| `99c5375` | Quota badge in the header, toast on 429 |
| `4dddb08` | 3 manual scans per user per day |
| `0823349` | Fixed server-side `user.id` breaking draft saves (see 3.1) |
| `0188b13` | Legal pages, password sign-in, landing rebuild |
| `d0af728` | Rename to RedIntelli (user-visible strings only) |
