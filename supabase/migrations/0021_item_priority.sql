-- Adds a shared priority concept across Deadlines, Tasks, and Course To-Do
-- items so the assistant can rank same-day items by importance, not just by
-- due date. deadlines.priority was previously free text and never parsed;
-- this converts it to a fixed enum and adds the same nullable column to
-- tasks and todo_items. NULL means "unset" and is never force-filled --
-- callers treat NULL as "Medium" only when ranking, never in storage.

create type public.item_priority as enum ('Low', 'Medium', 'High', 'Urgent');

-- Postgres refuses ALTER COLUMN ... TYPE on a column any view's rule
-- depends on (even a security_invoker select * view) -- active_deadlines
-- must be dropped before the type change and recreated after, same as the
-- active_tasks/active_todo_items views below.
drop view public.active_deadlines;

-- Case-insensitive best-effort mapping of existing free-text values;
-- anything unrecognized becomes NULL (unset) rather than guessing.
alter table public.deadlines
  alter column priority type item_priority
  using (
    case lower(trim(priority))
      when 'low' then 'Low'::item_priority
      when 'medium' then 'Medium'::item_priority
      when 'med' then 'Medium'::item_priority
      when 'high' then 'High'::item_priority
      when 'urgent' then 'Urgent'::item_priority
      else null
    end
  );

create view public.active_deadlines with (security_invoker = on) as
  select * from public.deadlines where deleted_at is null;
revoke insert, update, delete on public.active_deadlines from anon, authenticated;

alter table public.tasks add column priority item_priority;
alter table public.todo_items add column priority item_priority;

-- active_tasks/active_todo_items are `select *` views whose column list is
-- frozen at CREATE VIEW time -- adding a column doesn't propagate into them
-- automatically. No application code currently queries these active_* views
-- (routes query the base tables directly with .is("deleted_at", null)), so
-- recreating them here is a consistency fix, not a live-bug fix. Nothing
-- else depends on them (grepped: no other view/function references them),
-- so DROP VIEW is safe.
drop view public.active_tasks;
create view public.active_tasks with (security_invoker = on) as
  select * from public.tasks where deleted_at is null;
revoke insert, update, delete on public.active_tasks from anon, authenticated;

drop view public.active_todo_items;
create view public.active_todo_items with (security_invoker = on) as
  select * from public.todo_items where deleted_at is null;
revoke insert, update, delete on public.active_todo_items from anon, authenticated;
