-- SPEC-API-004 AC-7/NC-API-008: the Course and Task soft-delete cascades
-- touch multiple tables (courses/deadlines/notes, tasks/notes) and must land
-- atomically. supabase-js has no client-side transaction primitive -- each
-- `.from(...).update()` call is its own PostgREST request/transaction -- so
-- the cascade is wrapped in a single Postgres function instead. Deadline and
-- Task's own single-row soft-delete needs no such function: a bare UPDATE
-- and the AFTER trigger it fires (trg_*_soft_delete_dismiss_reminders) already
-- run inside one statement's transaction.
--
-- SECURITY INVOKER (the default -- no clause needed): these run as the
-- calling `authenticated` role, so the existing per-table RLS policies keep
-- scoping every statement inside to the caller's own rows. The API route
-- still does its own owned-row check before calling (NC-API-001, AC-4); this
-- is defense in depth, not the only gate.
--
-- Each function returns counts of what it touched so the API layer can
-- disclose cascade scope in the delete response (Tracked debt: SPEC-VOICE-004
-- AC-6 only guarantees a confirmed mutation executes as shown -- it does not
-- by itself require the confirmation prompt to disclose how far a Course
-- delete cascades. This return value is what Item 3's route response, and
-- Item 5's voice confirm copy, surface to satisfy that).

create function public.soft_delete_course_cascade(p_course_id uuid)
returns table (deadlines_affected int, reminders_dismissed int, notes_unlinked int)
language plpgsql
as $$
declare
  v_now timestamptz := now();
  v_deadline_ids uuid[];
  v_deadlines_affected int := 0;
  v_reminders_dismissed int := 0;
  v_notes_unlinked int := 0;
begin
  update public.courses
  set deleted_at = v_now
  where id = p_course_id and deleted_at is null;

  if not found then
    return query select 0, 0, 0;
    return;
  end if;

  select array_agg(id) into v_deadline_ids
  from public.deadlines
  where course_id = p_course_id and deleted_at is null;

  if v_deadline_ids is not null then
    -- Snapshot before cascading: these are exactly the rows
    -- trg_deadlines_soft_delete_dismiss_reminders is about to dismiss.
    select count(*) into v_reminders_dismissed
    from public.reminders
    where target_type = 'deadline'
      and target_id = any(v_deadline_ids)
      and acknowledgment_state in ('Scheduled', 'Snoozed');

    update public.deadlines
    set deleted_at = v_now
    where id = any(v_deadline_ids);

    v_deadlines_affected := array_length(v_deadline_ids, 1);
  end if;

  with unlinked as (
    update public.notes
    set linked_course_id = null
    where linked_course_id = p_course_id
    returning id
  )
  select count(*) into v_notes_unlinked from unlinked;

  return query select v_deadlines_affected, v_reminders_dismissed, v_notes_unlinked;
end;
$$;

create function public.soft_delete_task_cascade(p_task_id uuid)
returns table (notes_unlinked int)
language plpgsql
as $$
declare
  v_now timestamptz := now();
  v_notes_unlinked int := 0;
begin
  update public.tasks
  set deleted_at = v_now
  where id = p_task_id and deleted_at is null;

  if not found then
    return query select 0;
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

  return query select v_notes_unlinked;
end;
$$;

-- Postgres grants EXECUTE on new functions to PUBLIC by default, which would
-- also hand it to `anon`. Restrict to `authenticated` -- RLS inside would
-- still no-op an anon/foreign call, but there is no reason to expose the RPC
-- at all to a caller with no session.
revoke execute on function public.soft_delete_course_cascade(uuid) from public, anon;
grant execute on function public.soft_delete_course_cascade(uuid) to authenticated;

revoke execute on function public.soft_delete_task_cascade(uuid) from public, anon;
grant execute on function public.soft_delete_task_cascade(uuid) to authenticated;
