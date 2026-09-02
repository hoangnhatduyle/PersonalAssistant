-- Persisted appointments: replaces the browser-only localStorage store.
-- Appointments are standalone (not linked to a course), have their own
-- optional reminder support, and appear on the calendar week grid.

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  date date not null,
  category text not null default 'Other',
  time text,
  location text,
  notes text[] not null default '{}',
  reminders_enabled boolean not null default false,
  reminder_lead_minutes integer not null default 60,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index appointments_user_id_idx on public.appointments (user_id);
create index appointments_date_idx on public.appointments (date);

-- Extend reminders target_type CHECK to include 'appointment'.
alter table public.reminders drop constraint reminders_target_type_check;
alter table public.reminders add constraint reminders_target_type_check
  check (target_type in ('deadline', 'task', 'appointment'));

-- auto-update updated_at on every write (same pattern as other tables)
create or replace function public.set_appointments_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger appointments_set_updated_at
  before update on public.appointments
  for each row execute function public.set_appointments_updated_at();

-- RLS: owner-only access
alter table public.appointments enable row level security;

create policy "appointments_select_own" on public.appointments
  for select using (auth.uid() = user_id);
create policy "appointments_insert_own" on public.appointments
  for insert with check (auth.uid() = user_id);
create policy "appointments_update_own" on public.appointments
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "appointments_delete_own" on public.appointments
  for delete using (auth.uid() = user_id);
