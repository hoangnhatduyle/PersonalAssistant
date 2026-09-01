-- Course To-Do board: a lightweight per-course/custom-list checklist,
-- distinct from Tasks (generic, no course link) and Deadlines (heavier —
-- status enum, priority, reminders). One list per live Course at most
-- (todo_lists_one_per_course_idx below); an unlimited number of freestanding
-- "custom" lists (course_id null) for things like "Misc" or a project name.

create table public.todo_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  -- Nullable: null means a freestanding/custom list (e.g. "Misc", "Project:
  -- Agrivoltaics"), not "unset". on delete set null (not cascade): deleting
  -- the course unlinks the list via soft_delete_course_cascade below rather
  -- than relying on this FK action directly (mirrors how deadlines/notes are
  -- handled in 0002_delete_cascade.sql / 0013_people.sql).
  course_id uuid references public.courses(id) on delete set null,
  name text not null,
  position integer not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.todo_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  list_id uuid not null references public.todo_lists(id) on delete cascade,
  title text not null,
  due_date date,
  is_done boolean not null default false,
  position integer not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One live list per live course; custom lists (course_id is null) are
-- unrestricted. Partial on deleted_at is null so a course can get a fresh
-- list after a prior one was soft-deleted.
create unique index todo_lists_one_per_course_idx on public.todo_lists (user_id, course_id)
  where course_id is not null and deleted_at is null;

create index todo_lists_user_id_idx on public.todo_lists (user_id);
create index todo_lists_course_id_idx on public.todo_lists (course_id);
create index todo_lists_deleted_at_idx on public.todo_lists (deleted_at) where deleted_at is not null;

create index todo_items_user_id_idx on public.todo_items (user_id);
create index todo_items_list_id_idx on public.todo_items (list_id);
create index todo_items_deleted_at_idx on public.todo_items (deleted_at) where deleted_at is not null;

alter table public.todo_lists enable row level security;
alter table public.todo_items enable row level security;

-- Soft-delete-only (NC-DATA-005), same as courses/deadlines/tasks/notes/people:
-- no DELETE policy, so a real SQL DELETE is rejected by RLS.
create policy todo_lists_select on public.todo_lists
  for select using (auth.uid() = user_id);
create policy todo_lists_insert on public.todo_lists
  for insert with check (auth.uid() = user_id);
create policy todo_lists_update on public.todo_lists
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy todo_items_select on public.todo_items
  for select using (auth.uid() = user_id);
create policy todo_items_insert on public.todo_items
  for insert with check (auth.uid() = user_id);
create policy todo_items_update on public.todo_items
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create trigger trg_todo_lists_set_updated_at
before update on public.todo_lists
for each row execute function public.set_updated_at();

create trigger trg_todo_items_set_updated_at
before update on public.todo_items
for each row execute function public.set_updated_at();

create view public.active_todo_lists with (security_invoker = on) as
  select * from public.todo_lists where deleted_at is null;

create view public.active_todo_items with (security_invoker = on) as
  select * from public.todo_items where deleted_at is null;

revoke insert, update, delete on public.active_todo_lists from anon, authenticated;
revoke insert, update, delete on public.active_todo_items from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Ownership-integrity guard: a todo_list's course_id must reference a Course
-- owned by that same list's user_id. Defense in depth, mirrors
-- guard_course_person_ownership / guard_task_person_ownership (0013_people.sql).
-- ---------------------------------------------------------------------------

create function public.guard_todo_list_course_ownership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.course_id is not null and not exists (
    select 1 from public.courses where id = NEW.course_id and user_id = NEW.user_id and deleted_at is null
  ) then
    raise exception 'todo_lists.course_id must reference a Course owned by todo_lists.user_id';
  end if;
  return NEW;
end;
$$;

create trigger trg_guard_todo_list_course_ownership
before insert or update of course_id, user_id on public.todo_lists
for each row execute function public.guard_todo_list_course_ownership();

-- ---------------------------------------------------------------------------
-- Cascade: deleting a whole list soft-deletes its items atomically (mirrors
-- soft_delete_task_cascade in 0002_delete_cascade.sql).
-- ---------------------------------------------------------------------------

create function public.soft_delete_todo_list_cascade(p_list_id uuid)
returns table (items_affected int)
language plpgsql
as $$
declare
  v_now timestamptz := now();
  v_item_ids uuid[];
  v_items_affected int := 0;
begin
  update public.todo_lists
  set deleted_at = v_now
  where id = p_list_id and deleted_at is null;

  if not found then
    return query select 0;
    return;
  end if;

  select array_agg(id) into v_item_ids
  from public.todo_items
  where list_id = p_list_id and deleted_at is null;

  if v_item_ids is not null then
    update public.todo_items
    set deleted_at = v_now
    where id = any(v_item_ids);
    v_items_affected := array_length(v_item_ids, 1);
  end if;

  return query select v_items_affected;
end;
$$;

revoke execute on function public.soft_delete_todo_list_cascade(uuid) from public, anon;
grant execute on function public.soft_delete_todo_list_cascade(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Extend the Course cascade so deleting a Course also cleans up its To-Do
-- list. Postgres requires dropping a function before changing its return
-- signature (adds todo_items_affected) — this replaces
-- soft_delete_course_cascade from 0002_delete_cascade.sql in full.
-- ---------------------------------------------------------------------------

drop function public.soft_delete_course_cascade(uuid);

create function public.soft_delete_course_cascade(p_course_id uuid)
returns table (deadlines_affected int, reminders_dismissed int, notes_unlinked int, todo_items_affected int)
language plpgsql
as $$
declare
  v_now timestamptz := now();
  v_deadline_ids uuid[];
  v_deadlines_affected int := 0;
  v_reminders_dismissed int := 0;
  v_notes_unlinked int := 0;
  v_todo_list_id uuid;
  v_todo_item_ids uuid[];
  v_todo_items_affected int := 0;
begin
  update public.courses
  set deleted_at = v_now
  where id = p_course_id and deleted_at is null;

  if not found then
    return query select 0, 0, 0, 0;
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
    select array_agg(id) into v_todo_item_ids
    from public.todo_items
    where list_id = v_todo_list_id and deleted_at is null;

    if v_todo_item_ids is not null then
      update public.todo_items
      set deleted_at = v_now
      where id = any(v_todo_item_ids);
      v_todo_items_affected := array_length(v_todo_item_ids, 1);
    end if;

    update public.todo_lists
    set deleted_at = v_now
    where id = v_todo_list_id;
  end if;

  return query select v_deadlines_affected, v_reminders_dismissed, v_notes_unlinked, v_todo_items_affected;
end;
$$;

revoke execute on function public.soft_delete_course_cascade(uuid) from public, anon;
grant execute on function public.soft_delete_course_cascade(uuid) to authenticated;
