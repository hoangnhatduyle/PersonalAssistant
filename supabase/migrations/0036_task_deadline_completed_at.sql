-- MomentumCard's cycle-time/on-time/net-backlog stats (completion-trend.ts)
-- used updated_at as a completion-time proxy because no dedicated column
-- existed. updated_at is bumped by set_updated_at() (0001_init.sql) on ANY
-- column change -- not just the status transition -- so 0029_board_merge.sql's
-- bulk `status = 'Done'` backfill, and the board UI's position writes on
-- existing Done cards, silently re-stamped updated_at on tasks that were
-- actually completed long before, corrupting the dashboard's trailing-window
-- stats (confirmed in prod: 16 of a reported "20 resolved this week" shared
-- one of two exact batch-write timestamps).
--
-- completed_at is set exactly once, only on the guarded terminal-status
-- transition -- task_status/deadline_status (0001_init.sql) have no
-- transition back out of Done/Completed, so nothing can ever move it again.

alter table public.tasks add column completed_at timestamptz;
alter table public.deadlines add column completed_at timestamptz;

create function public.set_task_completed_at()
returns trigger
language plpgsql
as $$
begin
  if NEW.status = 'Done' and OLD.status is distinct from 'Done' then
    NEW.completed_at = now();
  end if;
  return NEW;
end;
$$;

create trigger trg_tasks_set_completed_at
before update of status on public.tasks
for each row execute function public.set_task_completed_at();

create function public.set_deadline_completed_at()
returns trigger
language plpgsql
as $$
begin
  if NEW.status = 'Completed' and OLD.status is distinct from 'Completed' then
    NEW.completed_at = now();
  end if;
  return NEW;
end;
$$;

create trigger trg_deadlines_set_completed_at
before update of status on public.deadlines
for each row execute function public.set_deadline_completed_at();

-- Backfill: a terminal row's updated_at is trustworthy only when it's not
-- shared with another terminal row -- an exact duplicate timestamp (down to
-- the microsecond) can only come from one bulk UPDATE touching several rows
-- at once, never two independent individual completions. Trustworthy rows
-- get backfilled from updated_at; batch-write rows are left NULL (unknown)
-- rather than fabricating a completion time -- the same "exclude, don't
-- guess" rule buildOnTimeCompletionRate already applies to missing due_at.
with task_dupes as (
  select updated_at from public.tasks where status = 'Done'
  group by updated_at having count(*) > 1
)
update public.tasks t
set completed_at = t.updated_at
where t.status = 'Done'
  and not exists (select 1 from task_dupes d where d.updated_at = t.updated_at);

with deadline_dupes as (
  select updated_at from public.deadlines where status = 'Completed'
  group by updated_at having count(*) > 1
)
update public.deadlines d
set completed_at = d.updated_at
where d.status = 'Completed'
  and not exists (select 1 from deadline_dupes dd where dd.updated_at = d.updated_at);

-- active_deadlines/active_tasks are `select *` views whose column list is
-- frozen at CREATE VIEW time -- ADD COLUMN doesn't propagate into them
-- automatically (same fix as 0021_item_priority.sql / 0034_item_acknowledged_at.sql).
drop view public.active_deadlines;
create view public.active_deadlines with (security_invoker = on) as
  select * from public.deadlines where deleted_at is null;
revoke insert, update, delete on public.active_deadlines from anon, authenticated;

drop view public.active_tasks;
create view public.active_tasks with (security_invoker = on) as
  select * from public.tasks where deleted_at is null;
revoke insert, update, delete on public.active_tasks from anon, authenticated;
