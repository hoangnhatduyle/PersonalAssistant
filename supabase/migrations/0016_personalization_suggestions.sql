-- Personalization suggestion engine: reads existing low-rated `feedback`
-- rows (0006_feedback.sql) and proposes ONE concrete, reversible change to a
-- specific Course's or Task's reminder_lead_minutes -- the only two fields
-- that actually drive dispatch_due_reminders() (a Deadline inherits its
-- timing from its governing Course; user_preferences.default_reminder_lead_minutes
-- is a form default only, never consumed by dispatch). A user must
-- explicitly Apply or Dismiss -- never auto-applied (SPEC-CORE-007
-- out_of_scope forbids autonomous side-effecting actions without
-- per-action confirmation).
--
-- feedback / feedback_aggregates are untouched by this migration -- this
-- only reads feedback, via the same RLS every other read goes through
-- (generation is a normal on-demand, user-triggered action, not a
-- privileged cron/service-role path -- see src/app/api/suggestions/generate).

create type public.personalization_suggestion_status as enum ('pending', 'applied', 'dismissed');

create table public.personalization_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  scope text not null check (scope in ('course', 'task')),
  target_id uuid not null,
  -- A closed set of exactly one value today -- a real column (not buried in
  -- jsonb) so a future addable dimension stays indexable/queryable without
  -- unpacking JSON, while keeping Apply mechanical: it only ever writes
  -- to_value onto this one known field, never an arbitrary caller-chosen one.
  field text not null default 'reminder_lead_minutes' check (field = 'reminder_lead_minutes'),
  from_value integer not null check (from_value between 0 and 1440),
  to_value integer not null check (to_value between 0 and 1440 and to_value <> from_value),
  rationale text not null,
  source_feedback_ids uuid[] not null,
  status public.personalization_suggestion_status not null default 'pending',
  applied_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz not null default now(),
  check ((status = 'applied') = (applied_at is not null)),
  check ((status = 'dismissed') = (dismissed_at is not null))
);

create index personalization_suggestions_user_status_idx
  on public.personalization_suggestions (user_id, status);

-- DB-enforced de-dup (mirrors reminders_one_live_per_target_idx,
-- 0001_init.sql) so a re-triggered "check for suggestions" click can't
-- create a second pending suggestion for the same target.
create unique index personalization_suggestions_one_pending_per_target_idx
  on public.personalization_suggestions (scope, target_id)
  where status = 'pending';

-- ---------------------------------------------------------------------------
-- Ownership guard (mirrors guard_feedback_target_ownership, 0006_feedback.sql):
-- target_id is a polymorphic reference with no real FK across courses/tasks.
-- Only a live (not soft-deleted) row may be targeted.
-- ---------------------------------------------------------------------------

create function public.guard_personalization_suggestion_target_ownership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.scope = 'course' then
    if not exists (
      select 1 from public.courses where id = NEW.target_id and user_id = NEW.user_id and deleted_at is null
    ) then
      raise exception 'personalization_suggestions.target_id must reference a live Course owned by personalization_suggestions.user_id';
    end if;
  elsif NEW.scope = 'task' then
    if not exists (
      select 1 from public.tasks where id = NEW.target_id and user_id = NEW.user_id and deleted_at is null
    ) then
      raise exception 'personalization_suggestions.target_id must reference a live Task owned by personalization_suggestions.user_id';
    end if;
  end if;
  return NEW;
end;
$$;

create trigger trg_guard_personalization_suggestion_target_ownership
before insert or update of scope, target_id, user_id on public.personalization_suggestions
for each row execute function public.guard_personalization_suggestion_target_ownership();

-- ---------------------------------------------------------------------------
-- Status-transition guard (mirrors guard_reminder_status, 0001_init.sql --
-- a plain trigger, not a SECURITY DEFINER RPC: user-driven status changes in
-- this codebase go through RLS + a transition-guard trigger, not a
-- privileged function).
-- ---------------------------------------------------------------------------

create function public.guard_personalization_suggestion_status()
returns trigger
language plpgsql
as $$
begin
  if TG_OP = 'INSERT' then
    if NEW.status is distinct from 'pending' then
      raise exception 'personalization_suggestions.status must be pending on insert, got %', NEW.status;
    end if;
    return NEW;
  end if;

  if NEW.status is distinct from OLD.status then
    if (OLD.status, NEW.status) not in (('pending', 'applied'), ('pending', 'dismissed')) then
      raise exception 'Forbidden personalization_suggestion_status transition: % -> %', OLD.status, NEW.status;
    end if;
  end if;
  return NEW;
end;
$$;

create trigger trg_guard_personalization_suggestion_status
before insert or update of status on public.personalization_suggestions
for each row execute function public.guard_personalization_suggestion_status();

-- ---------------------------------------------------------------------------
-- RLS. Generation, Apply, and Dismiss are all normal authenticated-user
-- actions (no cron/service-role path exists for this feature), so insert is
-- scoped to the owner like select/update -- not revoked from `authenticated`.
-- No delete policy: rows persist as an audit trail, mirroring `reminders`.
-- ---------------------------------------------------------------------------

alter table public.personalization_suggestions enable row level security;

create policy personalization_suggestions_select on public.personalization_suggestions
  for select using (auth.uid() = user_id);
create policy personalization_suggestions_insert on public.personalization_suggestions
  for insert with check (auth.uid() = user_id);
create policy personalization_suggestions_update on public.personalization_suggestions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Cascade wiring: auto-dismiss a pending suggestion when its target Course or
-- Task is soft-deleted, so a stale suggestion never lingers in the UI.
-- Postgres requires dropping a function before changing its return
-- signature -- both functions are redefined in full below (adding
-- suggestions_dismissed), mirroring 0015_course_todos.sql's redefinition of
-- soft_delete_course_cascade for the same reason.
--
-- Known gap, not fixed here: soft_delete_person_cascade (0013_people.sql)
-- independently duplicates course/task soft-delete logic rather than
-- calling the two functions below, so a Person-cascade delete will not
-- dismiss suggestions targeting the courses/tasks it cascades through.
-- Matches this codebase's existing tolerance for duplication across these
-- three cascade functions (no shared helper today).
-- ---------------------------------------------------------------------------

drop function public.soft_delete_course_cascade(uuid);

create function public.soft_delete_course_cascade(p_course_id uuid)
returns table (deadlines_affected int, reminders_dismissed int, notes_unlinked int, todo_items_affected int, suggestions_dismissed int)
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
  v_suggestions_dismissed int := 0;
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

  with dismissed as (
    update public.personalization_suggestions
    set status = 'dismissed', dismissed_at = v_now
    where scope = 'course' and target_id = p_course_id and status = 'pending'
    returning id
  )
  select count(*) into v_suggestions_dismissed from dismissed;

  return query select v_deadlines_affected, v_reminders_dismissed, v_notes_unlinked, v_todo_items_affected, v_suggestions_dismissed;
end;
$$;

revoke execute on function public.soft_delete_course_cascade(uuid) from public, anon;
grant execute on function public.soft_delete_course_cascade(uuid) to authenticated;

drop function public.soft_delete_task_cascade(uuid);

create function public.soft_delete_task_cascade(p_task_id uuid)
returns table (notes_unlinked int, suggestions_dismissed int)
language plpgsql
as $$
declare
  v_now timestamptz := now();
  v_notes_unlinked int := 0;
  v_suggestions_dismissed int := 0;
begin
  update public.tasks
  set deleted_at = v_now
  where id = p_task_id and deleted_at is null;

  if not found then
    return query select 0, 0;
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

  return query select v_notes_unlinked, v_suggestions_dismissed;
end;
$$;

revoke execute on function public.soft_delete_task_cascade(uuid) from public, anon;
grant execute on function public.soft_delete_task_cascade(uuid) to authenticated;
