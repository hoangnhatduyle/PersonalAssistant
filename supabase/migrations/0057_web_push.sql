-- Web Push for reminders (iOS 16.4+ home-screen PWA, desktop browsers).
--
-- push_subscriptions holds one row per browser/device endpoint a user has
-- enabled notifications on. A row's existence IS the opt-in: there is no
-- separate user_preferences flag, and turning notifications off deletes the
-- row (see src/app/api/push/subscribe). `endpoint` is globally unique -- it
-- identifies one browser install at the push service -- so signing into a
-- second account on the same device collides on it rather than silently
-- delivering the first account's reminders to the second.
--
-- The p256dh/auth values are the subscription's public encryption key and
-- auth secret. They only let someone who already holds the endpoint encrypt
-- a payload to that browser (the push service additionally requires our VAPID
-- signature), so unlike mail_accounts' refresh tokens they are stored as
-- plain columns behind owner-scoped RLS.

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- unique(endpoint) above already creates its own btree index; this one backs
-- the sender's "all subscriptions for these users" lookup.
create index push_subscriptions_user_id_idx on public.push_subscriptions (user_id);

create trigger trg_push_subscriptions_updated_at
before update on public.push_subscriptions
for each row execute function public.set_updated_at();

alter table public.push_subscriptions enable row level security;

create policy push_subscriptions_select on public.push_subscriptions
  for select using ((select auth.uid()) = user_id);
create policy push_subscriptions_insert on public.push_subscriptions
  for insert with check ((select auth.uid()) = user_id);
create policy push_subscriptions_update on public.push_subscriptions
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
-- A delete policy is required: turning notifications off, and signing out on
-- a device, both remove the caller's own row.
create policy push_subscriptions_delete on public.push_subscriptions
  for delete using ((select auth.uid()) = user_id);

-- Per-reminder idempotency marker for the send-reminder-pushes route, a
-- sibling of emailed_at (0012) with identical semantics: null until a push
-- for this reminder has actually been sent. Kept separate from emailed_at so
-- the two channels retry independently -- a failed email must not suppress the
-- push, and vice versa. Set only by the application route after a send (this
-- database has no outbound-HTTP capability by design; see 0003/0004/0006/0007/
-- 0011), and reverted to null on a wholly transient failure so the next tick
-- retries. The route uses the service-role client, so no new RLS is needed.
alter table public.reminders
  add column pushed_at timestamptz;

-- Backs the send-reminder-pushes candidate scan (Delivered, not yet pushed).
-- Partial, because almost every reminder is eventually pushed or expired and
-- the scan only ever wants the small live tail.
create index reminders_push_candidates_idx
  on public.reminders (user_id)
  where acknowledgment_state = 'Delivered' and pushed_at is null;
