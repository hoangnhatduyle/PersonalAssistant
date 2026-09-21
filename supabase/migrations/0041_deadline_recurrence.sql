-- Recurring deadlines: a deadline may carry a weekly repeat rule (days of
-- week). Every occurrence is its own deadline row with its own status,
-- completed_at, reminder and sessions -- there is no calendar projection like
-- appointments' meeting_blocks (0035). How the next occurrence gets created
-- (on complete/cancel/coming due) and series-wide cancel are in
-- 0042_deadline_series.sql.
--
-- recurrence_days: 0=Sunday..6=Saturday (matches Date#getDay and
-- DayOfWeekToggle). Empty array = not recurring. The time of day is taken
-- from the row's own due_at, so no time columns are needed.
-- recurrence_end_date: last calendar day (user's timezone) an occurrence may
-- fall on; NULL = open-ended.

alter table public.deadlines
  add column recurrence_days smallint[] not null default '{}',
  add column recurrence_end_date date,
  add constraint deadlines_recurrence_days_valid
    check (recurrence_days <@ array[0,1,2,3,4,5,6]::smallint[]);

-- active_deadlines is a `select *` view whose column list is frozen at
-- CREATE VIEW time -- ADD COLUMN doesn't propagate into it (same fix as
-- 0021_item_priority.sql / 0034_item_acknowledged_at.sql / 0036).
drop view public.active_deadlines;
create view public.active_deadlines with (security_invoker = on) as
  select * from public.deadlines where deleted_at is null;
revoke insert, update, delete on public.active_deadlines from anon, authenticated;
