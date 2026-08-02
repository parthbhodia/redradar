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

### 3.9 Reddit API credentials are not obtainable — and the fallback is grey-area

**Do not spend time on `reddit.com/prefs/apps`.** Self-serve app creation is
dead. The form still renders, accepts input and a captcha, then silently fails
and re-shows a link to the Responsible Builder Policy. It is not a captcha,
account-age, email-verification or adblock problem — it does this for everyone.
Confirmed against Reddit's own policy page and multiple 2026 r/redditdev reports
([silent failure](https://www.reddit.com/r/redditdev/comments/1qf7707/create_app_button_does_nothing_silent_failure_new/)).

Reddit's [Responsible Builder Policy](https://support.reddithelp.com/hc/en-us/articles/42728983564564-Responsible-Builder-Policy):
*"Approval is required: You must request access and get explicit approval before
accessing any Reddit data through our API."* Non-commercial work is pushed to
Devvit; commercial use needs explicit written approval "if your proposal fits
our criteria".

Reported outcomes for applicants are poor: detailed read-only, no-automation
requests [rejected as non-compliant](https://www.reddit.com/r/redditdev/comments/1r2ukkb/anyone_else_struggling_to_get_reddit_data_api/),
and others [never answered at all](https://www.reddit.com/r/redditdev/comments/1rebk4v/is_anyone_actually_getting_replies_for_new_reddit/).

So `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET` are **not currently obtainable**,
and the OAuth branch in `server/utils/reddit.ts` is effectively dead code kept
for the day that changes.

**Worse: the fallback chain is already broken.** Measured 2026-08-02, not
predicted:

| Path | Status |
| --- | --- |
| OAuth (`oauth.reddit.com`) | dead — credentials unobtainable, see above |
| Public JSON (`/search.json`) | **403**, both the app's UA and a real browser UA. Returns a 190 KB HTML block page, not JSON |
| RSS (`/search.rss`) | 200 once, then **429 for minutes** — paced at 1 req/12s from a residential IP the 2nd, 3rd and 4th all 429'd. Entries carry only `title, link, id, updated, author, content`: no `num_comments`, `score` or `ups` |
| OpenCLI Chrome bridge | works, but needs a logged-in Chrome on the machine |

`createRedditAdapter` falls OpenCLI → public JSON. On Vercel there is no Chrome
and no OpenCLI, so production discovery falls straight through to a 403. **Scans
work locally and are expected to fail in production.** Local scans are what
produced every lead in the database.

The policy also forecloses the obvious workarounds: *"No Unapproved
Commercialization… extends to commercial and non-commercial mining, scraping, or
using data for purposes like ads targeting."* A third-party scraper (Apify,
Bright Data) routes around the IP block but not around that sentence.

**The fix, shipped:** `server/utils/search-index.ts` queries a licensed
web-search index (Exa) restricted to `reddit.com`. We are then a consumer of a
search engine, not of Reddit data — no approval to obtain, no block to route
around, and it runs on Vercel. **Set `SEARCH_API_KEY` or deployed scans find
nothing.**

`createRedditAdapter` now tries each source in turn and takes the first that
returns rows: OpenCLI → search index → public JSON. OpenCLI stays first where it
exists because it sees reply counts and upvotes, which an index cannot. An empty
result falls through rather than counting as success — on a machine with no
Chrome, OpenCLI returning nothing is indistinguishable from it failing.

**But Exa does not solve discovery on its own — see §3.9.2 before relying on it.**

### 3.9.1 Unknown engagement is null, never zero

An index knows a thread's title, URL and date. It does not know `num_comments`
or `ups`, so `RedditPost` types both as `number | null`.

This matters more than it looks. `scoreLead` had `if (post.numComments <= 5)
score += 8` — defaulting a missing count to `0` would award **every single
lead** the "few replies so far" bonus, inflating every score and reducing the
signal to noise. It reads as working; it just quietly stops discriminating.

Both engagement signals are now skipped when the value is null, and a
`reply count unavailable` signal is emitted instead, because the inbox promises
every point is explainable. Measured on an identical thread: 55 with few
replies, 39 when crowded, **47 when unknown** — exactly midway, claiming
nothing. Covered by tests in the commit that introduced it.

The same trap applies to `createdAt`, which is `string | null` for the same
reason: Exa returns **no date at all** for Reddit threads, and `?? new Date()`
would award every one of them +15 "posted in the last 24h" and float month-old
threads to the top. The freshness block is skipped when the date is null, with a
`post date unavailable` signal. `posted_at` in both the Postgres and SQLite
schemas is nullable, so this stores cleanly.

The adapter also deliberately **does not send `startPublishedDate`**. A date
floor filters on a field Reddit results don't have, so it returns zero rows.

### 3.9.2 Exa is a stopgap, not the answer

Measured 2026-08-02, querying Exa the way discovery does:

- **Reddit threads carry no `publishedDate`.** Every one came back `N/A`. So the
  recency scoring — the product's central claim, "reply before it goes cold" —
  cannot work through this source. Leads arrive undated and forgo ±25 points.
- **Reddit is a minority of results.** For `linktree alternative
  recommendations`, *zero* of six results were Reddit; the rest were SEO
  listicles. `includeDomains` filters them out, but the usable yield per query
  is far below the result count.
- Semantic relevance ranking is not "new threads matching my keyword", which is
  what discovery actually wants.

**Likely better:** a Google-backed SERP API (Serper, SerpAPI) with
`site:reddit.com` and a recency filter (`tbs=qdr:d`). Google indexes Reddit
quickly and exposes date restriction, which is precisely what Exa lacks here.
Untested — no key available at the time of writing — so treat as a lead, not a
recommendation. The `RedditAdapter` interface makes it a drop-in swap.

### 3.9.3 Search is a per-user COGS line, and the scan cap protects it

`runScan` → `discovery.ts` issues **one search per keyword per scan**. At the
current 9 keywords and the 3-scans-per-day cap that is 27/day, **~810 per user
per month**. Scheduled scans add to it.

Priced against that (checked 2026-08-02):

| Provider | Rate | Per user/month |
| --- | --- | --- |
| SerpAPI Starter $25/1k | $0.025 | **$20.25** |
| SerpAPI Big Data $275/30k | $0.009 | $7.43 |
| **Serper $50/50k credits** | **$0.001** | **$0.81** |

SerpAPI's Starter tier costs more per user than most plausible subscription
prices — it is not viable. Serper is ~25× cheaper for the same Google-backed
results and gives 2,500 free queries (~92 scans) to evaluate with. Its credits
expire after six months, and 11–100 results costs 2 credits rather than 1, so
request depth 10 there. SerpAPI charges the same for 1 or 100 results, so if you
ever use it, ask for 100.

SerpAPI's "U.S. Legal Shield" indemnifies scraping *Google*. It does nothing
about the Reddit exposure in §3.9, which is the actual legal question — do not
pay the premium expecting it to.

**Consequence for product design:** every keyword a user adds raises COGS
linearly, and the daily scan cap is now a margin control as much as an abuse
control. Changing `DAILY_SCAN_LIMIT` or `MAX_ORG_MEMBERS` moves the cost line.

### 3.10 Local mode is a different product

`REDRADAR_LOCAL=1` runs on SQLite with no Supabase. **No teams, no invites, no
seat limit, no scan quota, no toasts driven by quota.** `/api/quota` returns
`null` and the badge hides. Anything touching `org_members` throws a 400 in
local mode by design.

### 3.11 Rescans preserve CRM state

`/api/discover` refreshes `score`, `signals`, and thread text on threads it has
seen, but never touches `status` or `reply_draft`.

### 3.12 Scoring is a heuristic, not a model

Every point moved is attached to a signal string stored on the lead and shown in
the inbox, so a bad score is debuggable without re-running the scan. Known past
false positives, all fixed: `\bor\b.*\?` matching any question containing "or",
no relevance gate, `\bneed a\b` being too generic, a single-token keyword hole,
and `u/` profile pages being ingested.

Freshness used to be flat between one week and one month, so an 8-day thread
scored the same as a 29-day one and could top the inbox. It now decays: −8 over
a week, −15 over two, −25 over a month. **Leads scored before 2026-07-31 still
carry the old flat curve** and will read high until a rescan re-scores them.

### 3.13 Draft tone lives in the database, not the prompt

`server/utils/llm.ts` has no template fallback. A missing key, a retired model
ID or an API error throws, because a canned draft posing as AI output is how
nobody notices the pipeline is broken. That fallback existed and hid a 404 on a
retired model for days.

The system prompt sets the register (sell, name the product, close with a next
step) and two mechanical rules: **no dashes as punctuation** (the clearest tell
of AI text on Reddit; hyphens inside compound words are fine) and **bracketed
`[X]` placeholders instead of invented figures**, for the poster to fill in.

`brands.voice` outranks the system prompt whenever the two disagree, because it
is more specific. It is the lever for tone. Both times draft tone was wrong the
fix was in `voice`, not in `llm.ts` — the prompt asked for placeholders for a
full round with none appearing until `voice` also asked for a proof point.

Disclosure ("i work on X", one clause) stays in the prompt deliberately. Reddit
removes undisclosed promotion and bans the account, and in the US an undisclosed
material connection is an FTC violation under 16 CFR Part 255. If this needs to
move, the shape is an account-level disclosure setting or drafts that never name
the product, not silent removal.

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
| `QWEN_API_KEY` | Qwen turbo (via Alibaba DashScope) for drafts, brand setup, keyword suggestions; unset returns 503 |
| `QWEN_BASE_URL` | defaults to the generic DashScope host. **Workspace-scoped keys need their own regional host instead** (`https://ws-xxxx.<region>.maas.aliyuncs.com/compatible-mode/v1`) — check the API-KEY dialog in the console for the exact value, or every call 401s even with a valid key |
| `ADMIN_EMAILS` | scan-limit exemption; **must be set on Vercel or you rate-limit yourself in production** |
| `MAX_ORG_MEMBERS` | seats per workspace, default 3. App layer only — the DB trigger needs its own setting, see §2 |
| `DAILY_SCAN_LIMIT` | manual scans per user per day, default 3 |
| `CRON_SECRET` | `x-cron-secret` for `/api/cron/scan-all`; empty disables the endpoint |
| `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET` | **not obtainable — see §3.9.** Falls back to OpenCLI then public JSON |
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
- [ ] **Google OAuth verification — rejected once, three findings.** Values to
      use (all verified live, 200, no auth wall — Google fetches them signed
      out). Use the `www` form throughout; mixing apex and `www` across Google,
      Supabase and Vercel is what caused the earlier `redirect_uri_mismatch`.

      | Field | Value |
      | --- | --- |
      | App name | `RedIntelli` — **one word, no space** |
      | Home page | `https://www.redintelli.com` |
      | Privacy policy | `https://www.redintelli.com/privacy` |
      | Terms of service | `https://www.redintelli.com/terms` |
      | Authorized domain | `redintelli.com` |

      What each rejection meant:

      1. ~~*"homepage URL is not registered to you"*~~ — resolved. Domain
         ownership was verified in **Google Search Console** with a **Domain**
         property for `redintelli.com` (DNS TXT via Cloudflare), signed in as
         the account that owns the Cloud project. A Domain property covers apex
         and `www` together; a URL-prefix property would not.

      **The Branding dialog shows stale findings.** It is headed *"Issues found
      from the previous verification attempt"* and appears every time you
      resubmit, listing the last run's results — not a fresh evaluation. It
      reads exactly like a live failure. Choose *"I have fixed the issues"* to
      queue a new review; *"I believe that the issues found are incorrect"*
      routes to a slower manual appeal and is the wrong claim unless the
      findings really are wrong.

      **The homepage URL must be the `www` form.** Vercel treats `www` as
      primary and 308-redirects the apex, so `https://redintelli.com` returns a
      15-byte plain-text redirect body containing the app name zero times.
      Google's checker evaluates whatever the configured URL returns, so an apex
      homepage re-triggers findings 2 *and* 3 no matter what the page says — the
      content is never read. This looks like a content problem and isn't.
      2. *"homepage does not explain the purpose of your app"* — fixed in code.
         The `#about` section on the landing page now states plainly what the
         app does **and** what Google data it uses. Google wants both on the
         homepage itself; having it only in the privacy policy fails review.
         **Don't delete that section during a redesign.**
      3. *"app name does not match the app name on your homepage"* — the consent
         screen said `Red Intelli`. It must be `RedIntelli`, matching the header
         and the `#about` heading exactly.
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
| `1dd49fc` | Selling drafts: no dashes, `[X]` placeholders, steeper freshness decay |
| `0427399` | Both limits configurable from env; trigger reads a DB setting |
| `dd60512` | This file |
| `006048b` | Remove-a-teammate, releasing their claims first |
| `4501a4d` | 3-member seat cap; fixed client-side `user.id` (see 3.1) |
| `99c5375` | Quota badge in the header, toast on 429 |
| `4dddb08` | 3 manual scans per user per day |
| `0823349` | Fixed server-side `user.id` breaking draft saves (see 3.1) |
| `0188b13` | Legal pages, password sign-in, landing rebuild |
| `d0af728` | Rename to RedIntelli (user-visible strings only) |
