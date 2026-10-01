-- "Duplicate as new" for Board cards: a Done card is terminal by design
-- (guard_task_status, 0001_init.sql allows only Open -> Done/Cancelled), so
-- instead of reopening it, the user copies it into a fresh Open card. The
-- original keeps its Done status and completed_at, so Momentum's completion
-- stats (0036_task_deadline_completed_at.sql) stay accurate.
--
-- Copied: title, list_id, person_id, priority, tags, reminder settings,
-- live labels, live checklist items (unchecked), live *link* attachments.
-- Deliberately not copied: due_at (the UI prompts for a new one),
-- status/completed_at/acknowledged_at (fresh row), uploaded-file
-- attachments (a copy would share Storage bytes with the original), notes
-- and feedback (they describe the finished attempt).
--
-- One function so the card, checklist, attachments and labels land
-- atomically -- supabase-js has no client transaction primitive (same
-- rationale as sync_task_labels, 0031_labels.sql). SECURITY INVOKER
-- (default): every statement runs under the caller's RLS, so a task id
-- belonging to another user simply isn't found.

create function public.duplicate_task(p_task_id uuid)
returns uuid
language plpgsql
as $$
declare
  v_src public.tasks%rowtype;
  v_new_id uuid;
  v_position integer;
begin
  select * into v_src
  from public.tasks
  where id = p_task_id and deleted_at is null;

  if not found then
    raise exception 'duplicate_task: task % not found', p_task_id;
  end if;

  -- One above the current top card of the same list (null list = the
  -- Miscellaneous bucket), so the copy appears first.
  select coalesce(min(position), 0) - 1 into v_position
  from public.tasks
  where user_id = v_src.user_id
    and deleted_at is null
    and list_id is not distinct from v_src.list_id;

  insert into public.tasks (
    user_id, title, list_id, person_id, priority, tags,
    reminders_enabled, reminder_lead_minutes, position
  )
  values (
    v_src.user_id, v_src.title, v_src.list_id, v_src.person_id, v_src.priority, v_src.tags,
    v_src.reminders_enabled, v_src.reminder_lead_minutes, v_position
  )
  returning id into v_new_id;

  insert into public.checklist_items (user_id, task_id, label, is_done, position)
  select user_id, v_new_id, label, false, position
  from public.checklist_items
  where task_id = p_task_id and deleted_at is null;

  insert into public.task_attachments (user_id, task_id, kind, title, url)
  select user_id, v_new_id, kind, title, url
  from public.task_attachments
  where task_id = p_task_id and deleted_at is null and kind = 'link';

  insert into public.task_labels (task_id, label_id, user_id)
  select v_new_id, tl.label_id, tl.user_id
  from public.task_labels tl
  join public.labels l on l.id = tl.label_id and l.deleted_at is null
  where tl.task_id = p_task_id;

  return v_new_id;
end;
$$;

revoke execute on function public.duplicate_task(uuid) from public, anon;
grant execute on function public.duplicate_task(uuid) to authenticated;
