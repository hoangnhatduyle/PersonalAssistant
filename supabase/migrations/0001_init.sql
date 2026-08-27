-- SPEC-DATA-006: courses/deadlines/tasks/notes/reminders/voice_sessions schema, RLS,
-- transition-guard triggers, soft-delete backstops, reminder dispatch.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Enums (NC-DATA-002)
-- ---------------------------------------------------------------------------

create type deadline_status as enum (
  'Not Started', 'In Progress', 'Submitted', 'Overdue', 'Completed', 'Cancelled'
);

create type task_status as enum (
  'Open', 'Done', 'Cancelled'
);

create type reminder_status as enum (
  'Scheduled', 'Delivered', 'Acknowledged', 'Dismissed', 'Snoozed', 'Expired'
);

create type voice_session_state as enum (
  'Idle', 'Listening', 'Transcribing', 'IntentResolved', 'IntentAmbiguous',
  'AwaitingConfirmation', 'Executing', 'Responding'
);

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  -- Nullable: matches SPEC-DATA-006's shared_schemas (no NOT NULL declared),
  -- and auth.users.email is itself nullable for phone/anonymous sign-in —
  -- a NOT NULL here would make handle_new_user()'s trigger fail the entire
  -- auth.users insert for any such signup.
  email text,
  notification_channel text not null default 'in_app_push',
  created_at timestamptz not null default now()
);

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  code text,
  name text not null,
  term text,
  meeting_pattern text,
  location text,
  instructor text,
  reminders_enabled boolean not null default true,
  reminder_lead_minutes integer not null default 60,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.deadlines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete restrict,
  title text not null,
  due_at timestamptz not null,
  status deadline_status not null default 'Not Started',
  priority text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  due_at timestamptz,
  status task_status not null default 'Open',
  tags text[] not null default '{}',
  reminders_enabled boolean not null default true,
  reminder_lead_minutes integer not null default 60,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  -- NC-DATA-006: defensive backstop only; the primary unlink path is the
  -- SPEC-API-004 soft-delete cascade, which should mean this FK action never
  -- actually fires in normal operation (NC-DATA-005 forbids hard deletes).
  linked_course_id uuid references public.courses(id) on delete set null,
  linked_task_id uuid references public.tasks(id) on delete set null,
  linked_date date,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  target_type text not null check (target_type in ('deadline', 'task')),
  target_id uuid not null,
  trigger_at timestamptz not null,
  snooze_until timestamptz,
  delivered_at timestamptz,
  channel text not null default 'in_app_push',
  acknowledgment_state reminder_status not null default 'Scheduled',
  created_at timestamptz not null default now()
);

create table public.voice_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  state voice_session_state not null default 'Idle',
  transcript text,
  resolved_intent text,
  confidence_score numeric,
  pending_mutation jsonb,
  started_at timestamptz not null default now(),
  -- null until AwaitingConfirmation (AC-4); bounded thereafter.
  expires_at timestamptz,
  ended_at timestamptz,
  constraint voice_sessions_expires_at_set_when_awaiting_confirmation
    check (state <> 'AwaitingConfirmation' or expires_at is not null)
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create index courses_user_id_idx on public.courses (user_id);
create index deadlines_user_id_idx on public.deadlines (user_id);
create index deadlines_course_id_idx on public.deadlines (course_id);
-- Partial: only soft-deleted rows need this index (dispatch_due_reminders'
-- NOT EXISTS anti-joins are its only consumer; measured ~46x smaller than a
-- full-column index at 200k rows / 3% soft-deleted).
create index deadlines_deleted_at_idx on public.deadlines (deleted_at) where deleted_at is not null;
create index tasks_user_id_idx on public.tasks (user_id);
create index tasks_deleted_at_idx on public.tasks (deleted_at) where deleted_at is not null;
create index notes_user_id_idx on public.notes (user_id);
-- No deleted_at index on courses/notes: RLS-scoped reads plan as a bitmap
-- scan on user_id + a cheap heap filter, never touching deleted_at, and
-- neither table is a dispatch_due_reminders target.
create index reminders_user_id_idx on public.reminders (user_id);
create index reminders_target_idx on public.reminders (target_type, target_id);
create index reminders_dispatch_idx on public.reminders (acknowledgment_state, trigger_at, snooze_until);
-- At most one live (Scheduled/Snoozed) reminder per target: SPEC-CORE-005's
-- Reminder is singular per Deadline/Task ("its Reminder"), and forbidding
-- Delivered->Scheduled means recompute (SPEC-API-004 AC-8) must insert a new
-- row for an already-fired target rather than update in place — without this,
-- nothing stops those inserts from accumulating unbounded live duplicates.
create unique index reminders_one_live_per_target_idx on public.reminders (target_type, target_id)
  where acknowledgment_state in ('Scheduled', 'Snoozed');
create index voice_sessions_user_id_idx on public.voice_sessions (user_id);

-- ---------------------------------------------------------------------------
-- Row Level Security (NC-DATA-001, AC-2)
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.courses enable row level security;
alter table public.deadlines enable row level security;
alter table public.tasks enable row level security;
alter table public.notes enable row level security;
alter table public.reminders enable row level security;
alter table public.voice_sessions enable row level security;

-- No DELETE policy: profiles is the CASCADE root for every other table
-- (courses/deadlines/tasks/notes/reminders/voice_sessions all reference it
-- ON DELETE CASCADE). A self-service DELETE here would hard-delete all of a
-- user's data in one shot, defeating the soft-delete-only guarantee
-- (NC-DATA-005/NC-008) the same way an unrestricted DELETE on the child
-- tables would. Account deletion, if built, must go through a deliberate
-- service-role path, not a bare RLS-permitted DELETE.
create policy profiles_select on public.profiles
  for select using (auth.uid() = id);
create policy profiles_insert on public.profiles
  for insert with check (auth.uid() = id);
create policy profiles_update on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- Courses/Deadlines/Tasks/Notes are soft-delete-only (NC-DATA-005, critical):
-- no DELETE policy is granted, so a real SQL DELETE is rejected by RLS for
-- every non-service-role caller regardless of what application code does.
create policy courses_select on public.courses
  for select using (auth.uid() = user_id);
create policy courses_insert on public.courses
  for insert with check (auth.uid() = user_id);
create policy courses_update on public.courses
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy deadlines_select on public.deadlines
  for select using (auth.uid() = user_id);
create policy deadlines_insert on public.deadlines
  for insert with check (auth.uid() = user_id);
create policy deadlines_update on public.deadlines
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy tasks_select on public.tasks
  for select using (auth.uid() = user_id);
create policy tasks_insert on public.tasks
  for insert with check (auth.uid() = user_id);
create policy tasks_update on public.tasks
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy notes_select on public.notes
  for select using (auth.uid() = user_id);
create policy notes_insert on public.notes
  for insert with check (auth.uid() = user_id);
create policy notes_update on public.notes
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy reminders_owner on public.reminders
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy voice_sessions_owner on public.voice_sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Auto-provision profiles on signup
-- ---------------------------------------------------------------------------

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email);
  return new;
end;
$$;

create trigger trg_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- updated_at bookkeeping
-- ---------------------------------------------------------------------------

create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_courses_set_updated_at
before update on public.courses
for each row execute function public.set_updated_at();

create trigger trg_deadlines_set_updated_at
before update on public.deadlines
for each row execute function public.set_updated_at();

create trigger trg_tasks_set_updated_at
before update on public.tasks
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Transition-guard triggers (NC-DATA-003, AC-1)
-- Fire on both INSERT (initial-state check) and UPDATE (forbidden-transition
-- check), so a row can never be created directly into a non-initial state and
-- can never hop to a state outside the declared state machine.
-- ---------------------------------------------------------------------------

create function public.guard_deadline_status()
returns trigger
language plpgsql
as $$
begin
  if TG_OP = 'INSERT' then
    if NEW.status is distinct from 'Not Started' then
      raise exception 'deadlines.status must be Not Started on insert, got %', NEW.status;
    end if;
    return NEW;
  end if;

  if NEW.status is distinct from OLD.status then
    if (OLD.status, NEW.status) not in (
      ('Not Started', 'In Progress'),
      ('In Progress', 'Submitted'),
      ('Not Started', 'Overdue'),
      ('In Progress', 'Overdue'),
      ('Overdue', 'Submitted'),
      ('Submitted', 'Completed'),
      ('Not Started', 'Cancelled'),
      ('In Progress', 'Cancelled')
    ) then
      raise exception 'Forbidden deadline_status transition: % -> %', OLD.status, NEW.status;
    end if;
  end if;
  return NEW;
end;
$$;

create trigger trg_guard_deadline_status
before insert or update of status on public.deadlines
for each row execute function public.guard_deadline_status();

create function public.guard_task_status()
returns trigger
language plpgsql
as $$
begin
  if TG_OP = 'INSERT' then
    if NEW.status is distinct from 'Open' then
      raise exception 'tasks.status must be Open on insert, got %', NEW.status;
    end if;
    return NEW;
  end if;

  if NEW.status is distinct from OLD.status then
    if (OLD.status, NEW.status) not in (
      ('Open', 'Done'),
      ('Open', 'Cancelled')
    ) then
      raise exception 'Forbidden task_status transition: % -> %', OLD.status, NEW.status;
    end if;
  end if;
  return NEW;
end;
$$;

create trigger trg_guard_task_status
before insert or update of status on public.tasks
for each row execute function public.guard_task_status();

create function public.guard_reminder_status()
returns trigger
language plpgsql
as $$
begin
  if TG_OP = 'INSERT' then
    if NEW.acknowledgment_state is distinct from 'Scheduled' then
      raise exception 'reminders.acknowledgment_state must be Scheduled on insert, got %', NEW.acknowledgment_state;
    end if;
    return NEW;
  end if;

  if NEW.acknowledgment_state is distinct from OLD.acknowledgment_state then
    if (OLD.acknowledgment_state, NEW.acknowledgment_state) not in (
      ('Scheduled', 'Delivered'),
      ('Delivered', 'Acknowledged'),
      ('Delivered', 'Dismissed'),
      ('Delivered', 'Snoozed'),
      ('Snoozed', 'Delivered'),
      ('Delivered', 'Expired'),
      ('Scheduled', 'Dismissed'),
      ('Snoozed', 'Dismissed')
    ) then
      raise exception 'Forbidden reminder_status transition: % -> %', OLD.acknowledgment_state, NEW.acknowledgment_state;
    end if;
  end if;
  return NEW;
end;
$$;

create trigger trg_guard_reminder_status
before insert or update of acknowledgment_state on public.reminders
for each row execute function public.guard_reminder_status();

-- reminders.target_id is a polymorphic reference with no real FK (it can
-- point at either deadlines or tasks). Without this check, RLS on reminders
-- alone lets a user create a reminder they own that targets another user's
-- deadline/task, which the AC-7 soft-delete-dismiss trigger (SECURITY
-- DEFINER, matches on target_type/target_id only) would then act on across
-- users. This closes that hole at write time.
create function public.guard_reminder_target_ownership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.target_type = 'deadline' then
    if not exists (
      select 1 from public.deadlines where id = NEW.target_id and user_id = NEW.user_id
    ) then
      raise exception 'reminders.target_id must reference a deadline owned by reminders.user_id';
    end if;
  elsif NEW.target_type = 'task' then
    if not exists (
      select 1 from public.tasks where id = NEW.target_id and user_id = NEW.user_id
    ) then
      raise exception 'reminders.target_id must reference a task owned by reminders.user_id';
    end if;
  end if;
  return NEW;
end;
$$;

create trigger trg_guard_reminder_target_ownership
before insert or update of target_type, target_id, user_id on public.reminders
for each row execute function public.guard_reminder_target_ownership();

create function public.guard_voice_session_state()
returns trigger
language plpgsql
as $$
begin
  if TG_OP = 'INSERT' then
    if NEW.state is distinct from 'Idle' then
      raise exception 'voice_sessions.state must be Idle on insert, got %', NEW.state;
    end if;
    return NEW;
  end if;

  if NEW.state is distinct from OLD.state then
    if (OLD.state, NEW.state) not in (
      ('Idle', 'Listening'),
      ('Listening', 'Transcribing'),
      ('Transcribing', 'IntentResolved'),
      ('Transcribing', 'IntentAmbiguous'),
      ('IntentAmbiguous', 'Responding'),
      ('IntentResolved', 'Executing'),
      ('IntentResolved', 'AwaitingConfirmation'),
      ('AwaitingConfirmation', 'Executing'),
      ('AwaitingConfirmation', 'Responding'),
      ('Executing', 'Responding'),
      ('Responding', 'Idle')
    ) then
      raise exception 'Forbidden voice_session_state transition: % -> %', OLD.state, NEW.state;
    end if;

    -- NC-VOICE-005: a mutation MUST NOT execute past its confirmation
    -- window, however the confirm request arrives. Every other transition
    -- already gets trigger-level enforcement; this is the one that guards
    -- an actual mutation, so it gets the same treatment rather than being
    -- left to application code alone.
    if OLD.state = 'AwaitingConfirmation' and NEW.state = 'Executing' then
      if OLD.expires_at is null or now() > OLD.expires_at then
        raise exception 'voice_sessions confirmation window has expired, cannot transition to Executing';
      end if;
    end if;
  end if;
  return NEW;
end;
$$;

create trigger trg_guard_voice_session_state
before insert or update of state on public.voice_sessions
for each row execute function public.guard_voice_session_state();

-- ---------------------------------------------------------------------------
-- Reminder lifecycle: dismiss on target soft-delete (AC-7)
-- ---------------------------------------------------------------------------

create function public.dismiss_reminders_for_soft_deleted_target()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_type text;
begin
  v_target_type := case TG_TABLE_NAME
    when 'deadlines' then 'deadline'
    when 'tasks' then 'task'
  end;

  update public.reminders
  set acknowledgment_state = 'Dismissed'
  where target_type = v_target_type
    and target_id = NEW.id
    and acknowledgment_state in ('Scheduled', 'Snoozed');

  return NEW;
end;
$$;

create trigger trg_deadlines_soft_delete_dismiss_reminders
after update of deleted_at on public.deadlines
for each row
when (OLD.deleted_at is null and NEW.deleted_at is not null)
execute function public.dismiss_reminders_for_soft_deleted_target();

create trigger trg_tasks_soft_delete_dismiss_reminders
after update of deleted_at on public.tasks
for each row
when (OLD.deleted_at is null and NEW.deleted_at is not null)
execute function public.dismiss_reminders_for_soft_deleted_target();

-- ---------------------------------------------------------------------------
-- Active views: uniform "exclude soft-deleted by default" read path (AC-6,
-- NC-DATA-007). security_invoker keeps these subject to the underlying
-- tables' RLS policies rather than the view owner's privileges.
-- ---------------------------------------------------------------------------

create view public.active_courses with (security_invoker = on) as
  select * from public.courses where deleted_at is null;

create view public.active_deadlines with (security_invoker = on) as
  select * from public.deadlines where deleted_at is null;

create view public.active_tasks with (security_invoker = on) as
  select * from public.tasks where deleted_at is null;

create view public.active_notes with (security_invoker = on) as
  select * from public.notes where deleted_at is null;

-- These are simple single-relation views, so Postgres's auto-updatable-view
-- rules make them writable by default (RLS backstops this correctly today,
-- but that's incidental — the intent is a read path, so make it explicit
-- rather than doubling the writable PostgREST surface for the same data).
revoke insert, update, delete on public.active_courses from anon, authenticated;
revoke insert, update, delete on public.active_deadlines from anon, authenticated;
revoke insert, update, delete on public.active_tasks from anon, authenticated;
revoke insert, update, delete on public.active_notes from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Reminder dispatch query (AC-3, AC-8, NC-DATA-008)
-- Defines what the dispatch query selects/updates; how it is scheduled
-- (pg_cron) is Item 4 / SPEC-INFRA-002 scope.
-- ---------------------------------------------------------------------------

-- Returns the rows it touched (via RETURNING) rather than void, so the Item 4
-- dispatch caller can act on exactly what this invocation changed instead of
-- racing a follow-up "select recently delivered" query against concurrent runs.
create function public.dispatch_due_reminders()
returns setof public.reminders
language plpgsql
security definer
set search_path = public
as $$
begin
  -- AC-3: Scheduled/Snoozed reminders whose time has come are delivered,
  -- unless their target — or, for a deadline, its governing Course — was
  -- soft-deleted. NC-DATA-008 backstop for AC-7 and for SPEC-CORE-005's
  -- Course-soft-delete cascade (AC-012), in case that cascade is ever
  -- applied partially.
  return query
  update public.reminders r
  set acknowledgment_state = 'Delivered', delivered_at = now()
  where (
    (r.acknowledgment_state = 'Scheduled' and r.trigger_at <= now())
    or (r.acknowledgment_state = 'Snoozed' and r.snooze_until <= now())
  )
  and not exists (
    select 1 from public.deadlines d
    where r.target_type = 'deadline' and d.id = r.target_id
      and (
        d.deleted_at is not null
        or exists (select 1 from public.courses c where c.id = d.course_id and c.deleted_at is not null)
      )
  )
  and not exists (
    select 1 from public.tasks t
    where r.target_type = 'task' and t.id = r.target_id and t.deleted_at is not null
  )
  returning r.*;

  -- AC-8: Delivered reminders with no response in 60 minutes expire.
  return query
  update public.reminders
  set acknowledgment_state = 'Expired'
  where acknowledgment_state = 'Delivered'
    and delivered_at < now() - interval '60 minutes'
  returning *;
end;
$$;

-- ---------------------------------------------------------------------------
-- SECURITY DEFINER lockdown
-- Postgres grants EXECUTE on new functions to PUBLIC by default. Every
-- SECURITY DEFINER function here runs as the (privileged) function owner and
-- bypasses RLS, so that default must be revoked explicitly:
--  - dispatch_due_reminders is a plain function (returns void, not trigger),
--    so PostgREST exposes it as an RPC callable by any authenticated/anon
--    user unless revoked — that would let anyone force-deliver or
--    force-expire every user's reminders, bypassing reminders' RLS policy
--    entirely for this operation.
--  - handle_new_user / dismiss_reminders_for_soft_deleted_target are trigger
--    functions Postgres won't invoke via direct RPC, so this is defense in
--    depth against a future refactor accidentally making them callable.
-- Only the service role (used by the Item 4 dispatch Edge Function per
-- SPEC-INFRA-002 NC-INF-005) may invoke dispatch_due_reminders.
-- ---------------------------------------------------------------------------

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.dismiss_reminders_for_soft_deleted_target() from public, anon, authenticated;
revoke execute on function public.dispatch_due_reminders() from public, anon, authenticated;
grant execute on function public.dispatch_due_reminders() to service_role;
