-- Email triage: stored classification results + a per-user run rate limit.
--
-- mail_triage_items persists ONLY display fields (subject, sender, received
-- time, provider web link), the bucket + one-line reason, and an optional
-- suggested next step. Never the email snippet or body: bodies are fetched
-- fresh from the provider for stage 2 of a run and discarded. Rows expire
-- 14 days after triage (reads also filter on expires_at, so expiry is exact
-- even between retention sweeps).

-- Lets mail_triage_items reference an account together with its owner, so a
-- row can never point at another user's mailbox (RLS alone only checks
-- user_id on the row being written; same composite-FK pattern as 0007/0051).
alter table public.mail_accounts
  add constraint mail_accounts_id_user_id_key unique (id, user_id);

create table public.mail_triage_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  mail_account_id uuid not null,
  provider text not null check (provider in ('google', 'microsoft')),
  provider_message_id text not null,
  subject text not null,
  sender text not null,
  received_at timestamptz not null,
  web_link text,
  bucket text not null check (bucket in ('important', 'needs_action', 'fyi', 'ignore')),
  reason text not null,
  -- { kind: 'task'|'deadline'|'event'|'reminder', title, due_at?, date?, time?,
  --   duration_minutes?, course_id? } -- validated in src/lib/email-triage.
  suggested_action jsonb,
  stage2_at timestamptz,
  status text not null default 'open' check (status in ('open', 'dismissed', 'acted')),
  resolved_at timestamptz,
  triaged_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '14 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (mail_account_id, provider_message_id),
  -- Disconnecting a mailbox deletes its triage rows.
  foreign key (mail_account_id, user_id)
    references public.mail_accounts (id, user_id) on delete cascade
);

create index mail_triage_items_user_status_expires_idx
  on public.mail_triage_items (user_id, status, expires_at);

create trigger trg_mail_triage_items_updated_at
before update on public.mail_triage_items
for each row execute function public.set_updated_at();

alter table public.mail_triage_items enable row level security;

create policy mail_triage_items_select on public.mail_triage_items
  for select using ((select auth.uid()) = user_id);
create policy mail_triage_items_insert on public.mail_triage_items
  for insert with check ((select auth.uid()) = user_id);
create policy mail_triage_items_update on public.mail_triage_items
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
-- No delete policy: rows leave via the expiry sweep below or the
-- mail_accounts cascade.

create function public.delete_expired_mail_triage_items()
returns setof public.mail_triage_items
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  delete from public.mail_triage_items
  where expires_at < now()
  returning *;
end;
$$;

revoke execute on function public.delete_expired_mail_triage_items() from public, anon, authenticated;
grant execute on function public.delete_expired_mail_triage_items() to service_role;

select cron.schedule(
  'mail-triage-items-retention-sweep',
  '0 * * * *',
  $cron$select public.delete_expired_mail_triage_items();$cron$
);

-- Self-referential rate-limit table (same design as 0011/0048): the check
-- itself writes the row it counts, so a triage run costs one row.
create table public.mail_triage_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null check (provider in ('google', 'microsoft')),
  created_at timestamptz not null default now()
);

create index mail_triage_runs_user_id_created_at_idx
  on public.mail_triage_runs (user_id, created_at);

alter table public.mail_triage_runs enable row level security;

create policy mail_triage_runs_select on public.mail_triage_runs
  for select using ((select auth.uid()) = user_id);
create policy mail_triage_runs_insert on public.mail_triage_runs
  for insert with check ((select auth.uid()) = user_id);
revoke update, delete on public.mail_triage_runs from anon, authenticated;

create function public.delete_expired_mail_triage_runs()
returns setof public.mail_triage_runs
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  delete from public.mail_triage_runs
  where created_at < now() - interval '1 day'
  returning *;
end;
$$;

revoke execute on function public.delete_expired_mail_triage_runs() from public, anon, authenticated;
grant execute on function public.delete_expired_mail_triage_runs() to service_role;

select cron.schedule(
  'mail-triage-runs-retention-sweep',
  '*/15 * * * *',
  $cron$select public.delete_expired_mail_triage_runs();$cron$
);
