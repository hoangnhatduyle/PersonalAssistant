-- Board card reordering (drag-and-drop) PATCHes only `position`/`list_id`
-- through the same tasks UPDATE that trg_tasks_set_updated_at watches --
-- bumping updated_at on that alone reset StaleItemsCard's "Neglect" signal
-- (src/lib/dashboard/stale-items.ts) every time a card was shuffled on the
-- board, even with zero real progress on the task. Scope the trigger to
-- fire only when a column reflecting actual task content/state changes.
--
-- New tasks columns should be added to this WHEN clause too -- anything
-- left out silently stops counting as a "touch" for staleness purposes.

drop trigger trg_tasks_set_updated_at on public.tasks;

create trigger trg_tasks_set_updated_at
before update on public.tasks
for each row
when (
  OLD.title is distinct from NEW.title or
  OLD.due_at is distinct from NEW.due_at or
  OLD.status is distinct from NEW.status or
  OLD.tags is distinct from NEW.tags or
  OLD.reminders_enabled is distinct from NEW.reminders_enabled or
  OLD.reminder_lead_minutes is distinct from NEW.reminder_lead_minutes or
  OLD.deleted_at is distinct from NEW.deleted_at or
  OLD.person_id is distinct from NEW.person_id or
  OLD.acknowledged_at is distinct from NEW.acknowledged_at or
  OLD.priority is distinct from NEW.priority or
  OLD.completed_at is distinct from NEW.completed_at
)
execute function public.set_updated_at();
