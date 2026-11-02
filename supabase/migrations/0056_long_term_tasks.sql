-- Long-term tasks: open-ended tasks with no due date that should stay on the
-- radar (shown in their own card on Today) without ever reading as past due.
-- A long-term task has due_at = null by definition -- every due-date-driven
-- widget (Up Next, Workload Ahead, rings, At Risk, reminders) already skips
-- tasks without a due_at, so nothing else needs to learn about the flag.

alter table public.tasks add column is_long_term boolean not null default false;

-- Backstop only: normalize_task_long_term (below) resolves every UPDATE that
-- would violate this, and the API rejects a contradictory INSERT payload.
alter table public.tasks
  add constraint tasks_long_term_has_no_due_at
  check (not (is_long_term and due_at is not null));

-- Whichever field the caller touches last wins, so no write path (the form,
-- voice mutations, suggestion apply) has to know about the pairing:
--   * is_long_term flipped on  -> due_at is cleared
--   * a due_at is set          -> is_long_term is flipped off
-- An INSERT carrying both is left alone and fails the check above.
create function public.normalize_task_long_term()
returns trigger
language plpgsql
as $$
begin
  if TG_OP = 'UPDATE' and NEW.is_long_term and NEW.due_at is not null then
    if not OLD.is_long_term then
      NEW.due_at := null;
    else
      NEW.is_long_term := false;
    end if;
  end if;
  return NEW;
end;
$$;

create trigger trg_tasks_normalize_long_term
before update of is_long_term, due_at on public.tasks
for each row execute function public.normalize_task_long_term();

-- active_tasks is a `select *` view whose column list is frozen at CREATE
-- VIEW time (same fix as 0021 / 0034 / 0036). Recreate it.
drop view public.active_tasks;
create view public.active_tasks with (security_invoker = on) as
  select * from public.tasks where deleted_at is null;
revoke insert, update, delete on public.active_tasks from anon, authenticated;

-- Toggling the flag is a real edit, so it counts as a "touch" for staleness
-- (see the note in 0050_task_trivial_touch_exclusion.sql). Same trigger as
-- 0050 plus the new column.
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
  OLD.is_long_term is distinct from NEW.is_long_term
)
execute function public.set_updated_at();

-- duplicate_task (0052) additionally copies the flag, so reopening a Done
-- long-term card yields another long-term card rather than a dateless task
-- that silently disappears from Today. Everything else is unchanged.
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
    reminders_enabled, reminder_lead_minutes, position, is_long_term
  )
  values (
    v_src.user_id, v_src.title, v_src.list_id, v_src.person_id, v_src.priority, v_src.tags,
    v_src.reminders_enabled, v_src.reminder_lead_minutes, v_position, v_src.is_long_term
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
