-- Labels (Phase 3 of the Trello-style card-detail modal): fully replace the
-- free-text tasks.tags column as the way to categorize a Board Card, using
-- Trello's actual fixed-palette label system (screenshots-verified: a
-- two-step popover, 10 hues x 3 shades = 30 swatches, "Remove color" sets a
-- colorless name-only label). tasks.tags itself is left in place (still read
-- by dashboard/driving/intelligence code outside this phase's scope) but is
-- no longer written from the UI as of this migration — see TaskForm.tsx.

create table public.labels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  -- Fixed palette token, e.g. 'green', 'green-light', 'green-dark', ... (10
  -- hues x {light,'',dark} = 30 valid non-null tokens; see
  -- src/lib/label-colors.ts's LABEL_COLOR_TOKENS for the authoritative list
  -- this CHECK must mirror). Null = "Remove color" was chosen — a colorless,
  -- name-only label. A text + check(... in (...)) constraint (rather than a
  -- Postgres enum type) matches this schema's existing preference for small
  -- closed sets that might grow (e.g. feedback.target_type,
  -- personalization_suggestions.scope) — easier to extend later without an
  -- `alter type` migration.
  color text check (color is null or color in (
    'green-light','green','green-dark',
    'yellow-light','yellow','yellow-dark',
    'orange-light','orange','orange-dark',
    'red-light','red','red-dark',
    'purple-light','purple','purple-dark',
    'blue-light','blue','blue-dark',
    'sky-light','sky','sky-dark',
    'lime-light','lime','lime-dark',
    'pink-light','pink','pink-dark',
    'black-light','black','black-dark'
  )),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index labels_user_id_idx on public.labels (user_id);
create index labels_deleted_at_idx on public.labels (deleted_at) where deleted_at is not null;

alter table public.labels enable row level security;

-- Soft-delete-only (NC-DATA-005), same as people/todo_lists/checklist_items:
-- no DELETE policy, so a real SQL DELETE is rejected by RLS.
create policy labels_select on public.labels
  for select using (auth.uid() = user_id);
create policy labels_insert on public.labels
  for insert with check (auth.uid() = user_id);
create policy labels_update on public.labels
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create trigger trg_labels_set_updated_at
before update on public.labels
for each row execute function public.set_updated_at();

create view public.active_labels with (security_invoker = on) as
  select * from public.labels where deleted_at is null;

revoke insert, update, delete on public.active_labels from anon, authenticated;

-- ---------------------------------------------------------------------------
-- task_labels: this schema's first true many-to-many join table (existing
-- "links" — notes.linked_task_id, courses.person_id, etc. — are nullable
-- single-FK columns, not a join table). Deliberately breaks from the
-- soft-delete convention: a real RLS DELETE policy, no deleted_at, since
-- removing a label from a card is a genuine unlink with no history worth
-- preserving.
-- ---------------------------------------------------------------------------

create table public.task_labels (
  task_id uuid not null references public.tasks(id) on delete restrict,
  label_id uuid not null references public.labels(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (task_id, label_id)
);

create index task_labels_task_id_idx on public.task_labels (task_id);
create index task_labels_label_id_idx on public.task_labels (label_id);
create index task_labels_user_id_idx on public.task_labels (user_id);

alter table public.task_labels enable row level security;

create policy task_labels_select on public.task_labels
  for select using (auth.uid() = user_id);
create policy task_labels_insert on public.task_labels
  for insert with check (auth.uid() = user_id);
create policy task_labels_delete on public.task_labels
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Ownership-integrity guard: a task_labels row's task_id and label_id must
-- both reference live rows owned by that same row's user_id. Mirrors
-- guard_checklist_item_task_ownership (0030_checklist_items.sql).
-- ---------------------------------------------------------------------------

create function public.guard_task_label_ownership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.tasks where id = NEW.task_id and user_id = NEW.user_id and deleted_at is null
  ) then
    raise exception 'task_labels.task_id must reference a tasks row owned by task_labels.user_id';
  end if;
  if not exists (
    select 1 from public.labels where id = NEW.label_id and user_id = NEW.user_id and deleted_at is null
  ) then
    raise exception 'task_labels.label_id must reference a labels row owned by task_labels.user_id';
  end if;
  return NEW;
end;
$$;

create trigger trg_guard_task_label_ownership
before insert on public.task_labels
for each row execute function public.guard_task_label_ownership();

-- ---------------------------------------------------------------------------
-- sync_task_labels: atomically replaces a task's full label set
-- (delete-then-insert) — supabase-js has no client transaction primitive,
-- same rationale as the existing cascade functions. SECURITY INVOKER
-- (default): runs as the calling `authenticated` role, so task_labels' own
-- RLS policies keep every statement scoped to the caller's own rows. The API
-- route (src/app/api/tasks/route.ts, [id]/route.ts) verifies every id in
-- p_label_ids belongs to the caller before calling this — defense in depth,
-- not the only gate (guard_task_label_ownership backstops it row-by-row too).
-- ---------------------------------------------------------------------------

create function public.sync_task_labels(p_task_id uuid, p_label_ids uuid[])
returns void
language plpgsql
as $$
declare
  v_user_id uuid;
begin
  select user_id into v_user_id
  from public.tasks
  where id = p_task_id and deleted_at is null;

  if v_user_id is null then
    raise exception 'sync_task_labels: task % not found', p_task_id;
  end if;

  delete from public.task_labels where task_id = p_task_id;

  if p_label_ids is not null and array_length(p_label_ids, 1) > 0 then
    insert into public.task_labels (task_id, label_id, user_id)
    select p_task_id, label_id, v_user_id
    from unnest(p_label_ids) as label_id;
  end if;
end;
$$;

revoke execute on function public.sync_task_labels(uuid, uuid[]) from public, anon;
grant execute on function public.sync_task_labels(uuid, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- soft_delete_label_cascade: soft-deletes a Label and, atomically, unlinks
-- (hard-deletes, matching task_labels' own no-history convention above) it
-- from every Task referencing it. Mirrors soft_delete_course_cascade's shape
-- (0002_delete_cascade.sql).
-- ---------------------------------------------------------------------------

create function public.soft_delete_label_cascade(p_label_id uuid)
returns table (tasks_unlinked int)
language plpgsql
as $$
declare
  v_now timestamptz := now();
  v_tasks_unlinked int := 0;
begin
  update public.labels
  set deleted_at = v_now
  where id = p_label_id and deleted_at is null;

  if not found then
    return query select 0;
    return;
  end if;

  with unlinked as (
    delete from public.task_labels
    where label_id = p_label_id
    returning task_id
  )
  select count(*) into v_tasks_unlinked from unlinked;

  return query select v_tasks_unlinked;
end;
$$;

revoke execute on function public.soft_delete_label_cascade(uuid) from public, anon;
grant execute on function public.soft_delete_label_cascade(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Extend soft_delete_task_cascade again (this phase's own drop/create,
-- building on 0030_checklist_items.sql's version): unlink task_labels rows
-- for the task, add labels_unlinked int. Callers
-- (soft_delete_todo_list_cascade, soft_delete_course_cascade) read the
-- result into a `record`-typed variable (one ignores it via `perform`), so
-- they need no changes.
-- ---------------------------------------------------------------------------

drop function public.soft_delete_task_cascade(uuid);

create function public.soft_delete_task_cascade(p_task_id uuid)
returns table (notes_unlinked int, suggestions_dismissed int, checklist_items_deleted int, labels_unlinked int)
language plpgsql
as $$
declare
  v_now timestamptz := now();
  v_notes_unlinked int := 0;
  v_suggestions_dismissed int := 0;
  v_checklist_items_deleted int := 0;
  v_labels_unlinked int := 0;
begin
  update public.tasks
  set deleted_at = v_now
  where id = p_task_id and deleted_at is null;

  if not found then
    return query select 0, 0, 0, 0;
    return;
  end if;

  -- trg_tasks_soft_delete_dismiss_reminders (same transaction) already
  -- dismissed this task's own Scheduled/Snoozed reminder, if any.
  with unlinked as (
    update public.notes
    set linked_task_id = null
    where linked_task_id = p_task_id
    returning id
  )
  select count(*) into v_notes_unlinked from unlinked;

  with dismissed as (
    update public.personalization_suggestions
    set status = 'dismissed', dismissed_at = v_now
    where scope = 'task' and target_id = p_task_id and status = 'pending'
    returning id
  )
  select count(*) into v_suggestions_dismissed from dismissed;

  with deleted as (
    update public.checklist_items
    set deleted_at = v_now
    where task_id = p_task_id and deleted_at is null
    returning id
  )
  select count(*) into v_checklist_items_deleted from deleted;

  with unlinked_labels as (
    delete from public.task_labels
    where task_id = p_task_id
    returning label_id
  )
  select count(*) into v_labels_unlinked from unlinked_labels;

  return query select v_notes_unlinked, v_suggestions_dismissed, v_checklist_items_deleted, v_labels_unlinked;
end;
$$;

revoke execute on function public.soft_delete_task_cascade(uuid) from public, anon;
grant execute on function public.soft_delete_task_cascade(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- One-time data migration: backfill existing free-text tags into Labels,
-- deduped per user, linked via task_labels — silently dropping existing
-- user data on a schema upgrade is the worse default. Live tasks only
-- (deleted_at is null); a soft-deleted task's tags need no label. Runs after
-- every table/trigger above already exists, so no ownership-guard-disabling
-- dance is needed (unlike 0029_board_merge.sql's todo_items migration) —
-- every label a row here links to was just created for that same task's
-- owner.
-- ---------------------------------------------------------------------------

insert into public.labels (user_id, name, color)
select distinct t.user_id, tag, 'blue'
from public.tasks t
cross join unnest(t.tags) as tag
where t.deleted_at is null and cardinality(t.tags) > 0;

insert into public.task_labels (task_id, label_id, user_id)
select distinct t.id, l.id, t.user_id
from public.tasks t
cross join unnest(t.tags) as tag
join public.labels l on l.user_id = t.user_id and l.name = tag and l.deleted_at is null
where t.deleted_at is null and cardinality(t.tags) > 0
on conflict (task_id, label_id) do nothing;
