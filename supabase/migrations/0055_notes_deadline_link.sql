-- Notes can now be attached to a Deadline (added/edited from the deadline's
-- detail page, shown read-only on the Workload deadline cards).

alter table public.notes
  add column linked_deadline_id uuid references public.deadlines(id) on delete set null;

create index notes_linked_deadline_id_idx on public.notes (linked_deadline_id)
  where linked_deadline_id is not null;

-- active_notes is `select *`, which Postgres expands at creation time, so
-- the new column has to be re-exposed. Appending a column keeps the
-- existing grants (including 0001's revoke of insert/update/delete).
create or replace view public.active_notes with (security_invoker = on) as
  select * from public.notes where deleted_at is null;

-- A soft-deleted deadline must not keep notes linked to it. One trigger
-- covers every path that soft-deletes a deadline (the deadline's own cascade
-- function, and the course/person/board cascades that soft-delete deadlines
-- inline) instead of editing each of those functions. The notes themselves
-- are kept, just unlinked -- same behavior as a deleted course or task.
create function public.unlink_notes_on_deadline_soft_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.notes
  set linked_deadline_id = null
  where linked_deadline_id = NEW.id;
  return NEW;
end;
$$;

revoke execute on function public.unlink_notes_on_deadline_soft_delete() from public, anon, authenticated;

create trigger trg_deadlines_soft_delete_unlink_notes
after update of deleted_at on public.deadlines
for each row
when (NEW.deleted_at is not null and OLD.deleted_at is null)
execute function public.unlink_notes_on_deadline_soft_delete();
