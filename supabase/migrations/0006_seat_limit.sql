-- Seat limit: three members per workspace.
--
-- `/api/invite` already counts seats before inviting, but that check is a read
-- followed by a write, so two invites racing each other can both pass it. This
-- trigger is the actual guarantee, and it also covers every other write path —
-- signup, a future admin tool, a hand-written SQL insert.
--
-- Kept as a trigger rather than a check constraint because the rule is about
-- sibling rows, which a check constraint cannot see.

create or replace function public.enforce_org_seat_limit()
returns trigger
language plpgsql
as $$
declare
  seats int;
  max_seats constant int := 3;
begin
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

drop trigger if exists org_members_seat_limit on public.org_members;

create trigger org_members_seat_limit
  before insert on public.org_members
  for each row
  execute function public.enforce_org_seat_limit();
