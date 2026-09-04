-- Deadline Sessions: reuses public.appointments (Calendar) to represent
-- discrete work sessions planned against a Deadline, rather than adding a
-- fifth parallel "thing with a due date". A session is a normal appointment
-- row with deadline_id set, tagged category = 'Session', carrying its own
-- session_status lifecycle independent of appointments.deleted_at.

-- ---------------------------------------------------------------------------
-- Enum (public.-qualified, matching the newer style in 0021_item_priority.sql
-- rather than the unqualified enums in 0001_init.sql).
-- ---------------------------------------------------------------------------

create type public.session_status as enum ('planned', 'done', 'skipped');

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------

-- restrict, matching how deadlines.course_id references courses in
-- 0001_init.sql: a deadline with live sessions must not be hard-deleted out
-- from under them.
alter table public.appointments
  add column deadline_id uuid references public.deadlines(id) on delete restrict;

alter table public.appointments
  add column duration_minutes integer
  check (duration_minutes is null or duration_minutes > 0);

alter table public.appointments
  add column session_status public.session_status;

create index appointments_deadline_id_idx on public.appointments (deadline_id)
  where deadline_id is not null;

-- ---------------------------------------------------------------------------
-- guard_session_status: mirrors guard_deadline_status() in
-- 0001_init.sql:273-305. On INSERT, session_status must be null when
-- deadline_id is null, else exactly 'planned'. On UPDATE, only the three
-- forward edges below are legal -- there is no transition out of 'done'.
-- ---------------------------------------------------------------------------

create function public.guard_session_status()
returns trigger
language plpgsql
as $$
begin
  if TG_OP = 'INSERT' then
    if NEW.deadline_id is null then
      if NEW.session_status is not null then
        raise exception 'appointments.session_status must be null when deadline_id is null, got %', NEW.session_status;
      end if;
    else
      if NEW.session_status is distinct from 'planned' then
        raise exception 'appointments.session_status must be planned on insert when deadline_id is set, got %', NEW.session_status;
      end if;
    end if;
    return NEW;
  end if;

  if NEW.session_status is distinct from OLD.session_status then
    if (OLD.session_status, NEW.session_status) not in (
      ('planned', 'done'),
      ('planned', 'skipped'),
      ('skipped', 'done')
    ) then
      raise exception 'Forbidden session_status transition: % -> %', OLD.session_status, NEW.session_status;
    end if;
  end if;
  return NEW;
end;
$$;

create trigger trg_guard_session_status
before insert or update of session_status on public.appointments
for each row execute function public.guard_session_status();

-- ---------------------------------------------------------------------------
-- guard_appointment_deadline_ownership: mirrors guard_reminder_target_ownership
-- in 0001_init.sql:375-397. A bare FK only enforces referential existence,
-- not same-owner, and RLS here is row-level, not column-level -- this closes
-- that hole at write time.
-- ---------------------------------------------------------------------------

create function public.guard_appointment_deadline_ownership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.deadline_id is not null then
    if not exists (
      select 1 from public.deadlines where id = NEW.deadline_id and user_id = NEW.user_id
    ) then
      raise exception 'appointments.deadline_id must reference a deadline owned by appointments.user_id';
    end if;
  end if;
  return NEW;
end;
$$;

create trigger trg_guard_appointment_deadline_ownership
before insert or update of deadline_id, user_id on public.appointments
for each row execute function public.guard_appointment_deadline_ownership();

-- ---------------------------------------------------------------------------
-- advance_deadline_on_session_done: cross-table AFTER trigger, same shape as
-- dismiss_reminders_for_soft_deleted_target in 0001_init.sql:455-489.
-- Completing a session while its parent deadline is exactly 'Not Started'
-- auto-advances the deadline to 'In Progress' -- one step only, never further.
-- The `where status = 'Not Started'` guard makes every other current status a
-- natural no-op, no IF branch needed. ('Not Started', 'In Progress') is
-- already in guard_deadline_status's allow-list, so this cascading UPDATE
-- never conflicts with that trigger.
-- ---------------------------------------------------------------------------

create function public.advance_deadline_on_session_done()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.deadlines
  set status = 'In Progress'
  where id = NEW.deadline_id and status = 'Not Started';
  return NEW;
end;
$$;

create trigger trg_appointments_session_done_advances_deadline
after update of session_status on public.appointments
for each row
when (NEW.deadline_id is not null and NEW.session_status = 'done' and OLD.session_status is distinct from 'done')
execute function public.advance_deadline_on_session_done();

-- ---------------------------------------------------------------------------
-- soft_delete_deadline_cascade: deadlines' first-ever cascade function.
-- Follows soft_delete_task_cascade in 0002_delete_cascade.sql:75-104 plus the
-- snapshot-before-cascade idiom in 0017_fix_person_cascade_note_double_count.sql:
-- the deadline's own live-reminder count is snapshotted before the deadlines
-- UPDATE below, because trg_deadlines_soft_delete_dismiss_reminders dismisses
-- it as a side effect of that same UPDATE -- counting after would always
-- read zero.
-- ---------------------------------------------------------------------------

create function public.soft_delete_deadline_cascade(p_deadline_id uuid)
returns table (sessions_affected int, reminders_dismissed int)
language plpgsql
as $$
declare
  v_now timestamptz := now();
  v_session_ids uuid[];
  v_sessions_affected int := 0;
  v_reminders_dismissed int := 0;
begin
  select count(*) into v_reminders_dismissed
  from public.reminders
  where target_type = 'deadline'
    and target_id = p_deadline_id
    and acknowledgment_state in ('Scheduled', 'Snoozed');

  update public.deadlines
  set deleted_at = v_now
  where id = p_deadline_id and deleted_at is null;

  if not found then
    return query select 0, 0;
    return;
  end if;

  select array_agg(id) into v_session_ids
  from public.appointments
  where deadline_id = p_deadline_id and deleted_at is null;

  if v_session_ids is not null then
    update public.appointments
    set deleted_at = v_now
    where id = any(v_session_ids);

    v_sessions_affected := array_length(v_session_ids, 1);
  end if;

  return query select v_sessions_affected, v_reminders_dismissed;
end;
$$;

revoke execute on function public.soft_delete_deadline_cascade(uuid) from public, anon;
grant execute on function public.soft_delete_deadline_cascade(uuid) to authenticated;
