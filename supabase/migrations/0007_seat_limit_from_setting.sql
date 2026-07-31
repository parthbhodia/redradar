-- Make the seat limit configurable without editing a migration.
--
-- 0006 baked `3` into the function body, which meant the number lived in two
-- places: here and the app. Postgres cannot read Vercel's environment — it is a
-- different process on a different host — so the app's env var can never reach
-- this trigger directly. The closest equivalent is a database-level setting,
-- which is one statement to change and needs no deploy:
--
--   alter database postgres set app.max_org_members = 5;
--
-- New connections pick it up; existing pooled ones need `select
-- pg_reload_conf()` or a brief wait. Unset falls back to 3, matching
-- DEFAULT_MAX_ORG_MEMBERS in shared/limits.ts.
--
-- Keep this in step with MAX_ORG_MEMBERS in the app. They enforce the same rule
-- at different layers: the app so the UI can explain the limit before anyone
-- hits it, this so two racing invites cannot both slip past the count.

create or replace function public.enforce_org_seat_limit()
returns trigger
language plpgsql
as $$
declare
  seats     int;
  max_seats int;
begin
  -- `true` makes a missing setting return null rather than raising.
  max_seats := coalesce(
    nullif(current_setting('app.max_org_members', true), '')::int,
    3
  );

  -- Locks the org's rows for the duration of the transaction, so a concurrent
  -- insert waits here instead of counting the same stale total.
  select count(*) into seats
  from public.org_members
  where org_id = new.org_id
  for update;

  if seats >= max_seats then
    raise exception 'This workspace is full — % members is the limit.', max_seats
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

-- The trigger itself is unchanged; 0006 already created it. Recreated here so
-- this migration stands alone if 0006 was never applied.
drop trigger if exists org_members_seat_limit on public.org_members;

create trigger org_members_seat_limit
  before insert on public.org_members
  for each row
  execute function public.enforce_org_seat_limit();
