-- Private Supabase Storage bucket for uploaded task-attachment bytes
-- (kind='file' rows only — a 'link' attachment stores no bytes here), RLS-
-- scoped to the owning user. Copies 0008_knowledge_storage.sql's shape
-- exactly: objects are stored under `{user_id}/{random_uuid}` (the create
-- route uploads before it knows the row's own id, same reasoning as
-- Knowledge — task_attachments' own RLS has no client-facing UPDATE of
-- storage_object_path either) and every policy below checks ownership
-- purely from the path's first segment, no join needed.

insert into storage.buckets (id, name, public)
values ('card-attachments', 'card-attachments', false)
on conflict (id) do nothing;

-- Write-once from the client's perspective (uploaded at create time only) --
-- no update policy, mirroring task_attachments' own grant model (no
-- UPDATE-able storage fields, only `title` is ever PATCHed).
create policy card_attachments_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'card-attachments'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy card_attachments_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'card-attachments'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy card_attachments_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'card-attachments'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
