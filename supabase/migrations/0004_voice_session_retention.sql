-- SPEC-DATA-007 AC-9/NC-DATA-009: a 24-hour hard-delete retention sweep for
-- voice_sessions -- transcript, resolved_intent, confidence_score, and
-- pending_mutation are the one PII-accumulation path in the schema with no
-- other bound (Courses/Deadlines/Tasks/Notes are soft-deleted and kept
-- indefinitely; this table is deliberately the opposite: no soft-delete, no
-- view/browse retention, per the recorded 24-hour retention decision).
--
-- Measured from ended_at, or from started_at for a session that never
-- reaches a terminal state (e.g. abandoned mid-AwaitingConfirmation) --
-- SPEC-DATA-007's shared_schemas leaves ended_at nullable exactly for that
-- case, so this sweep must not skip rows that never got one.
--
-- Scheduled directly and synchronously, in-process, from pg_cron's own
-- command -- Item 4's own architect-review round (see
-- supabase/migrations/0003_pg_cron_reminders.sql) already established, and
-- proved empirically, that a pg_net/Edge-Function hop makes
-- cron.job_run_details lie about failures (net.http_post() enqueues and
-- returns immediately, so the tick reports "succeeded" even when the
-- downstream call fails). Not repeating that path here.
-- Backs the sweep's own predicate below (coalesce(ended_at, started_at) is
-- exactly "the instant retention is measured from"): without this, every
-- 15-minute run is a full Seq Scan + delete of the whole table instead of
-- touching only the rows actually past the 24h boundary. Mirrors the
-- existing partial-index pattern on deadlines_deleted_at_idx (this file's
-- neighbor, 0001_init.sql) rather than a full-column index.
create index voice_sessions_retention_idx on public.voice_sessions (coalesce(ended_at, started_at));

create function public.delete_expired_voice_sessions()
returns setof public.voice_sessions
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  delete from public.voice_sessions
  where (ended_at is not null and ended_at < now() - interval '24 hours')
     or (ended_at is null and started_at < now() - interval '24 hours')
  returning *;
end;
$$;

-- SECURITY DEFINER lockdown, same shape as dispatch_due_reminders() in
-- supabase/migrations/0001_init.sql: revoke the PUBLIC-by-default EXECUTE
-- grant so this isn't exposed as a PostgREST RPC callable by any
-- authenticated/anon user (which would let anyone hard-delete every user's
-- voice_sessions on demand). Only the service role and the migration-owning
-- role (which calls it in-process below, via cron.schedule) may invoke it.
revoke execute on function public.delete_expired_voice_sessions() from public, anon, authenticated;
grant execute on function public.delete_expired_voice_sessions() to service_role;

select cron.schedule(
  'voice-session-retention-sweep',
  '*/15 * * * *', -- every 15 minutes; a 24h TTL doesn't need per-minute precision
  $cron$select public.delete_expired_voice_sessions();$cron$
);
