-- Kept present (rather than deleted) because supabase/config.toml's
-- [db.seed].sql_paths points at this file and `supabase db reset` expects it
-- to exist.
--
-- Previously seeded two Vault secrets for a pg_cron -> pg_net -> Edge
-- Function dispatch path; that design was rejected during Item 4's
-- architect-review round in favor of a direct in-process RPC call (see
-- supabase/migrations/0003_pg_cron_reminders.sql), which needs no secrets at
-- all.

-- Demo data for the "At Risk" dashboard card, scoped to the local
-- dev-preview account (DEV_PREVIEW_USER_EMAIL). No-ops entirely if that
-- account doesn't exist (e.g. right after a fresh `supabase db reset`,
-- before anyone has signed in locally to recreate it) -- looked up by email
-- rather than a hardcoded id so it stays correct if the account is ever
-- recreated with a different id. Idempotent: safe to run again, matches on
-- title so it won't duplicate rows it already inserted. due_at/updated_at
-- are relative to now() so the rows stay "stale" indefinitely rather than
-- being pinned to whatever date this was written on.

insert into public.courses (user_id, code, name)
select p.id, 'DEMO', 'Stale Demo'
from public.profiles p
where p.email = 'dev-preview@example.com'
  and not exists (
    select 1 from public.courses c where c.user_id = p.id and c.name = 'Stale Demo'
  );

insert into public.deadlines (user_id, course_id, title, due_at, status, updated_at)
select p.id, c.id, v.title, now() + v.due_offset, 'Not Started', now() + v.updated_offset
from public.profiles p
join public.courses c on c.user_id = p.id and c.name = 'Stale Demo'
cross join (values
  ('Loan Research', interval '2 days', interval '-3 days'),
  ('Finish planning Blink', interval '1 days', interval '-1 days'),
  ('Read ahead Stochastic Localization', interval '10 days', interval '-6 days'),
  ('Submit grant proposal', interval '-5 days', interval '-8 days'),
  ('Draft literature review', interval '18 days', interval '-11 days'),
  ('Renew lab safety certification', interval '20 days', interval '-12 days')
) as v(title, due_offset, updated_offset)
where p.email = 'dev-preview@example.com'
  and not exists (
    select 1 from public.deadlines d where d.user_id = p.id and d.title = v.title
  );

insert into public.tasks (user_id, title, due_at, status, updated_at)
select p.id, v.title, now() + v.due_offset, 'Open', now() + v.updated_offset
from public.profiles p
cross join (values
  ('Clean up dataset', interval '3 days', interval '-2 days'),
  ('Email advisor about extension', interval '6 days', interval '-6 days'),
  ('Reconcile budget spreadsheet', interval '-2 days', interval '-3 days'),
  ('Archive old course notes', interval '14 days', interval '-5 days')
) as v(title, due_offset, updated_offset)
where p.email = 'dev-preview@example.com'
  and not exists (
    select 1 from public.tasks t where t.user_id = p.id and t.title = v.title
  );
