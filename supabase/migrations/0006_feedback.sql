-- SPEC-DATA-010: feedback + feedback_aggregates tables backing SPEC-CORE-007's
-- personalization/feedback loop (AC-004, NC-007), plus the 180-day rolling
-- retention sweep (AC-11/NC-DATA-010) and its SECURITY DEFINER lockdown
-- (AC-2/NC-DATA-012).
--
-- Item 6 architect-review round 2 found NC-DATA-012's "grant to the role
-- pg_cron invokes it as" imprecise -- there is no pg_cron role. This
-- migration instead mirrors 0001_init.sql/0004_voice_session_retention.sql's
-- actual precedent: grant execute to service_role only; the scheduled
-- cron.schedule call below needs no grant at all, since it runs in-process
-- as the function's owner (the migration-applying role), exactly like
-- dispatch_due_reminders() and delete_expired_voice_sessions().

create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  target_type text not null check (target_type in ('deadline', 'task', 'reminder')),
  target_id uuid not null,
  rating smallint not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now()
);

create table public.feedback_aggregates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  dimension text not null check (dimension in ('deadline', 'task', 'reminder')),
  sample_count integer not null default 0,
  rating_sum bigint not null default 0,
  -- Generated, never written directly: NULL-unsafe hand-maintained averages
  -- were exactly the round-1 architect-review finding this avoids. Only
  -- sample_count/rating_sum are ever assigned by sweep_expired_feedback()'s
  -- upsert below.
  avg_rating numeric generated always as (
    case when sample_count = 0 then 0 else rating_sum::numeric / sample_count end
  ) stored,
  updated_at timestamptz not null default now(),
  unique (user_id, dimension)
);

-- ---------------------------------------------------------------------------
-- Indexes (round-1 architect-review finding: feedback accumulates for 180
-- days rather than voice_sessions' 24 hours, so it will be the largest table
-- in the schema -- mirrors the index migration 0004 added for that sweep).
-- ---------------------------------------------------------------------------

create index feedback_user_id_idx on public.feedback (user_id);
create index feedback_created_at_idx on public.feedback (created_at);
-- feedback_aggregates needs no separate user_id index: the unique(user_id,
-- dimension) constraint above already creates a covering btree index.

-- ---------------------------------------------------------------------------
-- Ownership guard (NC-DATA-013): feedback.target_id is a polymorphic
-- reference with no real FK across deadlines/tasks/reminders, mirroring
-- reminders.target_id (guarded in 0001_init.sql by the same shape). Without
-- this, RLS on feedback alone would let a user attach feedback to another
-- user's deadline/task/reminder id, or to a uuid referencing nothing at
-- all -- SPEC-CORE-007 AC-004's "associated with that specific instance" is
-- otherwise unenforced at the only layer that can enforce it.
-- ---------------------------------------------------------------------------

create function public.guard_feedback_target_ownership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.target_type = 'deadline' then
    if not exists (
      select 1 from public.deadlines where id = NEW.target_id and user_id = NEW.user_id
    ) then
      raise exception 'feedback.target_id must reference a deadline owned by feedback.user_id';
    end if;
  elsif NEW.target_type = 'task' then
    if not exists (
      select 1 from public.tasks where id = NEW.target_id and user_id = NEW.user_id
    ) then
      raise exception 'feedback.target_id must reference a task owned by feedback.user_id';
    end if;
  elsif NEW.target_type = 'reminder' then
    if not exists (
      select 1 from public.reminders where id = NEW.target_id and user_id = NEW.user_id
    ) then
      raise exception 'feedback.target_id must reference a reminder owned by feedback.user_id';
    end if;
  end if;
  return NEW;
end;
$$;

create trigger trg_guard_feedback_target_ownership
before insert or update of target_type, target_id, user_id on public.feedback
for each row execute function public.guard_feedback_target_ownership();

-- ---------------------------------------------------------------------------
-- Row Level Security (NC-DATA-001, AC-2, NC-DATA-012)
-- ---------------------------------------------------------------------------

alter table public.feedback enable row level security;
alter table public.feedback_aggregates enable row level security;

-- feedback: select/insert/delete only, no update policy. SPEC-API-007
-- deliberately models no PATCH ("v1 feedback is submit-once,
-- delete-if-unwanted") -- omitting an update policy enforces that at the DB
-- layer too, not just by omission at the route layer. Delete is a real hard
-- DELETE (unlike courses/deadlines/tasks/notes, which get no delete policy
-- at all): NC-DATA-011 requires a user-initiated feedback deletion to be
-- immediate and permanent, mirroring voice_sessions' non-recoverable shape
-- rather than the soft-delete-only core entities.
create policy feedback_select on public.feedback
  for select using (auth.uid() = user_id);
create policy feedback_insert on public.feedback
  for insert with check (auth.uid() = user_id);
create policy feedback_delete on public.feedback
  for delete using (auth.uid() = user_id);

-- feedback_aggregates: SELECT-only for authenticated/anon (NC-DATA-012). No
-- INSERT/UPDATE/DELETE policy is granted at all -- RLS denies by default --
-- and the table grants below revoke those privileges explicitly rather than
-- relying on that default, matching the explicit-revoke stance 0001_init.sql
-- already takes for its active_* views. The only writer is
-- sweep_expired_feedback() below, a SECURITY DEFINER function whose own
-- EXECUTE privilege is separately locked down.
create policy feedback_aggregates_select on public.feedback_aggregates
  for select using (auth.uid() = user_id);
revoke insert, update, delete on public.feedback_aggregates from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Retention sweep (AC-11, NC-DATA-010): a single atomic statement -- a
-- data-modifying CTE (the DELETE ... RETURNING) feeding one multi-row
-- INSERT ... ON CONFLICT DO UPDATE, grouped by (user_id, target_type) --
-- never a separate SELECT-then-INSERT-then-DELETE sequence, which would let
-- two overlapping sweep runs double-count the same rows: the row locks the
-- DELETE takes make that impossible here.
-- ---------------------------------------------------------------------------

create function public.sweep_expired_feedback()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_groups_upserted integer;
begin
  with expired as (
    delete from public.feedback
    where created_at < now() - interval '180 days'
    returning user_id, target_type, rating
  )
  insert into public.feedback_aggregates (user_id, dimension, sample_count, rating_sum, updated_at)
  select user_id, target_type, count(*), sum(rating), now()
  from expired
  group by user_id, target_type
  on conflict (user_id, dimension) do update
    set sample_count = feedback_aggregates.sample_count + excluded.sample_count,
        rating_sum = feedback_aggregates.rating_sum + excluded.rating_sum,
        updated_at = now();

  -- Row count of the primary (INSERT) statement: the number of
  -- (user_id, dimension) groups upserted this run, not the raw count of
  -- feedback rows purged -- satisfies NC-DATA-012's "returns an integer
  -- affected-row count, or void; never setof public.feedback" without
  -- exposing any row's comment text through the RPC return value.
  get diagnostics v_groups_upserted = row_count;
  return v_groups_upserted;
end;
$$;

-- SECURITY DEFINER lockdown, same shape as dispatch_due_reminders() (0001)
-- and delete_expired_voice_sessions() (0004): revoke the PUBLIC-by-default
-- EXECUTE grant so this isn't exposed as a PostgREST RPC callable by any
-- authenticated/anon user. Without this, any authenticated caller could
-- invoke the sweep directly, forcing an early purge of every user's
-- feedback on demand -- the same class of unlocked-SECURITY-DEFINER-surface
-- gap this project has now found three times.
revoke execute on function public.sweep_expired_feedback() from public, anon, authenticated;
grant execute on function public.sweep_expired_feedback() to service_role;

-- SPEC-INFRA-006 NC-INF-006: invoked directly and synchronously in-process
-- from cron.schedule's own command, never via pg_net/Edge Function -- an
-- HTTP hop would put the aggregation and the deletion in different
-- transactions entirely, breaking NC-DATA-010's atomicity outright, on top
-- of the job_run_details truthfulness problem Item 4 already found. Once
-- daily is sufficient granularity for a 180-day TTL (unlike the 24h
-- voice_sessions sweep's 15-minute cadence).
select cron.schedule(
  'feedback-retention-sweep',
  '0 3 * * *', -- once daily at 03:00
  $cron$select public.sweep_expired_feedback();$cron$
);
