-- SPEC-DATA-012: user_preferences table backing SPEC-API-009's GET/PATCH
-- /api/settings route — a singleton-per-user row (default reminder lead
-- time, quiet-hours window, voice-capture toggle) so the Settings page's
-- preference cards persist for real instead of being local-only no-ops.

create table public.user_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  default_reminder_lead_minutes integer not null default 60
    check (default_reminder_lead_minutes between 0 and 1440),
  quiet_hours_start time,
  quiet_hours_end time,
  -- NC-DATA-USERPREFS-003: a half-open window (one bound set, the other
  -- null) is meaningless — reject it at the schema layer, not just in the
  -- API's Zod validation, so a direct/service-role write can't create one
  -- either.
  check ((quiet_hours_start is null) = (quiet_hours_end is null)),
  -- SPEC-DATA-012 v0.2.0 (architect-review finding + explicit human decision
  -- at the critical-risk approval checkpoint): a bare `time` column is
  -- ambiguous with no frame of reference — added now while the table is
  -- still empty, rather than as a later breaking migration. IANA-name
  -- validity is enforced at the API/Zod layer (SPEC-API-009), not here —
  -- Postgres has no built-in IANA validator without an extension.
  timezone text not null default 'UTC',
  voice_capture_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- unique(user_id) above already creates a covering btree index — no
-- separate user_id index needed (mirrors feedback_aggregates' unique(user_id,
-- dimension) precedent in 0006_feedback.sql).

-- ---------------------------------------------------------------------------
-- updated_at maintenance (NC-API-USERPREFS-004's response shape surfaces
-- this to the client as the "last actually saved" marker). Reuses the
-- existing public.set_updated_at() from 0001_init.sql (same as every other
-- table's updated_at trigger) rather than defining a redundant near-copy —
-- code-review finding.
-- ---------------------------------------------------------------------------

create trigger trg_user_preferences_updated_at
before update on public.user_preferences
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security (NC-DATA-USERPREFS-002): select/insert/update only, no
-- delete policy — the row is cascade-deleted with the owning profile, never
-- independently (mirrors feedback_aggregates' no-delete-policy precedent).
-- ---------------------------------------------------------------------------

alter table public.user_preferences enable row level security;

create policy user_preferences_select on public.user_preferences
  for select using ((select auth.uid()) = user_id);
create policy user_preferences_insert on public.user_preferences
  for insert with check ((select auth.uid()) = user_id);
create policy user_preferences_update on public.user_preferences
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
