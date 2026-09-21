-- Reminder lead times can now be entered as minutes/hours/days in the UI, so
-- the old 1-day (1440 minute) ceiling is raised to 30 days (43200 minutes).
-- Courses/tasks/appointments never had a DB-level cap (only the API schema),
-- so only the two tables that hard-coded 1440 need their CHECKs replaced.
--
-- The auto-generated constraint names differ between the column-level checks
-- here, so drop by definition (anything mentioning 1440 on these two tables)
-- rather than by guessed name.
do $$
declare
  c record;
begin
  for c in
    select conrelid::regclass as tbl, conname
    from pg_constraint
    where contype = 'c'
      and conrelid in ('public.user_preferences'::regclass, 'public.personalization_suggestions'::regclass)
      and pg_get_constraintdef(oid) like '%1440%'
  loop
    execute format('alter table %s drop constraint %I', c.tbl, c.conname);
  end loop;
end $$;

alter table public.user_preferences
  add constraint user_preferences_default_reminder_lead_minutes_check
  check (default_reminder_lead_minutes between 0 and 43200);

alter table public.personalization_suggestions
  add constraint personalization_suggestions_from_value_check
  check (from_value between 0 and 43200);

alter table public.personalization_suggestions
  add constraint personalization_suggestions_to_value_check
  check (to_value between 0 and 43200 and to_value <> from_value);
