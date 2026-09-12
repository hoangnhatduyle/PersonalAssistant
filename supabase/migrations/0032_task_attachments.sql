-- Attachments (Phase 4 of the Trello-style card-detail modal): real file
-- upload from day one, reusing this repo's Knowledge-source Storage pattern
-- (0008_knowledge_storage.sql) rather than inventing upload handling from
-- scratch. Two kinds share one table (not link_attachments/file_attachments)
-- since a card's attachment list is one ordered feed of either — the CHECK
-- constraint below enforces exactly one of url/storage_object_path per kind,
-- same spirit as this schema's other kind-discriminated tables
-- (feedback.target_type, personalization_suggestions.scope).

create table public.task_attachments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete restrict,
  kind text not null check (kind in ('link', 'file')),
  title text not null,
  url text,
  storage_object_path text,
  file_size_bytes bigint,
  mime_type text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint task_attachments_kind_fields_chk check (
    (kind = 'link' and url is not null and storage_object_path is null) or
    (kind = 'file' and storage_object_path is not null and url is null)
  )
);

create index task_attachments_user_id_idx on public.task_attachments (user_id);
create index task_attachments_task_id_idx on public.task_attachments (task_id);
create index task_attachments_deleted_at_idx on public.task_attachments (deleted_at) where deleted_at is not null;

alter table public.task_attachments enable row level security;

-- Soft-delete-only (NC-DATA-005), same as checklist_items/labels: no DELETE
-- policy, so a real SQL DELETE is rejected by RLS. A soft-deleted
-- kind='file' row's Storage bytes are deliberately never purged (Postgres
-- can't call Storage APIs from a trigger/RLS policy) — consistent with this
-- app never hard-purging soft-deleted data anywhere today, not a new gap.
create policy task_attachments_select on public.task_attachments
  for select using (auth.uid() = user_id);
create policy task_attachments_insert on public.task_attachments
  for insert with check (auth.uid() = user_id);
create policy task_attachments_update on public.task_attachments
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create trigger trg_task_attachments_set_updated_at
before update on public.task_attachments
for each row execute function public.set_updated_at();

create view public.active_task_attachments with (security_invoker = on) as
  select * from public.task_attachments where deleted_at is null;

revoke insert, update, delete on public.active_task_attachments from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Ownership-integrity guard: an attachment's task_id must reference a live
-- tasks row owned by that same attachment's user_id. Mirrors
-- guard_checklist_item_task_ownership (0030_checklist_items.sql).
-- ---------------------------------------------------------------------------

create function public.guard_task_attachment_task_ownership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.tasks where id = NEW.task_id and user_id = NEW.user_id and deleted_at is null
  ) then
    raise exception 'task_attachments.task_id must reference a tasks row owned by task_attachments.user_id';
  end if;
  return NEW;
end;
$$;

create trigger trg_guard_task_attachment_task_ownership
before insert or update of task_id, user_id on public.task_attachments
for each row execute function public.guard_task_attachment_task_ownership();

-- ---------------------------------------------------------------------------
-- Extend soft_delete_task_cascade again (building on 0031_labels.sql's
-- version): soft-delete task_attachments rows for the task, add
-- attachments_deleted int. Callers (soft_delete_todo_list_cascade,
-- soft_delete_course_cascade) read the result into a `record`-typed
-- variable (one ignores it via `perform`), so they need no changes.
-- ---------------------------------------------------------------------------

drop function public.soft_delete_task_cascade(uuid);

create function public.soft_delete_task_cascade(p_task_id uuid)
returns table (
  notes_unlinked int,
  suggestions_dismissed int,
  checklist_items_deleted int,
  labels_unlinked int,
  attachments_deleted int
)
language plpgsql
as $$
declare
  v_now timestamptz := now();
  v_notes_unlinked int := 0;
  v_suggestions_dismissed int := 0;
  v_checklist_items_deleted int := 0;
  v_labels_unlinked int := 0;
  v_attachments_deleted int := 0;
begin
  update public.tasks
  set deleted_at = v_now
  where id = p_task_id and deleted_at is null;

  if not found then
    return query select 0, 0, 0, 0, 0;
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

  with deleted_attachments as (
    update public.task_attachments
    set deleted_at = v_now
    where task_id = p_task_id and deleted_at is null
    returning id
  )
  select count(*) into v_attachments_deleted from deleted_attachments;

  return query select v_notes_unlinked, v_suggestions_dismissed, v_checklist_items_deleted, v_labels_unlinked, v_attachments_deleted;
end;
$$;

revoke execute on function public.soft_delete_task_cascade(uuid) from public, anon;
grant execute on function public.soft_delete_task_cascade(uuid) to authenticated;
