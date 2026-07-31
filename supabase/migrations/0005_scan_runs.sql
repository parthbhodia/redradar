-- Scan history.
--
-- Until now the only trace of a scan was `leads.discovered_at`, so the app
-- could not answer: how many scans have run, what did each return, did one
-- error, has a keyword ever produced anything. A scheduled scan that fails at
-- 3am failed silently. These two tables are also the prerequisite for cron
-- scans being trustworthy.

-- ---------------------------------------------------------------- runs

create table public.scan_runs (
  id            uuid primary key default gen_random_uuid(),
  campaign_id   uuid not null references public.campaigns(id) on delete cascade,
  -- Null for scheduled runs: nobody pressed anything.
  triggered_by  uuid references public.profiles(id) on delete set null,
  trigger       text not null default 'manual' check (trigger in ('manual', 'scheduled')),

  started_at    timestamptz not null default now(),
  finished_at   timestamptz,

  -- running  : still in flight (or the process died mid-scan)
  -- ok       : finished, no keyword errored
  -- partial  : finished, but at least one keyword failed
  -- failed   : aborted before writing any leads
  status        text not null default 'running' check (status in ('running', 'ok', 'partial', 'failed')),

  keywords      int not null default 0,
  scanned       int not null default 0,
  inserted      int not null default 0,
  updated       int not null default 0,
  skipped       int not null default 0,

  errors        text[] not null default '{}',
  error_message text,

  created_at    timestamptz not null default now()
);

create index scan_runs_campaign_idx on public.scan_runs (campaign_id, started_at desc);
create index scan_runs_status_idx   on public.scan_runs (status) where status <> 'ok';

-- ---------------------------------------------------------------- per keyword

-- One row per keyword per run. This is what answers "has this phrase ever
-- produced anything", which a snapshot of current leads cannot.
create table public.scan_run_keywords (
  id               uuid primary key default gen_random_uuid(),
  run_id           uuid not null references public.scan_runs(id) on delete cascade,
  phrase           text not null,
  subreddit_filter text,

  -- threads Reddit returned for this phrase
  scanned          int not null default 0,
  -- threads that survived filtering and won their dedupe
  matched          int not null default 0,
  inserted         int not null default 0,
  updated          int not null default 0,
  top_score        int,
  error            text,

  created_at       timestamptz not null default now()
);

create index scan_run_keywords_run_idx    on public.scan_run_keywords (run_id);
create index scan_run_keywords_phrase_idx on public.scan_run_keywords (phrase, created_at desc);

-- ---------------------------------------------------------------- RLS

alter table public.scan_runs         enable row level security;
alter table public.scan_run_keywords enable row level security;

-- Read-only to the client. Every write goes through the service role in
-- /api/discover and the cron route, which is also why there is no insert
-- policy here.
create policy scan_runs_select on public.scan_runs
  for select to authenticated using (public.can_access_campaign(campaign_id));

create policy scan_run_keywords_select on public.scan_run_keywords
  for select to authenticated
  using (exists (
    select 1 from public.scan_runs r
    where r.id = run_id and public.can_access_campaign(r.campaign_id)
  ));

-- ---------------------------------------------------------------- rollups

-- Lifetime yield per keyword, so a phrase that has never returned anything is
-- obvious without reading every run.
create or replace view public.keyword_performance
with (security_invoker = true) as
select
  r.campaign_id,
  k.phrase,
  count(*)                                    as runs,
  max(r.started_at)                           as last_run_at,
  sum(k.scanned)                              as threads_seen,
  sum(k.inserted)                             as leads_new,
  sum(k.updated)                              as leads_refreshed,
  max(k.top_score)                            as best_score,
  count(*) filter (where k.error is not null) as failed_runs
from public.scan_run_keywords k
join public.scan_runs r on r.id = k.run_id
group by r.campaign_id, k.phrase;

comment on view public.keyword_performance is
  'Lifetime scan yield per keyword. leads_new = 0 across several runs means the phrase is dead.';

grant select on public.keyword_performance to authenticated;
