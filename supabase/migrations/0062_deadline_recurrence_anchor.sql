-- Moving ONE occurrence of a recurring deadline must not move the ones after it.
--
-- The successor's due date is derived from the previous occurrence's due_at
-- (next_deadline_occurrence_due_at, 0042), so dragging "this Thursday's"
-- deadline to Friday evening on the calendar would silently re-anchor every
-- later occurrence to Friday evening too. recurrence_anchor_due_at records the
-- slot the SCHEDULE gave an occurrence; the successor is computed from that,
-- while due_at is free to be moved for this occurrence alone.
--
-- NULL means "never moved": the anchor is then due_at itself, so every existing
-- row keeps behaving exactly as before. The database captures the anchor on the
-- first due_at edit of a recurring row, so every write path (REST, voice,
-- calendar) is covered, not just the new calendar route.
--
-- shift_deadline_series is the "All occurrences" half: it moves the series'
-- time of day (shared by every weekday -- the time is read from the previous
-- occurrence, 0042) and rotates the dragged weekday to its new weekday, for the
-- occurrence the user dragged and every still-upcoming open one.
--
-- Additive: one nullable column, two functions, one trigger; rolling back is
-- reverting the code.

alter table public.deadlines add column recurrence_anchor_due_at timestamptz;

-- active_deadlines is a `select *` view frozen at CREATE VIEW time (same fix as 0021 / 0034 / 0036 / 0041 / 0042).
drop view public.active_deadlines;
create view public.active_deadlines with (security_invoker = on) as
  select * from public.deadlines where deleted_at is null;
revoke insert, update, delete on public.active_deadlines from anon, authenticated;

create function public.capture_deadline_recurrence_anchor()
returns trigger
language plpgsql
as $$
begin
  if cardinality(OLD.recurrence_days) > 0
     and cardinality(NEW.recurrence_days) > 0
     and NEW.recurrence_anchor_due_at is null
     and NEW.due_at is distinct from OLD.due_at then
    NEW.recurrence_anchor_due_at := OLD.due_at;
  end if;
  return NEW;
end;
$$;

create trigger trg_deadlines_capture_recurrence_anchor
before update of due_at on public.deadlines
for each row execute function public.capture_deadline_recurrence_anchor();

-- The successor is computed from the occurrence's SLOT (anchor), and starts on it.
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

  update public.deadlines set recurrence_spawned_at = now() where id = d.id;

  select coalesce(
    (select p.timezone from public.user_preferences p
      where p.user_id = d.user_id
        and exists (select 1 from pg_catalog.pg_timezone_names z where z.name = p.timezone)),
    'UTC'
  ) into v_timezone;
  v_next := public.next_deadline_occurrence_due_at(
    coalesce(d.recurrence_anchor_due_at, d.due_at), d.recurrence_days, d.recurrence_end_date, v_timezone
  );
  if v_next is null then
    return null;
  end if;

  insert into public.deadlines (
    user_id, course_id, person_id, title, priority, due_at,
    recurrence_days, recurrence_end_date, recurrence_series_id, recurrence_anchor_due_at
  )
  values (
    d.user_id, d.course_id, d.person_id, d.title, d.priority, v_next,
    d.recurrence_days, d.recurrence_end_date, coalesce(d.recurrence_series_id, d.id), v_next
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

-- ---------------------------------------------------------------------------
-- shift_deadline_series: "All occurrences". p_new_due_at is where the user put
-- the occurrence p_deadline_id. That row lands exactly there; the series'
-- rule follows: every open upcoming occurrence takes the new time of day, and
-- those on the dragged occurrence's weekday move by the same number of days
-- (other weekdays keep their day). recurrence_days swaps the old weekday for
-- the new one. Finished and overdue-and-already-spawned rows are history and
-- stay put. Security invoker: RLS confines it to the caller's own rows, so a
-- stranger's id simply finds nothing. Refuses (check_violation) a drop onto a
-- weekday the series already repeats on. Returns the rows it changed, for the
-- caller to resync their reminders.
-- ---------------------------------------------------------------------------

create or replace function public.shift_deadline_series(p_deadline_id uuid, p_new_due_at timestamptz)
returns table (shifted_id uuid, shifted_due_at timestamptz, shifted_course_id uuid)
language plpgsql
as $$
declare
  t public.deadlines;
  v_timezone text;
  v_slot_local timestamp;
  v_new_local timestamp;
  v_delta integer;
  v_from smallint;
  v_to smallint;
  v_time time;
  v_days smallint[];
  r public.deadlines;
  v_row_local timestamp;
  v_new_due timestamptz;
  v_new_date date;
begin
  select * into t from public.deadlines where id = p_deadline_id and deleted_at is null for update;
  if not found or cardinality(t.recurrence_days) = 0 or t.recurrence_series_id is null then
    return;
  end if;

  select coalesce(
    (select p.timezone from public.user_preferences p
      where p.user_id = t.user_id
        and exists (select 1 from pg_catalog.pg_timezone_names z where z.name = p.timezone)),
    'UTC'
  ) into v_timezone;

  v_slot_local := coalesce(t.recurrence_anchor_due_at, t.due_at) at time zone v_timezone;
  v_new_local := p_new_due_at at time zone v_timezone;
  v_delta := v_new_local::date - v_slot_local::date;
  v_time := v_new_local::time;
  v_from := extract(dow from v_slot_local)::smallint;
  v_to := extract(dow from v_new_local)::smallint;

  -- Dropping onto a weekday the series already uses would merge two slots and silently lose one: refuse.
  if v_to <> v_from and v_to = any (t.recurrence_days) then
    raise exception 'this series already repeats on that weekday' using errcode = '23514';
  end if;

  select coalesce(array_agg(distinct day order by day), '{}'::smallint[])
  into v_days
  from unnest(case when v_from = any (t.recurrence_days) then array_replace(t.recurrence_days, v_from, v_to) else t.recurrence_days end) as day;

  for r in
    select * from public.deadlines
    where recurrence_series_id = t.recurrence_series_id
      and deleted_at is null
      and status in ('Not Started', 'In Progress')
      and (id = t.id or coalesce(recurrence_anchor_due_at, due_at) > now())
    order by due_at
    for update
  loop
    if r.id = t.id then
      v_new_due := p_new_due_at;
    else
      v_row_local := coalesce(r.recurrence_anchor_due_at, r.due_at) at time zone v_timezone;
      v_new_date := case when extract(dow from v_row_local)::smallint = v_from then v_row_local::date + v_delta else v_row_local::date end;
      -- Never push an occurrence past the series' end date: it keeps its day and only takes the new time.
      if r.recurrence_end_date is not null and v_new_date > r.recurrence_end_date then
        v_new_date := v_row_local::date;
      end if;
      v_new_due := (v_new_date + v_time) at time zone v_timezone;
    end if;

    update public.deadlines
    set due_at = v_new_due, recurrence_anchor_due_at = v_new_due, recurrence_days = v_days
    where id = r.id;

    shifted_id := r.id;
    shifted_due_at := v_new_due;
    shifted_course_id := r.course_id;
    return next;
  end loop;
end;
$$;

revoke execute on function public.shift_deadline_series(uuid, timestamptz) from public, anon;
grant execute on function public.shift_deadline_series(uuid, timestamptz) to authenticated;
