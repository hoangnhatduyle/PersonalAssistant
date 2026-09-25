-- Email-triage dashboard: per-user, per-provider rate limit on calls that
-- reach Google's/Microsoft's own token or mail-list endpoints (GET
-- /api/mail/messages's access-token refresh + message list, and the OAuth
-- callback routes' authorization-code exchange). Security-review finding:
-- these were unbounded — abuse here risks the app's own OAuth client being
-- rate-limited or flagged by the provider, not just added cost.
--
-- Mirrors 0011_voice_speak_rate_limit.sql's self-referential design exactly
-- (same rationale: a route with no natural byproduct row to count needs a
-- table the rate-limit check itself writes to, or the limit is decoupled
-- from calls to the route it's meant to protect) — provider added since
-- Gmail and Outlook are independent external APIs with independent quotas,
-- rate-limited separately per provider.

create table public.mail_api_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null check (provider in ('google', 'microsoft')),
  created_at timestamptz not null default now()
);

-- Backs both the rate-limit window query (user_id, provider, created_at >=
-- window start) and the retention sweep below.
create index mail_api_requests_user_id_provider_created_at_idx
  on public.mail_api_requests (user_id, provider, created_at);

alter table public.mail_api_requests enable row level security;

-- select/insert only, same shape as voice_speak_requests -- a caller only
-- ever needs to read/append its own rate-limit rows.
create policy mail_api_requests_select on public.mail_api_requests
  for select using ((select auth.uid()) = user_id);
create policy mail_api_requests_insert on public.mail_api_requests
  for insert with check ((select auth.uid()) = user_id);
revoke update, delete on public.mail_api_requests from anon, authenticated;

-- Retention sweep: the rate-limit window is only MAIL_RATE_LIMIT_WINDOW_MINUTES
-- (10) minutes, so nothing here is ever read past that -- a generous 1-day
-- TTL just bounds unconstrained growth (mirrors
-- delete_expired_voice_speak_requests(); pg_cron extension already created
-- in 0004_voice_session_retention.sql, not recreated here).
create function public.delete_expired_mail_api_requests()
returns setof public.mail_api_requests
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  delete from public.mail_api_requests
  where created_at < now() - interval '1 day'
  returning *;
end;
$$;

revoke execute on function public.delete_expired_mail_api_requests() from public, anon, authenticated;
grant execute on function public.delete_expired_mail_api_requests() to service_role;

select cron.schedule(
  'mail-api-requests-retention-sweep',
  '*/15 * * * *',
  $cron$select public.delete_expired_mail_api_requests();$cron$
);
