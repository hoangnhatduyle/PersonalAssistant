-- Per-occurrence status for recurring appointments. appointments.event_status
-- (0027_appointment_event_status.sql) is a single terminal field per row --
-- fine for a one-off appointment, but a recurring appointment (meeting_blocks
-- non-empty, 0035_appointment_recurrence.sql) is still one row representing
-- the whole series: marking one Friday "Done" permanently marked every future
-- Friday "Done" too, and the row vanished from the dashboard's Up Next queue
-- forever. This table tracks completion per (appointment_id, occurrence_date)
-- instead, so a recurring row's own event_status column is left untouched and
-- unused. Non-recurring appointments are completely unaffected -- they keep
-- reading/writing appointments.event_status exactly as before; the app layer
-- (src/lib/appointments/occurrence-status.ts, added alongside this migration)
-- decides which source to use based on whether meeting_blocks is empty.
--
-- No user_id column here (unlike checklist_items/task_attachments/labels):
-- an occurrence-status row has no independent identity a user creates --
-- it only ever exists to record one appointment's occurrence outcome, so
-- ownership is entirely derived through appointment_id. RLS below is scoped
-- via a join to appointments.user_id rather than a same-row equality check.
--
-- No backfill/pre-population: an absent row for a given occurrence means
-- "planned" by convention, resolved in application code (Phase 2), not
-- materialized as a default DB row -- there is no fixed universe of
-- occurrences to enumerate ahead of time for an open-ended recurrence.

create table public.appointment_occurrence_status (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  occurrence_date date not null,
  status public.event_status not null default 'planned',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Natural key: one status row per appointment per occurrence date. The write
-- path (Phase 3) upserts against this via `on conflict (appointment_id, occurrence_date)`.
create unique index appointment_occurrence_status_appointment_date_idx
  on public.appointment_occurrence_status (appointment_id, occurrence_date);

-- Supports the batch nested-select read path (Phase 2's embedded-resource
-- join from GET /api/appointments) -- the unique index above already covers
-- appointment_id as its leading column, but a dedicated index keeps that
-- lookup plan stable even if the composite index's column order ever changes.
create index appointment_occurrence_status_appointment_id_idx
  on public.appointment_occurrence_status (appointment_id);

alter table public.appointment_occurrence_status enable row level security;

-- No own user_id column, so ownership is checked by joining to the parent
-- appointments row (same idiom as guard_checklist_item_task_ownership /
-- guard_task_attachment_task_ownership use for their ownership *guards* --
-- applied here directly in the RLS predicate since this table has no column
-- of its own to compare against auth.uid()).
create policy appointment_occurrence_status_select on public.appointment_occurrence_status
  for select using (
    exists (
      select 1 from public.appointments a
      where a.id = appointment_occurrence_status.appointment_id
        and a.user_id = auth.uid()
    )
  );

create policy appointment_occurrence_status_insert on public.appointment_occurrence_status
  for insert with check (
    exists (
      select 1 from public.appointments a
      where a.id = appointment_occurrence_status.appointment_id
        and a.user_id = auth.uid()
    )
  );

create policy appointment_occurrence_status_update on public.appointment_occurrence_status
  for update using (
    exists (
      select 1 from public.appointments a
      where a.id = appointment_occurrence_status.appointment_id
        and a.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.appointments a
      where a.id = appointment_occurrence_status.appointment_id
        and a.user_id = auth.uid()
    )
  );

-- Deliberately no DELETE policy: same soft-delete-only convention as the rest
-- of this schema (NC-DATA-005) even though this row has no deleted_at of its
-- own -- an occurrence-status row's lifecycle is fully owned by its parent
-- appointment's `on delete cascade`, not by direct client deletes.

create trigger trg_appointment_occurrence_status_set_updated_at
before update on public.appointment_occurrence_status
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- guard_appointment_occurrence_status: structural mirror of guard_event_status
-- (0027_appointment_event_status.sql, terminal-hardened by
-- 0028_event_status_missed_terminal.sql) -- same enum, same terminal
-- semantics, no reversal on UPDATE.
--
-- Unlike appointments/deadlines/tasks, INSERT here is NOT required to start
-- at 'planned'. Those tables' rows are created by an explicit user-facing
-- "create X" action, so their initial value has real meaning to guard. This
-- table's rows are instead materialized lazily on first write for a given
-- occurrence -- an absent row already means "planned" by convention (Phase
-- 2's read path), so the write path (Phase 3) upserts the *target* status
-- directly (`on conflict (appointment_id, occurrence_date) do update`)
-- without a separate "create the row as planned" step. Postgres fires the
-- BEFORE INSERT trigger with that target status for the proposed row even
-- when the statement ultimately resolves via ON CONFLICT DO UPDATE, so
-- rejecting a non-planned INSERT here would reject every first-time
-- planned->done/missed write. Since every enum value is one legal hop from
-- the implicit 'planned' starting point anyway, allowing any status on
-- INSERT is equivalent in practice to enforcing the same edges the UPDATE
-- branch below enforces once a row exists.
-- ---------------------------------------------------------------------------

create function public.guard_appointment_occurrence_status()
returns trigger
language plpgsql
as $$
begin
  if TG_OP = 'INSERT' then
    return NEW;
  end if;

  if NEW.status is distinct from OLD.status then
    if (OLD.status, NEW.status) not in (
      ('planned', 'done'),
      ('planned', 'missed')
    ) then
      raise exception 'Forbidden appointment_occurrence_status transition: % -> %', OLD.status, NEW.status;
    end if;
  end if;
  return NEW;
end;
$$;

create trigger trg_guard_appointment_occurrence_status
before insert or update of status on public.appointment_occurrence_status
for each row execute function public.guard_appointment_occurrence_status();
