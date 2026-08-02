# Production Deployment Guide

## Prerequisites

Your Reddit scraper is production-ready. To run on your live site:

## Required Environment Variables

Set these on your deployment platform (Vercel, Railway, etc.):

### Search API (REQUIRED for production)

```bash
# Exa.ai API key — the only discovery method that works in production
# Why: Reddit blocks direct API access; Exa searches Google's Reddit index
# Sign up: https://exa.ai
# Free tier: 2,500 credits/month (~138 scans at 3 scans/day)
# Production cost: ~$0.81/user/month (Starter tier)
SEARCH_API_KEY=<your-exa-api-key>
```

### Database (if using Supabase)

```bash
# Only needed if you're deploying the cloud version (not local SQLite)
SUPABASE_URL=<your-supabase-url>
SUPABASE_KEY=<your-supabase-anon-key>
NUXT_SUPABASE_SECRET_KEY=<your-supabase-service-role-key>
```

### Rate Limiting (Optional, recommended to tweak)

```bash
# Daily scans per user — reduce if costs too high
# Default: 3 scans/day = ~27 Exa queries/day per user
NUXT_PUBLIC_DAILY_SCAN_LIMIT=3

# Workspace member limit
# Default: 3 (owner + 2 members)
NUXT_PUBLIC_MAX_ORG_MEMBERS=3

# Admin emails get unlimited scans (comma-separated, no spaces)
# Example: admin@company.com,boss@company.com
ADMIN_EMAILS=
```

### Optional: Reddit OAuth (local testing only, leave empty for production)

```bash
# Not needed for production — kept for local development
# These credentials cannot be obtained (Reddit's approval process is broken)
REDDIT_CLIENT_ID=
REDDIT_CLIENT_SECRET=
REDDIT_USER_AGENT=
```

---

## Deployment Steps

### 1. Set Environment Variables

**On Vercel:**
```
Settings → Environment Variables → Add
```

Key points:
- Add `SEARCH_API_KEY` — this is the critical one
- Add `SUPABASE_*` keys if using Supabase
- Prefix with `NUXT_PUBLIC_` for runtime overrides (no rebuild needed)

**Example for Vercel:**
```
SEARCH_API_KEY = sk_...
SUPABASE_URL = https://xxx.supabase.co
NUXT_PUBLIC_DAILY_SCAN_LIMIT = 5
```

### 2. Deploy

```bash
git push origin main
# Vercel auto-deploys from main
```

### 3. Verify

Visit your site:
1. Create a workspace → brand → campaign
2. Add 2-3 keywords
3. Click "Scan now"
4. Check results in inbox

**If scan fails:** Check Vercel logs for `SEARCH_API_KEY` — it's required to work.

---

## Cost Estimator

Based on default settings (3 scans/day, ~3 keywords per scan):

| Provider | Free | Starter | Scale |
|----------|------|---------|-------|
| **Exa** | 2,500 cr/mo (138 scans) | $10-30/mo | $100+/mo |
| **Serper** | 2,500 cr/mo (1,250 queries) | $50/50k | $1,250/2.5M |
| **Google SERP API** | None | $25-100/mo | Custom |

**Recommendation:** Start with Exa free tier (test coverage for 138 scans), switch to Serper Starter ($50/mo) when you need more.

---

## Reducing Costs if Needed

### Option 1: Lower Daily Scan Limit

```bash
NUXT_PUBLIC_DAILY_SCAN_LIMIT=1  # 1 scan/day per user = ~9 Exa queries/day
```

### Option 2: Reduce Results Per Scan

Edit `server/api/discover.post.ts` line 47:
```typescript
const limit = Math.min(Math.max(body.limit ?? 10, 1), 25)  // was 25, now 10
```

Saves 50% on API costs, slight loss in lead discovery.

### Option 3: Paid Tier

Serper Starter ($50/mo for 50k credits):
- Covers ~200 users at 3 scans/day
- Better quality than free tier
- Support included

---

## Monitoring

### Check API Usage

**Exa:**
- Dashboard: https://exa.ai/dashboard
- Monitor credit burn rate

**Vercel:**
- Settings → Analytics
- Monitor request count and latency

### Common Issues

| Issue | Fix |
|-------|-----|
| Scans return 0 leads | `SEARCH_API_KEY` not set or invalid |
| "Daily limit reached" errors | Reduce `DAILY_SCAN_LIMIT` or buy more credits |
| Slow scans | 1 sec per keyword is normal (rate limiting) |
| High API costs | Reduce `limit` per scan (10 instead of 25) |

---

## Rollback

If something breaks:
1. Set `SEARCH_API_KEY=` (empty)
2. Scans will fail gracefully (users see error message)
3. No data loss, all leads saved locally
4. Fix and re-deploy

---

## Next Steps

1. Get `SEARCH_API_KEY` from https://exa.ai (1 minute signup)
2. Set it in Vercel environment
3. Deploy
4. Test locally first (keywords you know have Reddit results)
5. Monitor costs for first week

Questions? Check `REDDIT_RATE_LIMITS.md` for rate limiting details or `PRIMARY.md` for technical deep dive.
