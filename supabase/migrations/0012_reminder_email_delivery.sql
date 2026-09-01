-- Adds the two columns needed for emailing due reminders: an opt-out
-- preference (default on, per product decision) and a per-reminder
-- idempotency/audit marker for the send-reminder-emails route.
--
-- Both are purely additive -- no new RLS policy needed on either table
-- (both already have owner-scoped RLS from 0001_init.sql/0010_user_preferences.sql;
-- the send-reminder-emails route reads/writes via the service-role client,
-- which bypasses RLS entirely, same as dispatch_due_reminders()).

alter table public.user_preferences
  add column email_reminders_enabled boolean not null default true;

-- Mirrors delivered_at's shape/semantics exactly: null until this
-- reminder's email has actually been sent once. NOT set at Delivered time
-- by dispatch_due_reminders() itself -- that function has no outbound-HTTP
-- capability by design (see 0003/0004/0006/0007/0011's shared pg_net
-- rejection rationale) -- only ever set by the application-level
-- send-reminder-emails route after a successful send. `emailed_at is null`
-- is that route's idempotency predicate: a retried/overlapping invocation
-- naturally skips anything already sent, and a failed send must leave this
-- null so the next tick retries it.
alter table public.reminders
  add column emailed_at timestamptz;
