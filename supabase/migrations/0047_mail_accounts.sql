-- Email-triage dashboard Phase 1: mail_accounts stores one connected Gmail
-- or Microsoft (personal Outlook.com, reached via a UC mailbox forwarding
-- rule — see project memory) OAuth account per user per provider. The
-- refresh token is application-layer AES-256-GCM encrypted before it ever
-- reaches Postgres (src/lib/crypto/token-encryption.ts) — a mailbox refresh
-- token is a higher-value secret than this app's other user data, so unlike
-- every other table here it isn't stored in plaintext behind RLS alone.

create table public.mail_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null check (provider in ('google', 'microsoft')),
  provider_email text not null,
  refresh_token_ciphertext text not null,
  refresh_token_iv text not null,
  refresh_token_auth_tag text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);

-- unique(user_id, provider) above already creates a covering btree index.

create trigger trg_mail_accounts_updated_at
before update on public.mail_accounts
for each row execute function public.set_updated_at();

alter table public.mail_accounts enable row level security;

create policy mail_accounts_select on public.mail_accounts
  for select using ((select auth.uid()) = user_id);
create policy mail_accounts_insert on public.mail_accounts
  for insert with check ((select auth.uid()) = user_id);
create policy mail_accounts_update on public.mail_accounts
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
-- Unlike user_preferences' no-delete precedent, a delete policy is included
-- here: the user must be able to disconnect a mailbox on demand, not only
-- have the row cascade-deleted with their profile.
create policy mail_accounts_delete on public.mail_accounts
  for delete using ((select auth.uid()) = user_id);
