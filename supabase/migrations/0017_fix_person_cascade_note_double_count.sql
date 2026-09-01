-- Fixes soft_delete_person_cascade's notes_unlinked count: the prior version
-- (0013_people.sql) cleared linked_course_id and linked_task_id in two
-- separate UPDATE statements and summed their counts, so a single Note
-- linking both a cascaded Course and a cascaded Task was counted twice.
-- notes_unlinked should be a count of distinct Notes affected, not a count
-- of link fields cleared -- one combined UPDATE (matching this repo's own
-- "single atomic statement" precedent, e.g. sweep_expired_feedback in
-- 0006_feedback.sql) clears both fields in one pass and counts distinct ids.

drop function public.soft_delete_person_cascade(uuid);

create function public.soft_delete_person_cascade(p_person_id uuid)
returns table (
  courses_affected int,
  deadlines_affected int,
  tasks_affected int,
  reminders_dismissed int,
  notes_unlinked int
)
language plpgsql
as $$
declare
  v_now timestamptz := now();
  v_course_ids uuid[];
  v_task_ids uuid[];
  v_deadline_ids uuid[];
  v_courses_affected int := 0;
  v_deadlines_affected int := 0;
  v_tasks_affected int := 0;
  v_reminders_dismissed int := 0;
  v_notes_unlinked int := 0;
begin
  update public.people
  set deleted_at = v_now
  where id = p_person_id and deleted_at is null;

  if not found then
    return query select 0, 0, 0, 0, 0;
    return;
  end if;

  select array_agg(id) into v_course_ids
  from public.courses
  where person_id = p_person_id and deleted_at is null;

  select array_agg(id) into v_task_ids
  from public.tasks
  where person_id = p_person_id and deleted_at is null;

  if v_course_ids is not null then
    select array_agg(id) into v_deadline_ids
    from public.deadlines
    where course_id = any(v_course_ids) and deleted_at is null;
  end if;

  -- Snapshot before cascading: these are exactly the reminders the
  -- trg_*_soft_delete_dismiss_reminders triggers are about to dismiss.
  select count(*) into v_reminders_dismissed
  from public.reminders
  where acknowledgment_state in ('Scheduled', 'Snoozed')
    and (
      (target_type = 'deadline' and v_deadline_ids is not null and target_id = any(v_deadline_ids))
      or (target_type = 'task' and v_task_ids is not null and target_id = any(v_task_ids))
    );

  if v_deadline_ids is not null then
    update public.deadlines
    set deleted_at = v_now
    where id = any(v_deadline_ids);
    v_deadlines_affected := array_length(v_deadline_ids, 1);
  end if;

  if v_course_ids is not null then
    update public.courses
    set deleted_at = v_now
    where id = any(v_course_ids);
    v_courses_affected := array_length(v_course_ids, 1);
  end if;

  if v_task_ids is not null then
    update public.tasks
    set deleted_at = v_now
    where id = any(v_task_ids);
    v_tasks_affected := array_length(v_task_ids, 1);
  end if;

  -- One combined UPDATE: a Note linking both a cascaded Course and a
  -- cascaded Task has both fields cleared in the same pass and is counted
  -- once, not twice.
  if v_course_ids is not null or v_task_ids is not null then
    with unlinked as (
      update public.notes
      set
        linked_course_id = case when v_course_ids is not null and linked_course_id = any(v_course_ids) then null else linked_course_id end,
        linked_task_id = case when v_task_ids is not null and linked_task_id = any(v_task_ids) then null else linked_task_id end
      where (v_course_ids is not null and linked_course_id = any(v_course_ids))
         or (v_task_ids is not null and linked_task_id = any(v_task_ids))
      returning id
    )
    select count(*) into v_notes_unlinked from unlinked;
  end if;

  return query select v_courses_affected, v_deadlines_affected, v_tasks_affected, v_reminders_dismissed, v_notes_unlinked;
end;
$$;

revoke execute on function public.soft_delete_person_cascade(uuid) from public, anon;
grant execute on function public.soft_delete_person_cascade(uuid) to authenticated;
