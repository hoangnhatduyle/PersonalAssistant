-- SPEC-INFRA-007: private Supabase Storage bucket for uploaded knowledge
-- source bytes (image/video/audio), RLS-scoped to the owning user
-- (NC-INF-009). Phase 2 of the Knowledge Reference feature (see
-- .claude/plans/... this-is-the-personalassistant-calm-metcalfe.md).
--
-- Objects are stored under `{user_id}/{random_uuid}` (the create route
-- uploads before it knows the row's own id -- knowledge_sources has no
-- UPDATE grant, see src/app/api/knowledge/route.ts) and the resulting path
-- is written into knowledge_sources.storage_object_path at insert time, so
-- every policy below can check ownership purely from the path's first
-- segment without a join.

insert into storage.buckets (id, name, public)
values ('knowledge-uploads', 'knowledge-uploads', false)
on conflict (id) do nothing;

-- Write-once from the client's perspective (uploaded at create time only;
-- retry re-reads the same object, delete-and-reimport is the only "edit"
-- path) -- no update policy, mirroring knowledge_sources' own grant model.
create policy knowledge_uploads_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'knowledge-uploads'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy knowledge_uploads_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'knowledge-uploads'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy knowledge_uploads_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'knowledge-uploads'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
