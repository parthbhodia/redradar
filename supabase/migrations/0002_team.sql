-- RedRadar team collaboration
-- profiles (so members have names), claim/release on leads, an event log,
-- per-user drafts, posted-reply capture, and role-enforced RLS.

-- ---------------------------------------------------------------- profiles

-- Mirrors auth.users so the client can show "Priya claimed this" without ever
-- touching the auth schema. Kept in sync by a trigger on auth.users.
create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text not null,
  display_name text not null,
  created_at   timestamptz not null default now()
);

-- Backfill everyone who signed up before this migration.
insert into public.profiles (id, email, display_name)
select
  u.id,
  u.email,
  coalesce(nullif(u.raw_user_meta_data->>'full_name', ''), split_part(u.email, '@', 1))
from auth.users u
on conflict (id) do nothing;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- You can see the profile of anyone you share an org with (and yourself).
create or replace function public.shares_org_with(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.org_members a
    join public.org_members b on b.org_id = a.org_id
    where a.user_id = auth.uid()
      and b.user_id = p_user
  );
$$;

alter table public.profiles enable row level security;

create policy profiles_select on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.shares_org_with(id));

-- No client insert/update/delete: the trigger and the service role own writes.

-- Lets PostgREST embed profiles through org_members (member lists with names).
alter table public.org_members
  add constraint org_members_user_profile_fkey
  foreign key (user_id) references public.profiles(id) on delete cascade;

-- ---------------------------------------------------------------- roles

-- role has existed since 0001 but no policy ever read it. Admin = owner/admin.
create or replace function public.is_org_admin(p_org_id uuid)
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
      and m.role in ('owner', 'admin')
  );
$$;

-- Destructive / structural actions now need admin; day-to-day stays member.
-- `if exists` throughout: a bare drop on a missing policy aborts the whole
-- script, which leaves tables created but unprotected by any policy.
drop policy if exists orgs_update on public.orgs;
create policy orgs_update on public.orgs
  for update to authenticated
  using (public.is_org_admin(id)) with check (public.is_org_admin(id));

drop policy if exists org_members_insert on public.org_members;
create policy org_members_insert on public.org_members
  for insert to authenticated with check (public.is_org_admin(org_id));

drop policy if exists org_members_delete on public.org_members;
create policy org_members_delete on public.org_members
  for delete to authenticated
  using (user_id = auth.uid() or public.is_org_admin(org_id));

drop policy if exists brands_delete on public.brands;
create policy brands_delete on public.brands
  for delete to authenticated using (public.is_org_admin(org_id));

drop policy if exists campaigns_delete on public.campaigns;
create policy campaigns_delete on public.campaigns
  for delete to authenticated
  using (exists (
    select 1 from public.brands b
    where b.id = brand_id and public.is_org_admin(b.org_id)
  ));

-- ---------------------------------------------------------------- claim + posted reply

alter table public.leads
  add column assigned_to uuid references public.profiles(id) on delete set null,
  add column claimed_at  timestamptz,
  add column posted_url  text;

create index leads_assigned_idx on public.leads (assigned_to) where assigned_to is not null;

create or replace function public.can_access_lead(p_lead_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.leads l
    join public.campaigns c   on c.id = l.campaign_id
    join public.brands b      on b.id = c.brand_id
    join public.org_members m on m.org_id = b.org_id
    where l.id = p_lead_id
      and m.user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------- event log

-- Append-only. Who claimed, released, or moved a lead, and when. This powers
-- attribution in the inbox and per-person throughput on the dashboard.
create table public.lead_events (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid not null references public.leads(id) on delete cascade,
  user_id     uuid references public.profiles(id) on delete set null,
  type        text not null check (type in ('claimed', 'released', 'status_changed')),
  from_status text,
  to_status   text,
  created_at  timestamptz not null default now()
);

create index lead_events_lead_idx    on public.lead_events (lead_id, created_at desc);
create index lead_events_created_idx on public.lead_events (created_at desc);

alter table public.lead_events enable row level security;

create policy lead_events_select on public.lead_events
  for select to authenticated using (public.can_access_lead(lead_id));

-- Append-only and always as yourself: no update/delete policies on purpose.
create policy lead_events_insert on public.lead_events
  for insert to authenticated
  with check (user_id = auth.uid() and public.can_access_lead(lead_id));

-- ---------------------------------------------------------------- per-user drafts

-- One draft per person per lead, so two teammates never silently overwrite
-- each other. leads.reply_draft remains for local mode and as the AI seed.
create table public.lead_drafts (
  lead_id    uuid not null references public.leads(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  body       text not null default '',
  updated_at timestamptz not null default now(),
  primary key (lead_id, user_id)
);

create trigger lead_drafts_touch_updated_at
  before update on public.lead_drafts
  for each row execute function public.touch_updated_at();

alter table public.lead_drafts enable row level security;

-- Teammates can read each other's drafts (that's the review flow), but only
-- ever write their own row.
create policy lead_drafts_select on public.lead_drafts
  for select to authenticated using (public.can_access_lead(lead_id));

create policy lead_drafts_insert on public.lead_drafts
  for insert to authenticated
  with check (user_id = auth.uid() and public.can_access_lead(lead_id));

create policy lead_drafts_update on public.lead_drafts
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy lead_drafts_delete on public.lead_drafts
  for delete to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------- grants

revoke execute on function public.shares_org_with(uuid) from public, anon;
revoke execute on function public.is_org_admin(uuid)    from public, anon;
revoke execute on function public.can_access_lead(uuid) from public, anon;
grant  execute on function public.shares_org_with(uuid) to authenticated;
grant  execute on function public.is_org_admin(uuid)    to authenticated;
grant  execute on function public.can_access_lead(uuid) to authenticated;
