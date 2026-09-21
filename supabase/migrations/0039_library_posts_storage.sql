-- Private Storage bucket for Library post screenshots (full + thumbnail
-- objects, both under `{user_id}/…`). Same shape as
-- 0033_task_attachments_storage.sql: write-once from the client's
-- perspective (no update policy), ownership checked purely from the path's
-- first segment.

insert into storage.buckets (id, name, public)
values ('library-post-images', 'library-post-images', false)
on conflict (id) do nothing;

create policy library_post_images_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'library-post-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy library_post_images_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'library-post-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy library_post_images_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'library-post-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
