-- "New activity since you replied" tracking.
--
-- Re-scanning a thread refreshes its score and text in place but never
-- touches status or the draft — that state belongs to the team, not the
-- scanner (see upsertCandidates in discovery.ts). That's correct: a thread
-- you already replied to should not bounce back into "new". But it also
-- means nothing ever tells you a thread you posted in picked up fresh
-- replies, which is exactly the moment worth checking back on Reddit.
--
-- num_comments is refreshed on every scan (leads previously only stored the
-- derived score, never the raw count). replied_num_comments is a snapshot
-- taken automatically the moment status flips to 'replied', so the "new
-- activity" delta is always relative to when you posted, not to whatever an
-- arbitrary earlier scan happened to see.

alter table public.leads
  add column num_comments        int,
  add column replied_num_comments int;

create or replace function public.snapshot_replied_activity()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'replied' and (old.status is distinct from 'replied') then
    -- Fresh snapshot every time a thread (re-)enters 'replied', so moving
    -- away and back later resets the "since you posted" baseline instead of
    -- comparing against a stale first reply.
    new.replied_num_comments := new.num_comments;
  elsif new.status is distinct from 'replied' then
    new.replied_num_comments := null;
  end if;
  return new;
end;
$$;

create trigger leads_snapshot_replied_activity
  before update on public.leads
  for each row
  when (old.status is distinct from new.status)
  execute function public.snapshot_replied_activity();

comment on column public.leads.num_comments is
  'Raw reply count as of the most recent scan. Null when the source (e.g. the search index) does not report it.';
comment on column public.leads.replied_num_comments is
  'num_comments at the moment status became ''replied''. Null otherwise. num_comments - replied_num_comments is how many replies have landed since.';
