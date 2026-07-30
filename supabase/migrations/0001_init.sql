-- RedRadar core schema
-- Multi-tenant: everything hangs off an org, and RLS is enforced by org membership.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- orgs

create table public.orgs (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  slug       text not null unique,
  created_at timestamptz not null default now()
);

create table public.org_members (
  org_id     uuid not null references public.orgs(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null default 'owner' check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

create index org_members_user_idx on public.org_members (user_id);

-- Membership checks run as SECURITY DEFINER so that policies on org_members
-- can call them without recursing into org_members' own RLS.
create or replace function public.is_org_member(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.org_members m
    where m.org_id = p_org_id
      and m.user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------- brands

create table public.brands (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs(id) on delete cascade,
  name        text not null,
  tagline     text,
  description text,
  voice       text,
  competitors text[] not null default '{}',
  created_at  timestamptz not null default now()
);

create index brands_org_idx on public.brands (org_id);

create or replace function public.can_access_brand(p_brand_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.brands b
    join public.org_members m on m.org_id = b.org_id
    where b.id = p_brand_id
      and m.user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------- campaigns

create table public.campaigns (
  id         uuid primary key default gen_random_uuid(),
  brand_id   uuid not null references public.brands(id) on delete cascade,
  name       text not null,
  status     text not null default 'active' check (status in ('active', 'paused', 'archived')),
  created_at timestamptz not null default now()
);

create index campaigns_brand_idx on public.campaigns (brand_id);

create or replace function public.can_access_campaign(p_campaign_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.campaigns c
    join public.brands b      on b.id = c.brand_id
    join public.org_members m on m.org_id = b.org_id
    where c.id = p_campaign_id
      and m.user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------- keywords

create table public.keywords (
  id               uuid primary key default gen_random_uuid(),
  campaign_id      uuid not null references public.campaigns(id) on delete cascade,
  phrase           text not null,
  -- Optional comma-free single subreddit to restrict this phrase to (no leading r/).
  subreddit_filter text,
  created_at       timestamptz not null default now(),
  unique (campaign_id, phrase)
);

create index keywords_campaign_idx on public.keywords (campaign_id);

-- ---------------------------------------------------------------- leads

create table public.leads (
  id              uuid primary key default gen_random_uuid(),
  campaign_id     uuid not null references public.campaigns(id) on delete cascade,
  platform        text not null default 'reddit',
  external_id     text not null,
  url             text not null,
  title           text,
  body            text,
  subreddit       text,
  author          text,
  score           int  not null default 0,
  -- Why the scorer liked (or disliked) this thread, for inbox transparency.
  signals         text[] not null default '{}',
  matched_keyword text,
  status          text not null default 'new' check (status in ('new', 'queued', 'replied', 'skipped', 'won')),
  reply_draft     text,
  posted_at       timestamptz,
  discovered_at   timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (campaign_id, platform, external_id)
);

create index leads_campaign_status_idx on public.leads (campaign_id, status);
create index leads_campaign_score_idx  on public.leads (campaign_id, score desc);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger leads_touch_updated_at
  before update on public.leads
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------- org bootstrap

-- Creating an org and its first membership must happen together, so it runs as
-- SECURITY DEFINER rather than through two RLS-checked inserts from the client.
create or replace function public.create_org(p_name text)
returns public.orgs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org  public.orgs;
  v_base text;
  v_slug text;
  v_n    int := 0;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if coalesce(trim(p_name), '') = '' then
    raise exception 'workspace name is required';
  end if;

  v_base := trim(both '-' from regexp_replace(lower(trim(p_name)), '[^a-z0-9]+', '-', 'g'));
  if v_base = '' then
    v_base := 'workspace';
  end if;

  v_slug := v_base;
  while exists (select 1 from public.orgs o where o.slug = v_slug) loop
    v_n := v_n + 1;
    v_slug := v_base || '-' || v_n::text;
  end loop;

  insert into public.orgs (name, slug)
  values (trim(p_name), v_slug)
  returning * into v_org;

  insert into public.org_members (org_id, user_id, role)
  values (v_org.id, auth.uid(), 'owner');

  return v_org;
end;
$$;

-- ---------------------------------------------------------------- RLS

alter table public.orgs        enable row level security;
alter table public.org_members enable row level security;
alter table public.brands      enable row level security;
alter table public.campaigns   enable row level security;
alter table public.keywords    enable row level security;
alter table public.leads       enable row level security;

-- orgs: readable and editable by members. Creation goes through create_org().
create policy orgs_select on public.orgs
  for select to authenticated using (public.is_org_member(id));

create policy orgs_update on public.orgs
  for update to authenticated using (public.is_org_member(id)) with check (public.is_org_member(id));

-- org_members: you can always see your own row, plus everyone in your orgs.
create policy org_members_select on public.org_members
  for select to authenticated
  using (user_id = auth.uid() or public.is_org_member(org_id));

create policy org_members_insert on public.org_members
  for insert to authenticated with check (public.is_org_member(org_id));

create policy org_members_delete on public.org_members
  for delete to authenticated using (public.is_org_member(org_id));

-- brands
create policy brands_select on public.brands
  for select to authenticated using (public.is_org_member(org_id));

create policy brands_insert on public.brands
  for insert to authenticated with check (public.is_org_member(org_id));

create policy brands_update on public.brands
  for update to authenticated using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));

create policy brands_delete on public.brands
  for delete to authenticated using (public.is_org_member(org_id));

-- campaigns
create policy campaigns_select on public.campaigns
  for select to authenticated using (public.can_access_brand(brand_id));

create policy campaigns_insert on public.campaigns
  for insert to authenticated with check (public.can_access_brand(brand_id));

create policy campaigns_update on public.campaigns
  for update to authenticated using (public.can_access_brand(brand_id)) with check (public.can_access_brand(brand_id));

create policy campaigns_delete on public.campaigns
  for delete to authenticated using (public.can_access_brand(brand_id));

-- keywords
create policy keywords_select on public.keywords
  for select to authenticated using (public.can_access_campaign(campaign_id));

create policy keywords_insert on public.keywords
  for insert to authenticated with check (public.can_access_campaign(campaign_id));

create policy keywords_update on public.keywords
  for update to authenticated using (public.can_access_campaign(campaign_id)) with check (public.can_access_campaign(campaign_id));

create policy keywords_delete on public.keywords
  for delete to authenticated using (public.can_access_campaign(campaign_id));

-- leads: the client reads and updates status/draft. Discovery writes go through
-- the service role in /api/discover, which bypasses RLS.
create policy leads_select on public.leads
  for select to authenticated using (public.can_access_campaign(campaign_id));

create policy leads_insert on public.leads
  for insert to authenticated with check (public.can_access_campaign(campaign_id));

create policy leads_update on public.leads
  for update to authenticated using (public.can_access_campaign(campaign_id)) with check (public.can_access_campaign(campaign_id));

create policy leads_delete on public.leads
  for delete to authenticated using (public.can_access_campaign(campaign_id));

-- ---------------------------------------------------------------- grants

revoke execute on function public.create_org(text) from public, anon;
grant  execute on function public.create_org(text) to authenticated;

revoke execute on function public.is_org_member(uuid)       from public, anon;
revoke execute on function public.can_access_brand(uuid)    from public, anon;
revoke execute on function public.can_access_campaign(uuid) from public, anon;
grant  execute on function public.is_org_member(uuid)       to authenticated;
grant  execute on function public.can_access_brand(uuid)    to authenticated;
grant  execute on function public.can_access_campaign(uuid) to authenticated;
