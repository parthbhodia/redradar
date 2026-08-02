# Reddit API Rate Limiting & Pacing Guide

## Current Setup

### Rate Limits Enforced

1. **Per-User Daily Scans** (User-level quota)
   - Default: 3 scans per day (configurable via `DAILY_SCAN_LIMIT` env var)
   - Resets at UTC midnight
   - Admins (configured in `ADMIN_EMAILS`) have unlimited scans
   - Applies to manual scans only (scheduled runs exempt)

2. **Reddit API Rate Limit** (API-level pacing)
   - Minimum 1 second between Reddit API calls
   - Each keyword search = 1 API call
   - Example: 3 keywords = 3 seconds total scan time
   - Prevents hitting Reddit's OAuth limit (60 req/min)

### Will Reddit Block Us?

**No**, with current pacing settings. Breakdown:

- OAuth limit: 60 requests per minute per app
- Our pacing: 1 request per second = 60 requests per minute (at the limit, but safe)
- In practice: Most scans have 3-5 keywords, so actual load is ~3-5 req/min

**If we remove pacing:**
- 10 concurrent users × 5 keywords = 50 requests/second → **3,000 req/min**
- Reddit would block the app for 5-60 minutes per OAuth spec

### How Many Times Can Users Run It?

**User limits:**
- Free users: 3 scans/day
- Admins: Unlimited scans
- Config: Set `DAILY_SCAN_LIMIT` env var to change

**Example scenarios:**
- 1 user, 3 keywords: ~3 seconds
- 10 users, 3 keywords each: ~3 seconds per user (no interference)
- 1 user, 50 keywords: ~50 seconds (hits limit but doesn't throttle)

## Implementation Details

### Pacing Mechanism

File: `server/utils/reddit-rate-limit.ts`

- Global state tracks last Reddit API call timestamp
- Before each keyword search, waits until 1 second has passed
- Transparent to endpoint logic (called automatically in `collectCandidates`)

```typescript
// Enforced automatically:
await enforceRedditPacing()
posts = await reddit.search({ ... })
```

### Quota Checking

File: `server/utils/scan-quota.ts`

- Checked at endpoint start (rate-limit before doing work)
- Returns 429 if user exceeded daily limit
- Includes reset time in error response

### Database Tracking

`scan_runs` table records:
- Who triggered the scan (`triggered_by` user ID)
- When it started/ended
- Manual vs scheduled (only manual counts toward quota)
- Results: scanned, inserted, updated counts

## Safety Features

✅ **Prevents abuse via:**
- Daily per-user limits
- Automatic pacing between API calls
- No concurrent request batching
- Transparent quota checking with clear error messages

✅ **Monitoring:**
- Scan history in `scan_runs` table
- Per-keyword outcome tracking (`scan_run_keywords`)
- Error logging for failed searches

## Testing Rate Limits

```bash
# Simulate multiple scans:
for i in {1..5}; do
  curl -X POST http://localhost:3000/api/discover \
    -H "Content-Type: application/json" \
    -b cookies.txt \
    -d '{"campaignId":"...","limit":25}'
  echo "Scan $i complete"
done
```

## Tuning (if needed)

**To change daily scan limit:**
```bash
DAILY_SCAN_LIMIT=5 npm run dev
```

**To change API pacing:**
Edit `server/utils/reddit-rate-limit.ts`:
```typescript
const REDDIT_API_MIN_DELAY_MS = 1000 // Change this
```

**Recommended values:**
- Conservative: 2000ms (1 req per 2 sec, 30/min)
- Current: 1000ms (1 req per sec, 60/min)
- Aggressive: 500ms (2 req per sec, 120/min) ⚠️ Not safe

## Monitoring in Production

Check `scan_runs` table:
```sql
SELECT user_id, COUNT(*) as scans_today, MAX(started_at) as last_scan
FROM scan_runs
WHERE triggered_by = '<user_id>' 
  AND trigger = 'manual'
  AND started_at >= DATE_TRUNC('day', NOW())
GROUP BY user_id
ORDER BY scans_today DESC;
```

## Troubleshooting

**User gets 429 error:**
- Daily limit exceeded (reset at UTC midnight)
- Admin email added to `ADMIN_EMAILS` to grant unlimited access

**Scan takes too long:**
- Pacing adds 1 sec × keyword_count to scan duration
- 10 keywords = ~10 second scan (normal)

**Reddit returns 403/429:**
- Check `scan_runs.errors` column for Reddit's response
- May indicate API credentials issue or IP blocked
- Contact Reddit API support if persistent
