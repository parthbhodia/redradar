-- One Reddit thread can land in several campaigns (any campaign sharing a
-- keyword finds it), which produces one lead row per campaign. Claiming is
-- per-row, so a claim in one campaign didn't stop a teammate claiming the twin
-- in another and both posting to the same thread. That is the exact failure
-- claiming exists to prevent.
--
-- Two parts: a view so the UI can show "claimed elsewhere", and a trigger that
-- refuses the second claim outright.

-- ---------------------------------------------------------------- view

-- Every lead alongside any sibling (same platform + external_id, same org)
-- that someone has already claimed.
create or replace view public.lead_thread_claims
with (security_invoker = true) as
select
  l.id                as lead_id,
  l.campaign_id,
  l.external_id,
  sib.id              as sibling_lead_id,
  sib.campaign_id     as sibling_campaign_id,
  sib_c.name          as sibling_campaign_name,
  sib.assigned_to     as sibling_assigned_to,
  p.display_name      as sibling_assigned_name,
  sib.status          as sibling_status,
  sib.claimed_at      as sibling_claimed_at
from public.leads l
join public.campaigns c    on c.id = l.campaign_id
join public.brands   b     on b.id = c.brand_id
join public.leads sib      on sib.external_id = l.external_id
                          and sib.platform    = l.platform
                          and sib.id <> l.id
join public.campaigns sib_c on sib_c.id = sib.campaign_id
join public.brands   sib_b  on sib_b.id = sib_c.brand_id
                          and sib_b.org_id = b.org_id
left join public.profiles p on p.id = sib.assigned_to
where sib.assigned_to is not null
   or sib.status in ('replied', 'won');

comment on view public.lead_thread_claims is
  'Sibling lead rows (same Reddit thread, same org, different campaign) that are already claimed or replied to.';

-- ---------------------------------------------------------------- guard

-- Blocks claiming a thread someone else already holds elsewhere in the org.
-- Re-claiming your own row, or taking one nobody holds, is unaffected.
create or replace function public.prevent_duplicate_thread_claim()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_holder text;
  v_camp   text;
begin
  if new.assigned_to is null or new.assigned_to is not distinct from old.assigned_to then
    return new;
  end if;

  select coalesce(p.display_name, 'someone'), sib_c.name
    into v_holder, v_camp
  from public.leads sib
  join public.campaigns sib_c on sib_c.id = sib.campaign_id
  join public.brands    sib_b on sib_b.id = sib_c.brand_id
  join public.campaigns own_c on own_c.id = new.campaign_id
  join public.brands    own_b on own_b.id = own_c.brand_id
                             and own_b.org_id = sib_b.org_id
  left join public.profiles p on p.id = sib.assigned_to
  where sib.external_id = new.external_id
    and sib.platform    = new.platform
    and sib.id <> new.id
    and sib.assigned_to is not null
    and sib.assigned_to <> new.assigned_to
  limit 1;

  if v_holder is not null then
    raise exception
      'This thread is already claimed by % in the "%" campaign. Coordinate before replying — two comments from one brand in a thread reads as brigading.',
      v_holder, v_camp
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger leads_prevent_duplicate_thread_claim
  before update on public.leads
  for each row execute function public.prevent_duplicate_thread_claim();

grant select on public.lead_thread_claims to authenticated;
