-- ---------------------------------------------------------------------------
-- guard_todo_list_course_ownership (0015_course_todos.sql) only checked that
-- a todo_list's course_id references a Course owned by the same user_id --
-- it never checked that Course has no assigned Person (People feature,
-- 0013_people.sql). A Course To-Do list is an owner-only concept (like
-- Deadlines and Deadline Sessions -- see the People feature's product
-- decision documented in src/lib/voice/schedule-loader.ts), so a tracked
-- Person's Course must never be a valid target either. Mirrors the same
-- `and person_id is null` guard pattern already used by
-- guard_course_person_ownership/guard_task_person_ownership.
-- ---------------------------------------------------------------------------

create or replace function public.guard_todo_list_course_ownership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.course_id is not null and not exists (
    select 1 from public.courses where id = NEW.course_id and user_id = NEW.user_id and deleted_at is null and person_id is null
  ) then
    raise exception 'todo_lists.course_id must reference a Course owned by todo_lists.user_id with no assigned Person';
  end if;
  return NEW;
end;
$$;
