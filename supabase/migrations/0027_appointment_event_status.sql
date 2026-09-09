-- Event status lifecycle for general Events/Appointments (category
-- Health/Academic/Personal/Career/Other -- anything with deadline_id null).
-- Mirrors session_status (0025_deadline_sessions.sql) but for the opposite
-- branch of appointments: a Deadline Session gets session_status and never
-- event_status; a general Event gets event_status and never session_status.
-- Lets a general Event be marked Done/Missed and drop out of the dashboard's
-- Up Next queue, the same way a done/skipped Session already does.

create type public.event_status as enum ('planned', 'done', 'missed');

alter table public.appointments
  add column event_status public.event_status;

-- Backfill BEFORE the guard trigger exists below: every pre-existing
-- non-Session row (deadline_id is null) predates this column and must land
-- on 'planned'. Done as a plain bulk UPDATE here rather than through the
-- trigger's UPDATE branch, which only allows planned/done/missed edges
-- amongst themselves -- not from NULL.
update public.appointments
set event_status = 'planned'
where deadline_id is null;

-- ---------------------------------------------------------------------------
-- guard_event_status: structural mirror of guard_session_status() in
-- 0025_deadline_sessions.sql:41-70, with the mutual-exclusion direction
-- flipped -- event_status is for the deadline_id IS NULL branch of
-- appointments, session_status is for the deadline_id IS NOT NULL branch.
-- ---------------------------------------------------------------------------

create function public.guard_event_status()
returns trigger
language plpgsql
as $$
begin
  if TG_OP = 'INSERT' then
    if NEW.deadline_id is not null then
      if NEW.event_status is not null then
        raise exception 'appointments.event_status must be null when deadline_id is set, got %', NEW.event_status;
      end if;
    else
      if NEW.event_status is distinct from 'planned' then
        raise exception 'appointments.event_status must be planned on insert when deadline_id is null, got %', NEW.event_status;
      end if;
    end if;
    return NEW;
  end if;

  if NEW.event_status is distinct from OLD.event_status then
    if (OLD.event_status, NEW.event_status) not in (
      ('planned', 'done'),
      ('planned', 'missed'),
      ('missed', 'done')
    ) then
      raise exception 'Forbidden event_status transition: % -> %', OLD.event_status, NEW.event_status;
    end if;
  end if;
  return NEW;
end;
$$;

create trigger trg_guard_event_status
before insert or update of event_status on public.appointments
for each row execute function public.guard_event_status();
