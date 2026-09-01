-- Replaces free-text courses.meeting_pattern (parsed by a best-effort regex
-- grammar that silently dropped courses onto a "couldn't place on the grid"
-- badge whenever the text deviated from the supported grammar, e.g. an en
-- dash instead of a hyphen) with structured recurrence data: a list of
-- meeting blocks (days of week + a start/end time window each) plus an
-- optional date range the recurrence is active for. Timezone is deliberately
-- NOT stored here -- it's read from the existing user_preferences.timezone
-- (see 0010_user_preferences.sql) at render time instead.
--
-- meeting_pattern is dropped outright rather than migrated: this is a
-- single-user dev app with one affected row (the course whose free-text
-- pattern prompted this change), and the confirmed plan is to re-enter it
-- manually through the new structured picker rather than write throwaway
-- migration-time parsing code for one row.

-- public.active_courses (0001_init.sql) resolves `select *` into a fixed
-- column list at creation time, so it holds a real dependency on
-- meeting_pattern -- Postgres refuses to drop a column a view depends on.
-- Drop and recreate the view around the ALTER, restoring the exact
-- security_invoker + revoke posture 0001_init.sql set up.
drop view public.active_courses;

alter table public.courses
  drop column meeting_pattern,
  add column meeting_blocks jsonb not null default '[]'::jsonb,
  add column recurrence_start_date date,
  add column recurrence_end_date date,
  add constraint courses_recurrence_dates_check
    check (recurrence_start_date is null or recurrence_end_date is null or recurrence_start_date <= recurrence_end_date),
  add constraint courses_meeting_blocks_is_array
    check (jsonb_typeof(meeting_blocks) = 'array');

create view public.active_courses with (security_invoker = on) as
  select * from public.courses where deleted_at is null;

revoke insert, update, delete on public.active_courses from anon, authenticated;
