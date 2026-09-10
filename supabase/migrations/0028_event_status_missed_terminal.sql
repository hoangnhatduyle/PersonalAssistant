-- Makes 'missed' a terminal event_status, same as 'done': a user who
-- mis-clicks "Mark Missed" has no in-place "Mark Done" undo on that row
-- (they'd re-add the appointment instead). Removes the ('missed', 'done')
-- edge guard_event_status() allowed in 0027_appointment_event_status.sql.

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
      ('planned', 'missed')
    ) then
      raise exception 'Forbidden event_status transition: % -> %', OLD.event_status, NEW.event_status;
    end if;
  end if;
  return NEW;
end;
$$;
