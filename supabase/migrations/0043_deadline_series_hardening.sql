-- Review fixes for 0042_deadline_series.sql.
--
-- 1. A bad user_preferences.timezone must not break anyone. The column is
--    only validated in the API layer, so a direct PostgREST PATCH can store
--    any string; `at time zone '<garbage>'` then raises inside the spawn
--    function. Called from the cron sweep that poisons the transaction for
--    EVERY user (the bad row sorts first and is retried every minute), and
--    from the status trigger it would block that user from completing or
--    cancelling a recurring deadline. Fix: fall back to UTC for an unknown
--    zone, and isolate each row in the sweep so one failure can't starve the
--    rest.
-- 2. cancel_deadline_series ran "mark spawned" and "cancel" as two
--    statements. A cron spawn landing between them created an occurrence
--    with no marker that the second statement then cancelled -- and the
--    status trigger (marker still NULL) spawned yet another, reviving the
--    series. The cancel now stamps the marker in the SAME statement, so the
--    trigger's WHEN clause always sees it.
-- 3. spawn_deadline_successor now refuses a soft-deleted occurrence (the
--    cron path already filtered on it; the trigger/direct path didn't), so a
--    spawn racing a course/person delete cascade can't leave a live
--    successor under a deleted parent.
--
-- Known limitation (not fixed): the next occurrence's local time is read
-- from the previous occurrence's due_at, so a series whose wall-clock time
-- falls in a spring-forward gap (e.g. 02:30) settles at the shifted time
-- (03:30) from then on.

create or replace function public.spawn_deadline_successor(p_deadline_id uuid)
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
  if not found
     or d.deleted_at is not null
     or cardinality(d.recurrence_days) = 0
     or d.recurrence_spawned_at is not null then
    return null;
  end if;

  -- Claim first: from here on this occurrence has handled its successor,
  -- including the case where the series simply ended.
  update public.deadlines set recurrence_spawned_at = now() where id = d.id;

  select coalesce(
    (select p.timezone from public.user_preferences p
      where p.user_id = d.user_id
        and exists (select 1 from pg_catalog.pg_timezone_names z where z.name = p.timezone)),
    'UTC'
  ) into v_timezone;
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

  select reminders_enabled, reminder_lead_minutes into v_reminders_enabled, v_lead_minutes
  from public.courses where id = d.course_id;
  if v_reminders_enabled and v_next > now() then
    insert into public.reminders (user_id, target_type, target_id, trigger_at)
    values (d.user_id, 'deadline', v_new_id, v_next - make_interval(mins => v_lead_minutes));
  end if;

  return v_new_id;
end;
$$;

create or replace function public.cancel_deadline_series(p_deadline_id uuid)
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

  -- End the series on every occurrence (whatever its status) so even a
  -- Submitted one confirmed Completed later can't revive it...
  update public.deadlines
  set recurrence_spawned_at = coalesce(recurrence_spawned_at, now())
  where recurrence_series_id = v_series and deleted_at is null;

  -- ...and stamp the marker again in the very statement that cancels, so an
  -- occurrence created by a concurrent sweep between the two statements
  -- can't slip through with a NULL marker and spawn a successor.
  update public.deadlines
  set status = 'Cancelled',
      recurrence_spawned_at = coalesce(recurrence_spawned_at, now())
  where recurrence_series_id = v_series and deleted_at is null and status in ('Not Started', 'In Progress');
  get diagnostics v_cancelled = row_count;

  return v_cancelled;
end;
$$;

create or replace function public.spawn_due_deadline_occurrences()
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

    -- One bad row must never starve everyone else's occurrences: on any
    -- error, log it and mark the row handled so it isn't retried forever.
    begin
      if public.spawn_deadline_successor(v_id) is not null then
        v_created := v_created + 1;
      end if;
    exception when others then
      raise warning 'spawn_deadline_successor failed for deadline %: %', v_id, sqlerrm;
      update public.deadlines set recurrence_spawned_at = now() where id = v_id;
    end;
  end loop;
  return v_created;
end;
$$;
