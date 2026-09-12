-- Board merge (Phase 5a — schema only): Tasks + Course To-Do are merging into
-- one "Board" concept (Lists containing Cards). Rather than migrate Tasks'
-- rich feature set (reminders, transitions, cascade RPCs, voice mutation
-- schema, personalization scope, feedback, dashboard/driving/calendar/search
-- integration — all keyed off the literal string "task") onto todo_items,
-- this extends tasks with list_id/position and migrates todo_items rows
-- into it. todo_lists survives unchanged as the "List" concept (it already
-- has course_id/position, unused today). todo_items is dropped entirely
-- after migration.

alter table public.tasks add column list_id uuid references public.todo_lists(id) on delete set null;
alter table public.tasks add column position integer not null default 0;

create index tasks_list_id_idx on public.tasks (list_id);

-- ---------------------------------------------------------------------------
-- Ownership-integrity guard: a task's list_id must reference a live
-- todo_lists row owned by that same task's user_id. Mirrors
-- guard_todo_list_course_ownership (0015_course_todos.sql) /
-- guard_task_person_ownership (0013_people.sql).
-- ---------------------------------------------------------------------------

create function public.guard_task_list_ownership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.list_id is not null and not exists (
    select 1 from public.todo_lists where id = NEW.list_id and user_id = NEW.user_id and deleted_at is null
  ) then
    raise exception 'tasks.list_id must reference a todo_lists row owned by tasks.user_id';
  end if;
  return NEW;
end;
$$;

create trigger trg_guard_task_list_ownership
before insert or update of list_id, user_id on public.tasks
for each row execute function public.guard_task_list_ownership();

-- ---------------------------------------------------------------------------
-- Migrate todo_items -> tasks.
--
-- Two-step (insert as 'Open', then flip originally-done rows to 'Done'):
-- trg_guard_task_status requires every INSERT to land as 'Open' -- inserting
-- 'Done' directly fails it. A temporary column carries the old todo_items.id
-- across the two statements so the second step can target exactly the rows
-- that were is_done=true, then gets dropped once the UPDATE is done.
--
-- trg_guard_task_list_ownership is disabled for the bulk insert: some
-- historical todo_items rows can belong to an already-soft-deleted
-- todo_lists row (soft_delete_todo_list_cascade soft-deletes a list and its
-- items together, but the item's list_id still points at that now-dead
-- list) -- a live-ownership check would wrongly reject migrating those
-- already-soft-deleted rows.
-- ---------------------------------------------------------------------------

alter table public.tasks add column _migration_todo_item_id uuid;
alter table public.tasks disable trigger trg_guard_task_list_ownership;

insert into public.tasks (
  user_id, title, due_at, status, list_id, position, priority,
  reminders_enabled, tags, created_at, updated_at, deleted_at, _migration_todo_item_id
)
select
  user_id,
  title,
  case when due_date is null then null else due_date::timestamptz + interval '23:59:59' end,
  'Open',
  list_id,
  position,
  priority,
  false,
  '{}',
  created_at,
  updated_at,
  deleted_at,
  id
from public.todo_items;

alter table public.tasks enable trigger trg_guard_task_list_ownership;

update public.tasks t
set status = 'Done'
from public.todo_items ti
where t._migration_todo_item_id = ti.id
  and ti.is_done = true;

alter table public.tasks drop column _migration_todo_item_id;

drop view if exists public.active_todo_items;
drop table public.todo_items cascade;

-- ---------------------------------------------------------------------------
-- Rewrite soft_delete_todo_list_cascade: deleting a list now soft-deletes
-- its (task-backed) cards, not todo_items rows. Return signature is
-- unchanged (items_affected), so this is a straight CREATE OR REPLACE.
-- Reuses soft_delete_task_cascade per affected task id rather than
-- re-implementing its side effects (notes-unlinking, suggestion dismissal);
-- trg_tasks_soft_delete_dismiss_reminders (0001_init.sql) already fires on
-- the soft-delete UPDATE inside that function, so reminder dismissal needs
-- no separate step here either.
-- ---------------------------------------------------------------------------

create or replace function public.soft_delete_todo_list_cascade(p_list_id uuid)
returns table (items_affected int)
language plpgsql
as $$
declare
  v_now timestamptz := now();
  v_task_ids uuid[];
  v_items_affected int := 0;
  v_task_id uuid;
begin
  update public.todo_lists
  set deleted_at = v_now
  where id = p_list_id and deleted_at is null;

  if not found then
    return query select 0;
    return;
  end if;

  select array_agg(id) into v_task_ids
  from public.tasks
  where list_id = p_list_id and deleted_at is null;

  if v_task_ids is not null then
    foreach v_task_id in array v_task_ids loop
      perform public.soft_delete_task_cascade(v_task_id);
    end loop;
    v_items_affected := array_length(v_task_ids, 1);
  end if;

  return query select v_items_affected;
end;
$$;

-- ---------------------------------------------------------------------------
-- Rewrite soft_delete_course_cascade: its innermost cascade step was
-- course -> todo_lists -> todo_items; it's now course -> todo_lists ->
-- tasks (via list_id). Return column renamed todo_items_affected ->
-- board_cards_affected, so (Postgres requires it) the function is dropped
-- and recreated rather than CREATE OR REPLACEd. Per-task notes-unlinking and
-- suggestion-dismissal are delegated to soft_delete_task_cascade per id
-- (same reasoning as soft_delete_todo_list_cascade above) and folded into
-- this function's own running totals.
-- ---------------------------------------------------------------------------

drop function public.soft_delete_course_cascade(uuid);

create function public.soft_delete_course_cascade(p_course_id uuid)
returns table (deadlines_affected int, reminders_dismissed int, notes_unlinked int, board_cards_affected int, suggestions_dismissed int)
language plpgsql
as $$
declare
  v_now timestamptz := now();
  v_deadline_ids uuid[];
  v_deadlines_affected int := 0;
  v_reminders_dismissed int := 0;
  v_notes_unlinked int := 0;
  v_todo_list_id uuid;
  v_task_ids uuid[];
  v_board_cards_affected int := 0;
  v_suggestions_dismissed int := 0;
  v_course_suggestions_dismissed int := 0;
  v_task_id uuid;
  v_task_result record;
begin
  update public.courses
  set deleted_at = v_now
  where id = p_course_id and deleted_at is null;

  if not found then
    return query select 0, 0, 0, 0, 0;
    return;
  end if;

  select array_agg(id) into v_deadline_ids
  from public.deadlines
  where course_id = p_course_id and deleted_at is null;

  if v_deadline_ids is not null then
    -- Snapshot before cascading: these are exactly the rows
    -- trg_deadlines_soft_delete_dismiss_reminders is about to dismiss.
    select count(*) into v_reminders_dismissed
    from public.reminders
    where target_type = 'deadline'
      and target_id = any(v_deadline_ids)
      and acknowledgment_state in ('Scheduled', 'Snoozed');

    update public.deadlines
    set deleted_at = v_now
    where id = any(v_deadline_ids);

    v_deadlines_affected := array_length(v_deadline_ids, 1);
  end if;

  with unlinked as (
    update public.notes
    set linked_course_id = null
    where linked_course_id = p_course_id
    returning id
  )
  select count(*) into v_notes_unlinked from unlinked;

  select id into v_todo_list_id
  from public.todo_lists
  where course_id = p_course_id and deleted_at is null;

  if v_todo_list_id is not null then
    select array_agg(id) into v_task_ids
    from public.tasks
    where list_id = v_todo_list_id and deleted_at is null;

    if v_task_ids is not null then
      foreach v_task_id in array v_task_ids loop
        select * into v_task_result from public.soft_delete_task_cascade(v_task_id);
        v_notes_unlinked := v_notes_unlinked + v_task_result.notes_unlinked;
        v_suggestions_dismissed := v_suggestions_dismissed + v_task_result.suggestions_dismissed;
      end loop;
      v_board_cards_affected := array_length(v_task_ids, 1);
    end if;

    update public.todo_lists
    set deleted_at = v_now
    where id = v_todo_list_id;
  end if;

  with dismissed as (
    update public.personalization_suggestions
    set status = 'dismissed', dismissed_at = v_now
    where scope = 'course' and target_id = p_course_id and status = 'pending'
    returning id
  )
  select count(*) into v_course_suggestions_dismissed from dismissed;
  v_suggestions_dismissed := v_suggestions_dismissed + v_course_suggestions_dismissed;

  return query select v_deadlines_affected, v_reminders_dismissed, v_notes_unlinked, v_board_cards_affected, v_suggestions_dismissed;
end;
$$;

revoke execute on function public.soft_delete_course_cascade(uuid) from public, anon;
grant execute on function public.soft_delete_course_cascade(uuid) to authenticated;
