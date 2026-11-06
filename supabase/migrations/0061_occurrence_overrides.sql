-- Per-occurrence exceptions to a recurring course or recurring appointment:
-- "this Thursday I start at 1 PM", "skip this Tuesday". A course/appointment
-- recurs from a weekly pattern (meeting_blocks, 0014/0035) with no way to
-- touch one date; an override row records what ONE occurrence does instead,
-- leaving the series (and every other date) exactly as it was.
--
-- An occurrence is identified by where the SERIES puts it, not where it ended
-- up: (parent, original_date, original_start_minutes). Keyed by start time
-- rather than the block's array position because blocks are re-ordered and
-- removed when the pattern is edited, which would silently re-point an
-- index-keyed override at a different block. original_date also stays the key
-- for appointment_occurrence_status (0049), so an occurrence that has been
-- moved keeps its done/missed status.
--
-- A row either cancels the occurrence (is_cancelled, no new time) or moves it
-- (new_date + new start/end, which may be another day). A block never crosses
-- midnight (start < end <= 1439, same bounds as meetingBlockSchema), so
-- neither can an override.
--
-- Additive only: nothing here changes an existing table, and the series data
-- is untouched -- an override that no longer matches a real occurrence (the
-- pattern was edited) is simply ignored by the reader
-- (src/lib/calendar/occurrence-overrides.ts).
--
-- Unlike appointment_occurrence_status (0049), this table carries its own
-- user_id so RLS is a same-row equality check, and it has a DELETE policy:
-- "Revert to series" deletes the override. That departs from the schema's
-- soft-delete-only convention (NC-DATA-005) deliberately -- an override is not
-- an entity the user created, it is derived state, and a "deleted" exception
-- would just be one more row the reader has to skip.

create table public.occurrence_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  course_id uuid references public.courses(id) on delete cascade,
  appointment_id uuid references public.appointments(id) on delete cascade,
  -- The occurrence being changed, as the series defines it.
  original_date date not null,
  original_start_minutes smallint not null,
  is_cancelled boolean not null default false,
  -- Where it sits instead (all null when cancelled).
  new_date date,
  new_start_minutes smallint,
  new_end_minutes smallint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint occurrence_overrides_one_parent check ((course_id is null) <> (appointment_id is null)),
  constraint occurrence_overrides_original_start_in_day check (original_start_minutes between 0 and 1439),
  constraint occurrence_overrides_shape check (
    (
      is_cancelled
      and new_date is null and new_start_minutes is null and new_end_minutes is null
    )
    or (
      -- Explicit is-not-null: a CHECK that evaluates to NULL passes, so a missing
      -- new_start_minutes would otherwise slip through the range tests below.
      not is_cancelled
      and new_date is not null
      and new_start_minutes is not null and new_start_minutes between 0 and 1438
      and new_end_minutes is not null and new_end_minutes between 1 and 1439
      and new_start_minutes < new_end_minutes
    )
  )
);

-- Natural keys, one per parent type (the write path upserts against these via
-- on_conflict). Deliberately NOT partial indexes: PostgREST can only target a
-- plain unique index, and none is needed -- unique indexes treat NULLs as
-- distinct, so an appointment's override (course_id null) never collides here
-- and a course's never collides on the appointment key.
create unique index occurrence_overrides_course_occurrence_idx
  on public.occurrence_overrides (course_id, original_date, original_start_minutes);

create unique index occurrence_overrides_appointment_occurrence_idx
  on public.occurrence_overrides (appointment_id, original_date, original_start_minutes);

-- Embedded reads from GET /api/courses and /api/appointments; the unique
-- indexes above already lead with these columns, but a dedicated index keeps
-- the nested-select plan stable.
create index occurrence_overrides_course_id_idx on public.occurrence_overrides (course_id) where course_id is not null;
create index occurrence_overrides_appointment_id_idx on public.occurrence_overrides (appointment_id) where appointment_id is not null;
create index occurrence_overrides_user_id_idx on public.occurrence_overrides (user_id);

alter table public.occurrence_overrides enable row level security;

create policy occurrence_overrides_select on public.occurrence_overrides
  for select using ((select auth.uid()) = user_id);

create policy occurrence_overrides_insert on public.occurrence_overrides
  for insert with check ((select auth.uid()) = user_id);

create policy occurrence_overrides_update on public.occurrence_overrides
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy occurrence_overrides_delete on public.occurrence_overrides
  for delete using ((select auth.uid()) = user_id);

create trigger trg_occurrence_overrides_set_updated_at
before update on public.occurrence_overrides
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- guard_occurrence_override_parent_ownership: RLS above only proves the row's
-- user_id is the caller's; it says nothing about whether the course/appointment
-- it points at is theirs. Without this, a user could stamp their own user_id on
-- an override for SOMEONE ELSE's course. Same idiom (and security definer, so
-- the check can see the parent regardless of the caller's own RLS) as
-- guard_checklist_item_task_ownership (0030).
-- ---------------------------------------------------------------------------

create function public.guard_occurrence_override_parent_ownership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.course_id is not null then
    if not exists (
      select 1 from public.courses where id = NEW.course_id and user_id = NEW.user_id
    ) then
      raise exception 'occurrence_overrides.course_id must reference a course owned by occurrence_overrides.user_id';
    end if;
  else
    if not exists (
      select 1 from public.appointments where id = NEW.appointment_id and user_id = NEW.user_id
    ) then
      raise exception 'occurrence_overrides.appointment_id must reference an appointment owned by occurrence_overrides.user_id';
    end if;
  end if;
  return NEW;
end;
$$;

create trigger trg_guard_occurrence_override_parent_ownership
before insert or update of course_id, appointment_id, user_id on public.occurrence_overrides
for each row execute function public.guard_occurrence_override_parent_ownership();
