-- Estimates and manual progress, for the Up Next Gantt view.
--
--   * deadlines / tasks: estimated_hours (how long the work is expected to take),
--     progress_percent (0-100, set by hand to reflect real-world progress), and
--     progress_note (a short free-text status line).
--   * appointments: progress_percent / progress_note only. A Deadline Session's
--     estimate is its existing duration_minutes.
--
-- All nullable. NULL progress_percent means "not set by hand": the app then
-- derives progress (done sessions for a deadline, checklist items for a task,
-- done/planned for a session), so existing rows keep their meaning.
--
-- Additive: columns + a view refresh + three function/trigger re-creations
-- that carry the new columns; rolling back is reverting the code.

alter table public.deadlines
  add column estimated_hours numeric(6, 2) check (estimated_hours > 0),
  add column progress_percent smallint check (progress_percent between 0 and 100),
  add column progress_note text check (char_length(progress_note) <= 1000);

alter table public.tasks
  add column estimated_hours numeric(6, 2) check (estimated_hours > 0),
  add column progress_percent smallint check (progress_percent between 0 and 100),
  add column progress_note text check (char_length(progress_note) <= 1000);

alter table public.appointments
  add column progress_percent smallint check (progress_percent between 0 and 100),
  add column progress_note text check (char_length(progress_note) <= 1000);

-- active_deadlines / active_tasks are `select *` views whose column list is
-- frozen at CREATE VIEW time (same fix as 0021 / 0034 / 0036 / 0056 / 0062).
drop view public.active_deadlines;
create view public.active_deadlines with (security_invoker = on) as
  select * from public.deadlines where deleted_at is null;
revoke insert, update, delete on public.active_deadlines from anon, authenticated;

drop view public.active_tasks;
create view public.active_tasks with (security_invoker = on) as
  select * from public.tasks where deleted_at is null;
revoke insert, update, delete on public.active_tasks from anon, authenticated;

-- Editing the estimate or progress is a real edit, so it counts as a "touch"
-- for staleness (see the note in 0050_task_trivial_touch_exclusion.sql). Same
-- trigger as 0056 plus the three new columns.
drop trigger trg_tasks_set_updated_at on public.tasks;

create trigger trg_tasks_set_updated_at
before update on public.tasks
for each row
when (
  OLD.title is distinct from NEW.title or
  OLD.due_at is distinct from NEW.due_at or
  OLD.status is distinct from NEW.status or
  OLD.tags is distinct from NEW.tags or
  OLD.reminders_enabled is distinct from NEW.reminders_enabled or
  OLD.reminder_lead_minutes is distinct from NEW.reminder_lead_minutes or
  OLD.deleted_at is distinct from NEW.deleted_at or
  OLD.person_id is distinct from NEW.person_id or
  OLD.acknowledged_at is distinct from NEW.acknowledged_at or
  OLD.priority is distinct from NEW.priority or
  OLD.completed_at is distinct from NEW.completed_at or
  OLD.is_long_term is distinct from NEW.is_long_term or
  OLD.estimated_hours is distinct from NEW.estimated_hours or
  OLD.progress_percent is distinct from NEW.progress_percent or
  OLD.progress_note is distinct from NEW.progress_note
)
execute function public.set_updated_at();

-- The next occurrence of a recurring deadline is the same work again, so it
-- inherits the estimate. Progress is NOT copied: the successor starts at zero.
-- Body is 0062's, plus estimated_hours.
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
    user_id, course_id, person_id, title, priority, due_at, estimated_hours,
    recurrence_days, recurrence_end_date, recurrence_series_id, recurrence_anchor_due_at
  )
  values (
    d.user_id, d.course_id, d.person_id, d.title, d.priority, v_next, d.estimated_hours,
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

-- duplicate_task additionally copies the estimate (reopening a Done card is the
-- same work again) but not progress: the copy is a fresh Open card. Body is
-- 0056's, plus estimated_hours.
create or replace function public.duplicate_task(p_task_id uuid)
returns uuid
language plpgsql
as $$
declare
  v_src public.tasks%rowtype;
  v_new_id uuid;
  v_position integer;
begin
  select * into v_src
  from public.tasks
  where id = p_task_id and deleted_at is null;

  if not found then
    raise exception 'duplicate_task: task % not found', p_task_id;
  end if;

  select coalesce(min(position), 0) - 1 into v_position
  from public.tasks
  where user_id = v_src.user_id
    and deleted_at is null
    and list_id is not distinct from v_src.list_id;

  insert into public.tasks (
    user_id, title, list_id, person_id, priority, tags,
    reminders_enabled, reminder_lead_minutes, position, is_long_term, estimated_hours
  )
  values (
    v_src.user_id, v_src.title, v_src.list_id, v_src.person_id, v_src.priority, v_src.tags,
    v_src.reminders_enabled, v_src.reminder_lead_minutes, v_position, v_src.is_long_term, v_src.estimated_hours
  )
  returning id into v_new_id;

  insert into public.checklist_items (user_id, task_id, label, is_done, position)
  select user_id, v_new_id, label, false, position
  from public.checklist_items
  where task_id = p_task_id and deleted_at is null;

  insert into public.task_attachments (user_id, task_id, kind, title, url)
  select user_id, v_new_id, kind, title, url
  from public.task_attachments
  where task_id = p_task_id and deleted_at is null and kind = 'link';

  insert into public.task_labels (task_id, label_id, user_id)
  select v_new_id, tl.label_id, tl.user_id
  from public.task_labels tl
  join public.labels l on l.id = tl.label_id and l.deleted_at is null
  where tl.task_id = p_task_id;

  return v_new_id;
end;
$$;
