-- Recurring deadlines, take 2: every occurrence is its own separate deadline
-- row, and the NEXT occurrence appears as soon as the current one is
-- completed/cancelled OR comes due -- whichever happens first. So finishing
-- late never skips or spawns anything (the successor already exists) and
-- unfinished occurrences stack up as independent overdue rows the user
-- completes or cancels one by one. Replaces 0041's app-side "roll forward on
-- completion, anchored on today" (never shipped). Doing it in the database
-- makes the spawn atomic with the status change and lets pg_cron drive the
-- "comes due" half with no one clicking anything.
--
-- recurrence_series_id: shared by every occurrence of one series (set to the
--   first occurrence's own id). Lets "cancel the whole series" find them.
-- recurrence_spawned_at: set the moment this occurrence has dealt with its
--   successor -- created it, or ended the series (rule ran past its end
--   date, or the user cancelled the series). NULL = successor still pending.
--   Also the idempotency guard: an occurrence spawns at most once, so
--   completing an already-overdue one later creates nothing new.

alter table public.deadlines
  add column recurrence_series_id uuid,
  add column recurrence_spawned_at timestamptz;

-- Rows written during 0041's development: each is its own series; anything
-- already finished has already had its successor created.
update public.deadlines
set recurrence_series_id = id
where cardinality(recurrence_days) > 0 and recurrence_series_id is null;

update public.deadlines
set recurrence_spawned_at = coalesce(completed_at, updated_at)
where cardinality(recurrence_days) > 0 and status in ('Completed', 'Cancelled') and recurrence_spawned_at is null;

create index deadlines_recurrence_pending_idx
  on public.deadlines (due_at)
  where cardinality(recurrence_days) > 0 and recurrence_spawned_at is null and deleted_at is null;

create index deadlines_recurrence_series_idx
  on public.deadlines (recurrence_series_id)
  where recurrence_series_id is not null;

-- ---------------------------------------------------------------------------
-- Series id: assigned by the database so every write path (REST, voice,
-- service role) gets one, including an existing one-off deadline later
-- edited to repeat.
-- ---------------------------------------------------------------------------

create function public.set_deadline_recurrence_series_id()
returns trigger
language plpgsql
as $$
begin
  if cardinality(NEW.recurrence_days) > 0 and NEW.recurrence_series_id is null then
    NEW.recurrence_series_id := NEW.id;
  end if;
  return NEW;
end;
$$;

create trigger trg_deadlines_set_recurrence_series_id
before insert or update of recurrence_days on public.deadlines
for each row execute function public.set_deadline_recurrence_series_id();

-- ---------------------------------------------------------------------------
-- When is the next occurrence? The first selected weekday STRICTLY AFTER the
-- occurrence's own due day (in the user's timezone -- never jumping ahead to
-- today, so a late occurrence's successor is still the very next scheduled
-- one), at the same local wall-clock time. NULL once past the end date.
-- ---------------------------------------------------------------------------

create function public.next_deadline_occurrence_due_at(
  p_due_at timestamptz,
  p_days smallint[],
  p_end_date date,
  p_timezone text
)
returns timestamptz
language plpgsql
stable
as $$
declare
  v_local timestamp := p_due_at at time zone p_timezone;
  v_day date := v_local::date;
  v_time time := v_local::time;
  v_candidate date;
  i int;
begin
  for i in 1..7 loop
    v_candidate := v_day + i;
    if extract(dow from v_candidate)::smallint = any (p_days) then
      if p_end_date is not null and v_candidate > p_end_date then
        return null;
      end if;
      return (v_candidate + v_time) at time zone p_timezone;
    end if;
  end loop;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Create one occurrence's successor (and its reminder), exactly once.
-- Security definer because it is also driven by the cron sweep (no user
-- session); it only ever derives rows for the occurrence's own user_id.
-- ---------------------------------------------------------------------------

create function public.spawn_deadline_successor(p_deadline_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.deadlines;
  v_timezone text;
  v_next timestamptz;
  v_new_id uuid;
  v_reminders_enabled boolean;
  v_lead_minutes integer;
begin
  select * into d from public.deadlines where id = p_deadline_id for update;
  if not found or cardinality(d.recurrence_days) = 0 or d.recurrence_spawned_at is not null then
    return null;
  end if;

  -- Claim first: from here on this occurrence has handled its successor,
  -- including the case where the series simply ended.
  update public.deadlines set recurrence_spawned_at = now() where id = d.id;

  select coalesce((select timezone from public.user_preferences where user_id = d.user_id), 'UTC') into v_timezone;
  v_next := public.next_deadline_occurrence_due_at(d.due_at, d.recurrence_days, d.recurrence_end_date, v_timezone);
  if v_next is null then
    return null;
  end if;

  insert into public.deadlines (
    user_id, course_id, person_id, title, priority, due_at,
    recurrence_days, recurrence_end_date, recurrence_series_id
  )
  values (
    d.user_id, d.course_id, d.person_id, d.title, d.priority, v_next,
    d.recurrence_days, d.recurrence_end_date, coalesce(d.recurrence_series_id, d.id)
  )
  returning id into v_new_id;

  -- Same governance as src/lib/api/reminders.ts syncReminderForTarget: the
  -- course's reminder settings apply. A successor created already past due
  -- (cron catching up after an outage) gets none -- a reminder for something
  -- overdue on arrival is noise.
  select reminders_enabled, reminder_lead_minutes into v_reminders_enabled, v_lead_minutes
  from public.courses where id = d.course_id;
  if v_reminders_enabled and v_next > now() then
    insert into public.reminders (user_id, target_type, target_id, trigger_at)
    values (d.user_id, 'deadline', v_new_id, v_next - make_interval(mins => v_lead_minutes));
  end if;

  return v_new_id;
end;
$$;

revoke execute on function public.spawn_deadline_successor(uuid) from public, anon, authenticated;
grant execute on function public.spawn_deadline_successor(uuid) to service_role;

-- Completing or cancelling (just this occurrence) creates the next one right
-- away, in the same transaction as the status change. Cancelling the whole
-- series marks rows spawned first (cancel_deadline_series below), so the
-- WHEN clause skips them.
create function public.roll_forward_recurring_deadline()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.spawn_deadline_successor(NEW.id);
  return NEW;
end;
$$;

create trigger trg_deadlines_roll_forward
after update of status on public.deadlines
for each row
when (
  NEW.status in ('Completed', 'Cancelled')
  and OLD.status is distinct from NEW.status
  and cardinality(NEW.recurrence_days) > 0
  and NEW.recurrence_spawned_at is null
)
execute function public.roll_forward_recurring_deadline();

-- ---------------------------------------------------------------------------
-- Cancel the whole series: end it FIRST (every occurrence, whatever its
-- status, is marked as having no successor -- so even a Submitted one
-- confirmed Completed later can't revive it), then cancel every still-open
-- occurrence. Completed and awaiting-confirmation occurrences keep their
-- status. Security invoker: RLS confines it to the caller's own rows.
-- ---------------------------------------------------------------------------

create function public.cancel_deadline_series(p_deadline_id uuid)
returns integer
language plpgsql
as $$
declare
  v_series uuid;
  v_cancelled integer;
begin
  select recurrence_series_id into v_series
  from public.deadlines
  where id = p_deadline_id and deleted_at is null;
  if v_series is null then
    return 0;
  end if;

  update public.deadlines
  set recurrence_spawned_at = coalesce(recurrence_spawned_at, now())
  where recurrence_series_id = v_series and deleted_at is null;

  update public.deadlines
  set status = 'Cancelled'
  where recurrence_series_id = v_series and deleted_at is null and status in ('Not Started', 'In Progress');
  get diagnostics v_cancelled = row_count;

  return v_cancelled;
end;
$$;

revoke execute on function public.cancel_deadline_series(uuid) from public, anon;
grant execute on function public.cancel_deadline_series(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- The "comes due" half: an occurrence that's still open when its due time
-- passes gets its successor, so unfinished ones stack as separate deadlines.
-- Loops so a sweep after downtime catches up every missed occurrence in one
-- run (each pass marks a row spawned, so it always terminates; the cap is a
-- runaway guard). Pure SQL, in-process, like every other sweep here.
-- ---------------------------------------------------------------------------

create function public.spawn_due_deadline_occurrences()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_created integer := 0;
  v_passes integer := 0;
begin
  loop
    v_passes := v_passes + 1;
    exit when v_passes > 500;

    select id into v_id
    from public.deadlines
    where deleted_at is null
      and recurrence_spawned_at is null
      and cardinality(recurrence_days) > 0
      and status not in ('Completed', 'Cancelled')
      and due_at <= now()
    order by due_at
    limit 1
    for update skip locked;
    exit when v_id is null;

    if public.spawn_deadline_successor(v_id) is not null then
      v_created := v_created + 1;
    end if;
  end loop;
  return v_created;
end;
$$;

revoke execute on function public.spawn_due_deadline_occurrences() from public, anon, authenticated;
grant execute on function public.spawn_due_deadline_occurrences() to service_role;

select cron.schedule(
  'spawn-due-deadline-occurrences',
  '* * * * *', -- every minute; idempotent per row (recurrence_spawned_at)
  $cron$select public.spawn_due_deadline_occurrences();$cron$
);

-- active_deadlines is a `select *` view frozen at CREATE VIEW time (same fix
-- as 0021 / 0034 / 0036 / 0041).
drop view public.active_deadlines;
create view public.active_deadlines with (security_invoker = on) as
  select * from public.deadlines where deleted_at is null;
revoke insert, update, delete on public.active_deadlines from anon, authenticated;
