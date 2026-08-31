-- SPEC-API-010 NC-API-SPEAK-003: a real per-call counter for POST
-- /api/voice/speak. Security/architect-review finding: this route has no
-- natural byproduct row the way POST /api/knowledge's checkCreateRateLimit
-- counts knowledge_sources (a row that route itself inserts) -- counting
-- voice_sessions instead (a table this route never writes to) left the
-- limit entirely decoupled from calls to this route, an unbounded-cost
-- exposure on a route that fans out to a paid ElevenLabs/OpenAI call per
-- request. This table restores the self-referential property: the rate
-- limit check in src/lib/voice/rate-limit.ts inserts a row here itself.
create table public.voice_speak_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Backs both the rate-limit window query (user_id, created_at >= window
-- start) and the retention sweep below.
create index voice_speak_requests_user_id_created_at_idx
  on public.voice_speak_requests (user_id, created_at);

alter table public.voice_speak_requests enable row level security;

-- select/insert only -- a caller only ever needs to read/append its own
-- rate-limit rows, never update or delete one (mirrors knowledge_sources'
-- select/insert/delete-only shape in 0007_knowledge_base.sql, minus delete,
-- since there's no user-facing reason to ever remove one of these early).
create policy voice_speak_requests_select on public.voice_speak_requests
  for select using (auth.uid() = user_id);
create policy voice_speak_requests_insert on public.voice_speak_requests
  for insert with check (auth.uid() = user_id);
revoke update, delete on public.voice_speak_requests from anon, authenticated;

-- Retention sweep: the rate-limit window itself is only
-- SPEAK_RATE_LIMIT_WINDOW_MINUTES (10) minutes, so nothing here is ever
-- read past that -- a generous 1-day TTL just bounds unconstrained growth,
-- mirroring 0004_voice_session_retention.sql's in-process pg_cron pattern
-- (pg_cron extension already created there; not recreated here).
create function public.delete_expired_voice_speak_requests()
returns setof public.voice_speak_requests
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  delete from public.voice_speak_requests
  where created_at < now() - interval '1 day'
  returning *;
end;
$$;

revoke execute on function public.delete_expired_voice_speak_requests() from public, anon, authenticated;
grant execute on function public.delete_expired_voice_speak_requests() to service_role;

select cron.schedule(
  'voice-speak-requests-retention-sweep',
  '*/15 * * * *',
  $cron$select public.delete_expired_voice_speak_requests();$cron$
);
