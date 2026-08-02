# Production Deployment Guide

## Prerequisites

Your Reddit scraper is production-ready with OAuth credentials.

## Required Environment Variables

Set these on your deployment platform (Vercel, Railway, etc.):

### Reddit OAuth (REQUIRED for production)

```bash
# Reddit API OAuth credentials — direct API access
REDDIT_CLIENT_ID=iQrfMpNDrzZEiO7MShKzjQ
REDDIT_CLIENT_SECRET=pIjanvG91lZJ9G4niJCbdnHi_HJjzA
REDDIT_USER_AGENT=mi_app_reddit
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
# Daily scans per user — adjust based on usage
# Default: 3 scans/day
NUXT_PUBLIC_DAILY_SCAN_LIMIT=3

# Workspace member limit
# Default: 3 (owner + 2 members)
NUXT_PUBLIC_MAX_ORG_MEMBERS=3

# Admin emails get unlimited scans (comma-separated, no spaces)
# Example: admin@company.com,boss@company.com
ADMIN_EMAILS=
```

---

## Deployment Steps

### 1. Set Environment Variables

**On Vercel:**
```
Settings → Environment Variables → Add
```

Add these:
- `REDDIT_CLIENT_ID` = `iQrfMpNDrzZEiO7MShKzjQ`
- `REDDIT_CLIENT_SECRET` = `pIjanvG91lZJ9G4niJCbdnHi_HJjzA`
- `REDDIT_USER_AGENT` = `mi_app_reddit`
- `SUPABASE_URL` = (if using Supabase)
- `SUPABASE_KEY` = (if using Supabase)

Key points:
- Reddit credentials are required for OAuth
- Rate limiting is automatic (1 sec between searches)
- Prefix with `NUXT_PUBLIC_` for runtime overrides (no rebuild needed)

**Example for Vercel:**
```
REDDIT_CLIENT_ID = iQrfMpNDrzZEiO7MShKzjQ
REDDIT_CLIENT_SECRET = pIjanvG91lZJ9G4niJCbdnHi_HJjzA
REDDIT_USER_AGENT = mi_app_reddit
NUXT_PUBLIC_DAILY_SCAN_LIMIT = 3
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
4. Check results in inbox (should populate in 3-5 seconds)

**If scan fails:** Check Vercel logs for:
- `REDDIT_CLIENT_ID` and `REDDIT_CLIENT_SECRET` set correctly
- Network connectivity to `oauth.reddit.com`
- Rate limiting isn't blocking (shouldn't be with 3 keywords)

---

## Rate Limiting & Safety

Built-in protections prevent Reddit from blocking your app:

| Protection | Implementation | Effect |
|-----------|-----------------|--------|
| **Pacing** | 1 second between keyword searches | Automatic, transparent |
| **Daily quota** | 3 scans/day per user | Clear UI warnings |
| **Keyword limit** | 50 keywords per campaign | Form validation |
| **Concurrent protection** | No request batching | Sequential searches only |

Example: User runs scan with 5 keywords = 5 seconds total (1 sec × 5), stays well under Reddit's 60 req/min limit.

---

## Monitoring

### Check API Health

**Reddit OAuth Status:**
- Monitor 401/403 errors in logs (auth failure)
- Monitor 429 errors (rate limited by Reddit)

**Vercel:**
- Settings → Analytics
- Monitor request count and response times

### Common Issues

| Issue | Fix |
|-------|-----|
| 401 errors | Check REDDIT_CLIENT_ID/SECRET in Vercel |
| 429 errors (rate limited) | Reduce DAILY_SCAN_LIMIT or reduce keywords per scan |
| 0 leads returned | Check keyword matches Reddit (common words work better) |
| Slow scans | Normal — 1 sec per keyword is intentional (safety) |

---

## Tuning for Your Traffic

### If running smoothly, no changes needed

### If rate-limited by Reddit (429 errors)

Option 1: Reduce scan frequency
```bash
NUXT_PUBLIC_DAILY_SCAN_LIMIT=2  # Down from 3
```

Option 2: Add pacing buffer (edit code)
```typescript
// In server/utils/reddit-rate-limit.ts
const REDDIT_API_MIN_DELAY_MS = 2000  // Up from 1000 (2 sec between requests)
```

Option 3: Reduce team size
```bash
NUXT_PUBLIC_MAX_ORG_MEMBERS=2  # Down from 3 (limits concurrent users)
```

---

## Rollback

If something breaks:
1. Unset `REDDIT_CLIENT_ID` in Vercel
2. Scans will fail gracefully (users see error message)
3. No data loss, all leads saved locally
4. Fix and re-deploy

---

## Next Steps

1. ✅ Code ready (PR #2 merged to main)
2. Set REDDIT_CLIENT_ID/SECRET in Vercel environment
3. Deploy
4. Test with keywords you know have Reddit activity
5. Monitor for 48 hours for rate limit issues

Questions? Check `REDDIT_RATE_LIMITS.md` for rate limiting details.
