-- SPEC-DATA-011: Knowledge Reference schema -- knowledge_sources/knowledge_chunks,
-- pgvector, RLS, the import-status state-machine trigger, and the five named
-- SECURITY DEFINER writers of knowledge_sources.status (start/complete/fail/
-- retry/reap) that are the only path to a status change (NC-DATA-025).
--
-- Phase 1 of the Knowledge Reference feature (see
-- .claude/plans/... this-is-the-personalassistant-calm-metcalfe.md). Storage
-- bucket, worker sandboxing, and /api/knowledge routes are SPEC-INFRA-007/
-- SPEC-API-008 scope, not this migration.

create extension if not exists vector with schema extensions;

-- ---------------------------------------------------------------------------
-- Enums (NC-DATA-015, NC-DATA-028)
-- ---------------------------------------------------------------------------

create type knowledge_source_type as enum (
  'url', 'pasted_text', 'image', 'video', 'audio'
);

create type knowledge_source_status as enum (
  'Pending', 'Processing', 'Ready', 'Failed'
);

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  source_type knowledge_source_type not null,
  title text not null,
  origin_url text,
  -- Extracted/pasted text content once Ready. Retained (duplicated against
  -- knowledge_chunks.chunk_text) so a retry after a downstream failure (e.g.
  -- embedding fails after extraction succeeded) never has to re-fetch/re-OCR/
  -- re-transcribe.
  raw_content text,
  -- Set only for image/video/audio uploads; points into the Storage bucket
  -- owned by SPEC-INFRA-007.
  storage_object_path text,
  status knowledge_source_status not null default 'Pending',
  error_message text,
  attempt_count int not null default 0,
  -- The reaper's timeout predicate; distinct from updated_at, which any
  -- column write touches.
  processing_started_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Required by knowledge_chunks' composite FK below (NC-DATA-014).
  unique (id, user_id),
  -- Security-review finding: the INSERT policy below only checks
  -- `auth.uid() = user_id`, not storage_object_path -- without this, a
  -- client could hand-craft a row whose storage_object_path points into
  -- another user's Storage folder (0008_knowledge_storage.sql's bucket),
  -- and the ingestion worker (a service-role client, which bypasses that
  -- bucket's RLS) would download and OCR/transcribe someone else's upload
  -- into the attacker's own knowledge_chunks. Ties the path structurally to
  -- its own user_id rather than relying on the route's upload-path
  -- convention alone.
  constraint knowledge_sources_storage_path_owner_check check (
    storage_object_path is null or storage_object_path like (user_id::text || '/%')
  )
);

create table public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null,
  user_id uuid not null,
  chunk_index int not null,
  chunk_text text not null,
  -- OpenAI text-embedding-3-small dimensionality (NC-DATA-020).
  embedding vector(1536) not null,
  created_at timestamptz not null default now(),
  -- Structurally ties a chunk's user_id to its parent source's user_id --
  -- it can never drift, enforced declaratively rather than by trigger or
  -- app-layer discipline (NC-DATA-014).
  foreign key (source_id, user_id) references public.knowledge_sources (id, user_id) on delete cascade,
  unique (source_id, chunk_index)
);

-- ---------------------------------------------------------------------------
-- Indexes (NC-DATA-020, NC-DATA-029)
-- ---------------------------------------------------------------------------

create index knowledge_sources_user_id_idx on public.knowledge_sources (user_id);
create index knowledge_chunks_user_id_idx on public.knowledge_chunks (user_id);
create index knowledge_chunks_source_id_idx on public.knowledge_chunks (source_id);
-- Backs reap_stuck_knowledge_imports()'s scan, mirroring how
-- voice_sessions_retention_idx backs that table's sweep.
create index knowledge_sources_pending_processing_idx on public.knowledge_sources (created_at)
  where status in ('Pending', 'Processing');
-- Any retrieval query must use the <=> cosine-distance operator to actually
-- hit this index -- a query using <-> silently defeats it.
create index knowledge_chunks_embedding_hnsw_idx on public.knowledge_chunks
  using hnsw (embedding vector_cosine_ops);

-- ---------------------------------------------------------------------------
-- Import-status state-machine trigger (NC-DATA-016)
-- Fires on both status AND error_message so an UPDATE that only touches
-- error_message can't silently bypass enforcement by never touching status --
-- exactly the gap 0005_voice_session_column_lockdown.sql had to close after
-- the fact for pending_mutation/expires_at. This is defense-in-depth behind
-- NC-DATA-025's removal of the UPDATE grant, which is the primary defense.
-- ---------------------------------------------------------------------------

create function public.guard_knowledge_source_status()
returns trigger
language plpgsql
as $$
begin
  if TG_OP = 'INSERT' then
    if NEW.status is distinct from 'Pending' then
      raise exception 'knowledge_sources.status must be Pending on insert, got %', NEW.status;
    end if;
    return NEW;
  end if;

  if NEW.status is distinct from OLD.status then
    if (OLD.status, NEW.status) not in (
      ('Pending', 'Processing'),
      ('Processing', 'Ready'),
      ('Processing', 'Failed'),
      ('Pending', 'Failed'),
      ('Failed', 'Processing')
    ) then
      raise exception 'Forbidden knowledge_source_status transition: % -> %', OLD.status, NEW.status;
    end if;
  elsif NEW.error_message is distinct from OLD.error_message then
    -- No legitimate flow ever rewrites error_message without also
    -- transitioning status (fail sets both, retry clears both, the reaper
    -- sets both) -- reject anything that tries.
    raise exception 'knowledge_sources.error_message cannot change without a status transition';
  end if;
  return NEW;
end;
$$;

create trigger trg_guard_knowledge_source_status
before insert or update of status, error_message on public.knowledge_sources
for each row execute function public.guard_knowledge_source_status();

-- Reuses the existing set_updated_at() from 0001_init.sql, same as
-- courses/deadlines/tasks.
create trigger trg_knowledge_sources_set_updated_at
before update on public.knowledge_sources
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security (NC-DATA-024, NC-DATA-025)
-- ---------------------------------------------------------------------------

alter table public.knowledge_sources enable row level security;
alter table public.knowledge_chunks enable row level security;

-- knowledge_sources: select/insert/delete only, no update policy at all.
-- Every status-touching write is owned by exactly one of the five named
-- functions below -- never a generic client-issued UPDATE.
create policy knowledge_sources_select on public.knowledge_sources
  for select using (auth.uid() = user_id);
create policy knowledge_sources_insert on public.knowledge_sources
  for insert with check (auth.uid() = user_id);
create policy knowledge_sources_delete on public.knowledge_sources
  for delete using (auth.uid() = user_id);
-- Architect-review finding: NC-DATA-016 names the UPDATE grant's removal as
-- the *primary* defense (PostgREST checks the table-level grant before RLS
-- or any trigger runs at all) and the absent RLS UPDATE policy above as
-- only the fallback -- but Postgres/Supabase grants UPDATE to
-- anon/authenticated by default on every new table, and this migration
-- never explicitly revoked it (unlike knowledge_chunks below, which does).
-- Matches the explicit-revoke convention 0006_feedback.sql documents.
revoke update on public.knowledge_sources from anon, authenticated;

-- knowledge_chunks: SELECT-only for authenticated/anon. The only writer is
-- complete_knowledge_import() and the cascade delete from a knowledge_sources
-- delete. Without this, a user could hand-craft a fake embedding or rewrite
-- chunk_text so the assistant would cite a source for content it never had.
create policy knowledge_chunks_select on public.knowledge_chunks
  for select using (auth.uid() = user_id);
revoke insert, update, delete on public.knowledge_chunks from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Named writers of knowledge_sources.status (NC-DATA-023, NC-DATA-026,
-- NC-DATA-030). Each is a single CAS-guarded statement -- zero rows affected
-- means the request is rejected (already transitioned, wrong owner, or cap
-- exhausted), never a SELECT-then-conditional-UPDATE, which would reopen the
-- exact double-retry/reaper race this pattern exists to close.
-- ---------------------------------------------------------------------------

-- Pending -> Processing. Callable only by service_role.
create function public.start_knowledge_import(p_source_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer;
begin
  update public.knowledge_sources
  set status = 'Processing',
      processing_started_at = now()
  where id = p_source_id and status = 'Pending';

  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

-- Single atomic completion: replaces any prior chunk set, writes
-- raw_content, and flips status to Ready in one transaction (NC-DATA-023,
-- satisfies SPEC-CORE-008 NC-020's all-or-nothing requirement). p_chunks is a
-- jsonb array of {chunk_index, chunk_text, embedding} objects, embedding
-- given as a JSON array of floats (cast directly to vector). Callable only
-- by service_role.
create function public.complete_knowledge_import(
  p_source_id uuid,
  p_raw_content text,
  p_chunks jsonb
)
returns boolean
language plpgsql
security definer
-- extensions is required here (unlike the other functions in this file)
-- because the body casts to ::vector, a type pgvector installs into the
-- extensions schema, not public.
set search_path = public, extensions
as $$
declare
  v_user_id uuid;
  v_updated integer;
begin
  update public.knowledge_sources
  set raw_content = p_raw_content,
      status = 'Ready',
      error_message = null
  where id = p_source_id and status = 'Processing'
  returning user_id into v_user_id;

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    return false;
  end if;

  delete from public.knowledge_chunks where source_id = p_source_id;

  insert into public.knowledge_chunks (source_id, user_id, chunk_index, chunk_text, embedding)
  select
    p_source_id,
    v_user_id,
    (elem->>'chunk_index')::int,
    elem->>'chunk_text',
    (elem->>'embedding')::vector
  from jsonb_array_elements(p_chunks) as elem;

  return true;
end;
$$;

-- Processing -> Failed, recording the caller-supplied error_message.
-- Callable only by service_role.
create function public.fail_knowledge_import(p_source_id uuid, p_error_message text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer;
begin
  update public.knowledge_sources
  set status = 'Failed',
      error_message = p_error_message
  where id = p_source_id and status = 'Processing';

  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

-- User-initiated retry: enforces ownership, Failed-state, and the attempt
-- cap (KNOWLEDGE_MAX_RETRY_ATTEMPTS = 3, SPEC-CORE-008 NC-022) in the same
-- CAS predicate. Re-stamps processing_started_at so the reaper's window
-- restarts cleanly rather than reaping a freshly-retried row on the very
-- next tick. auth.uid() inside a SECURITY DEFINER function still resolves
-- from the caller's JWT, so per-caller ownership checking works correctly
-- here. Callable by authenticated.
create function public.retry_knowledge_import(p_source_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer;
begin
  update public.knowledge_sources
  set status = 'Processing',
      attempt_count = attempt_count + 1,
      processing_started_at = now(),
      error_message = null
  where id = p_source_id
    and user_id = auth.uid()
    and status = 'Failed'
    and attempt_count < 3 -- KNOWLEDGE_MAX_RETRY_ATTEMPTS
  ;

  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

-- Transitions stranded Pending/Processing rows to Failed once
-- KNOWLEDGE_IMPORT_TIMEOUT_MINUTES = 10 elapses (strictly longer than
-- SPEC-INFRA-007's 5-minute maxDuration, so a still-legitimately-running
-- import is never reaped out from under itself -- NC-DATA-027). Pure SQL, no
-- external HTTP/API call, invoked directly and synchronously from
-- cron.schedule below. Callable only by service_role.
create function public.reap_stuck_knowledge_imports()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reaped integer;
begin
  update public.knowledge_sources
  set status = 'Failed',
      error_message = 'Import timed out before completing.'
  where status in ('Pending', 'Processing')
    and coalesce(processing_started_at, created_at) < now() - interval '10 minutes';

  get diagnostics v_reaped = row_count;
  return v_reaped;
end;
$$;

-- ---------------------------------------------------------------------------
-- SECURITY DEFINER lockdown. Postgres grants EXECUTE on new functions to
-- PUBLIC by default -- every function above bypasses RLS as its owner, so
-- that default must be revoked explicitly, same as every prior SECURITY
-- DEFINER function in this schema.
-- ---------------------------------------------------------------------------

revoke execute on function public.start_knowledge_import(uuid) from public, anon, authenticated;
grant execute on function public.start_knowledge_import(uuid) to service_role;

revoke execute on function public.complete_knowledge_import(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.complete_knowledge_import(uuid, text, jsonb) to service_role;

revoke execute on function public.fail_knowledge_import(uuid, text) from public, anon, authenticated;
grant execute on function public.fail_knowledge_import(uuid, text) to service_role;

revoke execute on function public.retry_knowledge_import(uuid) from public, anon;
grant execute on function public.retry_knowledge_import(uuid) to authenticated;

revoke execute on function public.reap_stuck_knowledge_imports() from public, anon, authenticated;
grant execute on function public.reap_stuck_knowledge_imports() to service_role;

-- Every 5 minutes -- half the 10-minute timeout window, so a stuck row is
-- caught within one extra cycle at worst. In-process, synchronous, no
-- pg_net/Edge-Function hop (mirrors dispatch_due_reminders/
-- sweep_expired_feedback and preserves SPEC-INFRA-006's job_run_details-
-- truthfulness rule).
select cron.schedule(
  'reap-stuck-knowledge-imports',
  '*/5 * * * *',
  $cron$select public.reap_stuck_knowledge_imports();$cron$
);
