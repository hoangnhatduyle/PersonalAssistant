-- SPEC-INFRA-004: pg_cron reminder-dispatch scheduling. Defines *how* the
-- dispatch_due_reminders() RPC (SPEC-DATA-006, supabase/migrations/0001_init.sql)
-- gets invoked on a schedule -- the RPC's own dispatch-query internals belong
-- to that migration, not this one.
--
-- Calls the RPC directly and synchronously, in-process, from within the cron
-- job's own scheduled command -- not via an HTTP hop through a Supabase Edge
-- Function. An HTTP+pg_net+Vault path was built and rejected during this
-- item's architect-review round: net.http_post() enqueues a request and
-- returns immediately, so cron.job_run_details.status would read
-- "succeeded" for the enqueue step regardless of what the downstream call
-- actually did -- a literal Failed->Succeeded violation of this spec's own
-- forbidden transition, and a false-green on NC-INF-003. Calling the RPC
-- in-process instead means pg_cron's own job_run_details.status genuinely
-- reflects the dispatch outcome, with no extra machinery (no Vault secrets,
-- no service-role key at rest, no pg_net, no edge function) needed at all.
--
-- Runs as whichever role applies this migration (the "postgres" role, both
-- locally and via `supabase db push` against a hosted project), which is
-- dispatch_due_reminders()'s own owner (confirmed: `select proowner from
-- pg_proc where proname = 'dispatch_due_reminders'` -> postgres) and is
-- therefore unaffected by the REVOKE from public/anon/authenticated in
-- migration 0001 -- that REVOKE exists to keep the function off the
-- PostgREST-exposed RPC surface (NC-INF-005 predecessor concern), not to
-- gate this in-database scheduled call.
create extension if not exists pg_cron with schema extensions;

select cron.schedule(
  'dispatch-reminders-tick',
  '* * * * *', -- every minute; dispatch_due_reminders() is idempotent per row
  $cron$select public.dispatch_due_reminders();$cron$
);
