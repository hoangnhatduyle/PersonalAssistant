-- People: lets an account owner track another individual's (e.g. a family
-- member's) Courses/Deadlines/Tasks under their own account, for calendar
-- overlay and coordination (e.g. ride planning). Not a sharing/multi-tenancy
-- feature -- a Person has no login of their own; every row they "own" is
-- still owned (user_id) by the account holder who created them.

create table public.people (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  -- #RRGGBB only -- distinguishes people on the calendar via inline style,
  -- independent of the existing fixed-size StatusTone palette (which encodes
  -- status, not identity, and can't scale to an arbitrary number of people).
  color text not null default '#6366f1' check (color ~ '^#[0-9a-fA-F]{6}$'),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Nullable: null means "the account owner's own item", not "unset" -- this
-- lets every pre-existing courses/tasks/deadlines row remain valid with no
-- backfill. on delete set null (not cascade/restrict): the real unlink path
-- is soft_delete_person_cascade below; people has no DELETE policy, so a
-- hard DELETE -- and thus this FK action -- never fires through the app.
alter table public.courses add column person_id uuid references public.people(id) on delete set null;
alter table public.tasks add column person_id uuid references public.people(id) on delete set null;
-- Server-derived only: a deadline's owner is always its (not-null) course's
-- owner. Set from the parent course at insert time and bulk-synced whenever
-- the course's person_id changes (see src/app/api/courses/[id]/route.ts) --
-- deadlinePayloadSchema never accepts this field from a client.
alter table public.deadlines add column person_id uuid references public.people(id) on delete set null;

create index people_user_id_idx on public.people (user_id);
create index people_deleted_at_idx on public.people (deleted_at) where deleted_at is not null;
create index courses_person_id_idx on public.courses (person_id);
create index tasks_person_id_idx on public.tasks (person_id);
create index deadlines_person_id_idx on public.deadlines (person_id);

alter table public.people enable row level security;

-- Soft-delete-only (NC-DATA-005), same as courses/deadlines/tasks/notes: no
-- DELETE policy, so a real SQL DELETE is rejected by RLS.
create policy people_select on public.people
  for select using (auth.uid() = user_id);
create policy people_insert on public.people
  for insert with check (auth.uid() = user_id);
create policy people_update on public.people
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create trigger trg_people_set_updated_at
before update on public.people
for each row execute function public.set_updated_at();

create view public.active_people with (security_invoker = on) as
  select * from public.people where deleted_at is null;

revoke insert, update, delete on public.active_people from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Ownership-integrity guards: a course/task's person_id must reference a
-- Person owned by that same course/task's user_id. Defense in depth --
-- src/app/api/courses/route.ts and src/app/api/tasks/route.ts already verify
-- this before insert/update -- guarding against it slipping through any
-- future write path that bypasses the app layer.
-- ---------------------------------------------------------------------------

create function public.guard_course_person_ownership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.person_id is not null and not exists (
    select 1 from public.people where id = NEW.person_id and user_id = NEW.user_id and deleted_at is null
  ) then
    raise exception 'courses.person_id must reference a Person owned by courses.user_id';
  end if;
  return NEW;
end;
$$;

create trigger trg_guard_course_person_ownership
before insert or update of person_id, user_id on public.courses
for each row execute function public.guard_course_person_ownership();

create function public.guard_task_person_ownership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.person_id is not null and not exists (
    select 1 from public.people where id = NEW.person_id and user_id = NEW.user_id and deleted_at is null
  ) then
    raise exception 'tasks.person_id must reference a Person owned by tasks.user_id';
  end if;
  return NEW;
end;
$$;

create trigger trg_guard_task_person_ownership
before insert or update of person_id, user_id on public.tasks
for each row execute function public.guard_task_person_ownership();

-- ---------------------------------------------------------------------------
-- Person soft-delete cascade (mirrors soft_delete_course_cascade /
-- soft_delete_task_cascade in 0002_delete_cascade.sql). SECURITY INVOKER
-- (default): runs as the calling `authenticated` role, so existing RLS keeps
-- every statement scoped to the caller's own rows -- the API route still
-- does its own owned-row check before calling (defense in depth, not the
-- only gate).
-- ---------------------------------------------------------------------------

create function public.soft_delete_person_cascade(p_person_id uuid)
returns table (
  courses_affected int,
  deadlines_affected int,
  tasks_affected int,
  reminders_dismissed int,
  notes_unlinked int
)
language plpgsql
as $$
declare
  v_now timestamptz := now();
  v_course_ids uuid[];
  v_task_ids uuid[];
  v_deadline_ids uuid[];
  v_courses_affected int := 0;
  v_deadlines_affected int := 0;
  v_tasks_affected int := 0;
  v_reminders_dismissed int := 0;
  v_notes_unlinked int := 0;
  v_course_notes_unlinked int := 0;
  v_task_notes_unlinked int := 0;
begin
  update public.people
  set deleted_at = v_now
  where id = p_person_id and deleted_at is null;

  if not found then
    return query select 0, 0, 0, 0, 0;
    return;
  end if;

  select array_agg(id) into v_course_ids
  from public.courses
  where person_id = p_person_id and deleted_at is null;

  select array_agg(id) into v_task_ids
  from public.tasks
  where person_id = p_person_id and deleted_at is null;

  if v_course_ids is not null then
    select array_agg(id) into v_deadline_ids
    from public.deadlines
    where course_id = any(v_course_ids) and deleted_at is null;
  end if;

  -- Snapshot before cascading: these are exactly the reminders the
  -- trg_*_soft_delete_dismiss_reminders triggers are about to dismiss.
  select count(*) into v_reminders_dismissed
  from public.reminders
  where acknowledgment_state in ('Scheduled', 'Snoozed')
    and (
      (target_type = 'deadline' and v_deadline_ids is not null and target_id = any(v_deadline_ids))
      or (target_type = 'task' and v_task_ids is not null and target_id = any(v_task_ids))
    );

  if v_deadline_ids is not null then
    update public.deadlines
    set deleted_at = v_now
    where id = any(v_deadline_ids);
    v_deadlines_affected := array_length(v_deadline_ids, 1);
  end if;

  if v_course_ids is not null then
    update public.courses
    set deleted_at = v_now
    where id = any(v_course_ids);
    v_courses_affected := array_length(v_course_ids, 1);

    with unlinked as (
      update public.notes
      set linked_course_id = null
      where linked_course_id = any(v_course_ids)
      returning id
    )
    select count(*) into v_course_notes_unlinked from unlinked;
  end if;

  if v_task_ids is not null then
    update public.tasks
    set deleted_at = v_now
    where id = any(v_task_ids);
    v_tasks_affected := array_length(v_task_ids, 1);

    with unlinked as (
      update public.notes
      set linked_task_id = null
      where linked_task_id = any(v_task_ids)
      returning id
    )
    select count(*) into v_task_notes_unlinked from unlinked;
  end if;

  v_notes_unlinked := v_course_notes_unlinked + v_task_notes_unlinked;

  return query select v_courses_affected, v_deadlines_affected, v_tasks_affected, v_reminders_dismissed, v_notes_unlinked;
end;
$$;

revoke execute on function public.soft_delete_person_cascade(uuid) from public, anon;
grant execute on function public.soft_delete_person_cascade(uuid) to authenticated;
