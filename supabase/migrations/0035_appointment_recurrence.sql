-- Adds Course-style recurrence to appointments: a list of meeting blocks
-- (days of week + a start/end time window each) plus an optional date range
-- the recurrence is active for. Mirrors 0014_course_recurrence.sql's
-- meeting_blocks/recurrence_start_date/recurrence_end_date columns exactly
-- (same shape, same constraint names pattern) so the existing recurrence
-- utilities (src/lib/calendar/recurrence.ts) work unchanged on appointments.
--
-- Unlike courses, appointments keep their existing date/time/duration_minutes
-- columns untouched (still NOT NULL where they already were) -- a recurring
-- appointment still stores a `date` (the client sends recurrence_start_date,
-- or today, as a stand-in) purely so existing non-recurrence-aware readers
-- of appointments.date keep working unchanged. There is no active_appointments
-- view, so no view drop/recreate is needed here (unlike 0014's active_courses).

alter table public.appointments
  add column meeting_blocks jsonb not null default '[]'::jsonb,
  add column recurrence_start_date date,
  add column recurrence_end_date date,
  add constraint appointments_recurrence_dates_check
    check (recurrence_start_date is null or recurrence_end_date is null or recurrence_start_date <= recurrence_end_date),
  add constraint appointments_meeting_blocks_is_array
    check (jsonb_typeof(meeting_blocks) = 'array');
