-- Persists the Reddit OAuth access token and the last-seen rate-limit
-- reading across requests. Both previously lived in module-level closure
-- state inside createOAuthAdapter() in reddit.ts — but discover.post.ts and
-- cron/scan-all.post.ts call createRedditAdapter() fresh on every single
-- request, so that state was rebuilt from scratch every time:
--
-- - A new OAuth access token was fetched from Reddit on every scan, even
--   though tokens last ~1 hour and could be reused across many scans.
-- - The adaptive rate-limit pacing added alongside this migration (reading
--   X-Ratelimit-Remaining/-Reset off every response) could only ever see
--   state within one scan's own keyword loop — never across different
--   scans or different users, which was the entire point of adding it: the
--   OAuth app's rate limit is shared across every workspace scanning
--   concurrently.
--
-- One physical Reddit app (REDDIT_CLIENT_ID), one row. Service-role only —
-- no client ever needs to read or write this directly.

create table public.reddit_oauth_state (
  id                   int primary key default 1 check (id = 1),
  access_token         text,
  token_expires_at     timestamptz,
  rate_limit_remaining int,
  rate_limit_reset_at  timestamptz,
  updated_at           timestamptz not null default now()
);

insert into public.reddit_oauth_state (id) values (1);

alter table public.reddit_oauth_state enable row level security;
-- Deliberately no policies: RLS with zero policies denies every non-service-
-- role request outright, and nothing here should ever be readable by a
-- logged-in user regardless of role — it's an internal cache, not campaign
-- data scoped to a workspace.
