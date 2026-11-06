-- Lets a user reopen a session or event they marked by mistake (or whose
-- plans changed): sessions done/skipped -> planned, events (and recurring
-- appointment occurrences) done/missed -> planned.
--
-- Replaces three guards with their previous bodies plus the new edges only:
--   guard_session_status                     (0025_deadline_sessions.sql)
--   guard_event_status                       (0028_event_status_missed_terminal.sql)
--   guard_appointment_occurrence_status      (0049_appointment_occurrence_status.sql)
-- Triggers are unchanged -- `create or replace` swaps the function body in
-- place. A direct done <-> missed flip and missed -> done stay forbidden: the
-- user reopens first, then marks again.
--
-- Deliberately NOT reverted by a session reopen: advance_deadline_on_session_done
-- (0025) moving the parent deadline Not Started -> In Progress. Session progress
-- (done/total) is derived from session_status, so it drops on its own.

create or replace function public.guard_session_status()
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
      ('skipped', 'done'),
      ('done', 'planned'),
      ('skipped', 'planned')
    ) then
      raise exception 'Forbidden session_status transition: % -> %', OLD.session_status, NEW.session_status;
    end if;
  end if;
  return NEW;
end;
$$;

create or replace function public.guard_event_status()
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
      ('done', 'planned'),
      ('missed', 'planned')
    ) then
      raise exception 'Forbidden event_status transition: % -> %', OLD.event_status, NEW.event_status;
    end if;
  end if;
  return NEW;
end;
$$;

create or replace function public.guard_appointment_occurrence_status()
returns trigger
language plpgsql
as $$
begin
  if TG_OP = 'INSERT' then
    return NEW;
  end if;

  if NEW.status is distinct from OLD.status then
    if (OLD.status, NEW.status) not in (
      ('planned', 'done'),
      ('planned', 'missed'),
      ('done', 'planned'),
      ('missed', 'planned')
    ) then
      raise exception 'Forbidden appointment_occurrence_status transition: % -> %', OLD.status, NEW.status;
    end if;
  end if;
  return NEW;
end;
$$;
