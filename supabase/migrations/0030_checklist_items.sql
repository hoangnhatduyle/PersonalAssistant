-- Checklists (Phase 2 of the Trello-style card-detail modal): a Task/Board
-- Card can have an ordered checklist of sub-items. on delete restrict for
-- task_id matches deadlines.course_id's convention for a required parent
-- (soft_delete_task_cascade below is the real unlink path, same reasoning as
-- people/todo_lists having no DELETE policy).

create table public.checklist_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete restrict,
  label text not null,
  is_done boolean not null default false,
  position integer not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index checklist_items_user_id_idx on public.checklist_items (user_id);
create index checklist_items_task_id_idx on public.checklist_items (task_id);
create index checklist_items_deleted_at_idx on public.checklist_items (deleted_at) where deleted_at is not null;

alter table public.checklist_items enable row level security;

-- Soft-delete-only (NC-DATA-005), same as courses/deadlines/tasks/notes/people: no
-- DELETE policy, so a real SQL DELETE is rejected by RLS.
create policy checklist_items_select on public.checklist_items
  for select using (auth.uid() = user_id);
create policy checklist_items_insert on public.checklist_items
  for insert with check (auth.uid() = user_id);
create policy checklist_items_update on public.checklist_items
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create trigger trg_checklist_items_set_updated_at
before update on public.checklist_items
for each row execute function public.set_updated_at();

create view public.active_checklist_items with (security_invoker = on) as
  select * from public.checklist_items where deleted_at is null;

revoke insert, update, delete on public.active_checklist_items from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Ownership-integrity guard: a checklist item's task_id must reference a
-- live tasks row owned by that same item's user_id. Mirrors
-- guard_task_list_ownership (0029_board_merge.sql).
-- ---------------------------------------------------------------------------

create function public.guard_checklist_item_task_ownership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.tasks where id = NEW.task_id and user_id = NEW.user_id and deleted_at is null
  ) then
    raise exception 'checklist_items.task_id must reference a tasks row owned by checklist_items.user_id';
  end if;
  return NEW;
end;
$$;

create trigger trg_guard_checklist_item_task_ownership
before insert or update of task_id, user_id on public.checklist_items
for each row execute function public.guard_checklist_item_task_ownership();

-- ---------------------------------------------------------------------------
-- Extend soft_delete_task_cascade (currently returns notes_unlinked,
-- suggestions_dismissed — 0016_personalization_suggestions.sql) with a
-- checklist_items_deleted column. Postgres requires drop+recreate for a
-- changed return signature. Callers (soft_delete_todo_list_cascade,
-- soft_delete_course_cascade) read the result into a `record`-typed
-- variable (one ignores it via `perform`), so they need no changes.
-- ---------------------------------------------------------------------------

drop function public.soft_delete_task_cascade(uuid);

create function public.soft_delete_task_cascade(p_task_id uuid)
returns table (notes_unlinked int, suggestions_dismissed int, checklist_items_deleted int)
language plpgsql
as $$
declare
  v_now timestamptz := now();
  v_notes_unlinked int := 0;
  v_suggestions_dismissed int := 0;
  v_checklist_items_deleted int := 0;
begin
  update public.tasks
  set deleted_at = v_now
  where id = p_task_id and deleted_at is null;

  if not found then
    return query select 0, 0, 0;
    return;
  end if;

  -- trg_tasks_soft_delete_dismiss_reminders (same transaction) already
  -- dismissed this task's own Scheduled/Snoozed reminder, if any.
  with unlinked as (
    update public.notes
    set linked_task_id = null
    where linked_task_id = p_task_id
    returning id
  )
  select count(*) into v_notes_unlinked from unlinked;

  with dismissed as (
    update public.personalization_suggestions
    set status = 'dismissed', dismissed_at = v_now
    where scope = 'task' and target_id = p_task_id and status = 'pending'
    returning id
  )
  select count(*) into v_suggestions_dismissed from dismissed;

  with deleted as (
    update public.checklist_items
    set deleted_at = v_now
    where task_id = p_task_id and deleted_at is null
    returning id
  )
  select count(*) into v_checklist_items_deleted from deleted;

  return query select v_notes_unlinked, v_suggestions_dismissed, v_checklist_items_deleted;
end;
$$;

revoke execute on function public.soft_delete_task_cascade(uuid) from public, anon;
grant execute on function public.soft_delete_task_cascade(uuid) to authenticated;
