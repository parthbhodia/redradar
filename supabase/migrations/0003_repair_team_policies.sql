-- Repairs 0002 when it aborted partway (a bare `drop policy` on a policy that
-- didn't exist rolls the whole script back, leaving tables created by an
-- earlier partial run but no policies on them). RLS enabled with zero policies
-- denies every write, which surfaces as:
--   new row violates row-level security policy for table "lead_drafts"
--
-- Everything here is idempotent, so it is safe to run even if 0002 completed.

-- ---------------------------------------------------------------- functions

create or replace function public.shares_org_with(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.org_members a
    join public.org_members b on b.org_id = a.org_id
    where a.user_id = auth.uid()
      and b.user_id = p_user
  );
$$;

create or replace function public.is_org_admin(p_org_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.org_members m
    where m.org_id = p_org_id
      and m.user_id = auth.uid()
      and m.role in ('owner', 'admin')
  );
$$;

create or replace function public.can_access_lead(p_lead_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
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

-- ---------------------------------------------------------------- rls on

alter table public.profiles    enable row level security;
alter table public.lead_events enable row level security;
alter table public.lead_drafts enable row level security;

-- ---------------------------------------------------------------- profiles

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.shares_org_with(id));

-- ---------------------------------------------------------------- role-gated policies from 0002

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

-- ---------------------------------------------------------------- lead_events

drop policy if exists lead_events_select on public.lead_events;
create policy lead_events_select on public.lead_events
  for select to authenticated using (public.can_access_lead(lead_id));

drop policy if exists lead_events_insert on public.lead_events;
create policy lead_events_insert on public.lead_events
  for insert to authenticated
  with check (user_id = auth.uid() and public.can_access_lead(lead_id));

-- ---------------------------------------------------------------- lead_drafts

drop policy if exists lead_drafts_select on public.lead_drafts;
create policy lead_drafts_select on public.lead_drafts
  for select to authenticated using (public.can_access_lead(lead_id));

drop policy if exists lead_drafts_insert on public.lead_drafts;
create policy lead_drafts_insert on public.lead_drafts
  for insert to authenticated
  with check (user_id = auth.uid() and public.can_access_lead(lead_id));

drop policy if exists lead_drafts_update on public.lead_drafts;
create policy lead_drafts_update on public.lead_drafts
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists lead_drafts_delete on public.lead_drafts;
create policy lead_drafts_delete on public.lead_drafts
  for delete to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------- grants

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.lead_drafts to authenticated;
grant select, insert on public.lead_events to authenticated;
grant select on public.profiles to authenticated;

revoke execute on function public.shares_org_with(uuid) from public, anon;
revoke execute on function public.is_org_admin(uuid)    from public, anon;
revoke execute on function public.can_access_lead(uuid) from public, anon;
grant  execute on function public.shares_org_with(uuid) to authenticated;
grant  execute on function public.is_org_admin(uuid)    to authenticated;
grant  execute on function public.can_access_lead(uuid) to authenticated;

-- Let PostgREST see the new policies immediately.
notify pgrst, 'reload schema';

-- ---------------------------------------------------------------- report

do $$
declare
  n int;
begin
  select count(*) into n from pg_policies
   where schemaname = 'public' and tablename = 'lead_drafts';
  raise notice 'lead_drafts now has % policies', n;
end $$;
