-- Lets a user manually reset a Deadline/Task's staleness clock ("still on
-- it") without making a real edit -- StaleItemsCard's per-item snooze
-- button (see src/lib/dashboard/stale-items.ts). Kept separate from
-- updated_at (which real edits already bump) so the two signals don't
-- collide: an edit and a manual acknowledgment mean different things.

alter table public.deadlines add column acknowledged_at timestamptz;
alter table public.tasks add column acknowledged_at timestamptz;

-- active_deadlines/active_tasks are `select *` views whose column list is
-- frozen at CREATE VIEW time -- ADD COLUMN doesn't propagate into them
-- automatically (same fix as 0021_item_priority.sql for the `priority`
-- column). Recreate both.
drop view public.active_deadlines;
create view public.active_deadlines with (security_invoker = on) as
  select * from public.deadlines where deleted_at is null;
revoke insert, update, delete on public.active_deadlines from anon, authenticated;

drop view public.active_tasks;
create view public.active_tasks with (security_invoker = on) as
  select * from public.tasks where deleted_at is null;
revoke insert, update, delete on public.active_tasks from anon, authenticated;
