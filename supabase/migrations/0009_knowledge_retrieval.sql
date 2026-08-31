-- SPEC-CORE-008 NC-027, SPEC-API-008 NC-API-014/015: the knowledge_lookup
-- retrieval RPC used by src/lib/knowledge/retrieval.ts. Phase 3 of the
-- Knowledge Reference feature (see .claude/plans/... calm-metcalfe.md).
--
-- Same search_path gap as 0007_knowledge_base.sql: `extensions` isn't on
-- this migration session's default search_path, so the bare `vector(1536)`
-- parameter type below would fail to resolve at CREATE FUNCTION time even
-- though the function body sets its own search_path for runtime execution.
set search_path = public, extensions;

-- Deliberately `security invoker` (the default for `language sql`), unlike
-- every knowledge-import writer function in 0007_knowledge_base.sql: this is
-- a pure read, so it runs with the calling authenticated role's own
-- privileges and knowledge_chunks_select/knowledge_sources_select's
-- existing `auth.uid() = user_id` RLS policies apply exactly as if the join
-- were issued directly by that client. The explicit `c.user_id = auth.uid()`
-- predicate below is defense-in-depth on top of that, matching this
-- codebase's established "never rely on RLS alone" convention
-- (NC-API-013/NC-DATA-025), not the sole guard.
--
-- Security-review finding: returns user_id (rather than only the columns
-- retrieval.ts's response actually needs) specifically so the app layer has
-- something real to re-check against the caller's own userId -- without
-- this column, a "defense in depth" filter in application code would have
-- nothing to compare against and would silently protect nothing were this
-- query's own scoping ever weakened by a future edit.
create function public.match_knowledge_chunks(
  p_query_embedding vector(1536),
  p_match_threshold float,
  p_match_count int
)
returns table (
  source_id uuid,
  user_id uuid,
  title text,
  origin_url text,
  source_type public.knowledge_source_type,
  chunk_text text,
  similarity float
)
language sql
stable
set search_path = public, extensions
as $$
  select
    c.source_id,
    c.user_id,
    s.title,
    s.origin_url,
    s.source_type,
    c.chunk_text,
    1 - (c.embedding <=> p_query_embedding) as similarity
  from public.knowledge_chunks c
  join public.knowledge_sources s on s.id = c.source_id
  where c.user_id = auth.uid()
    and 1 - (c.embedding <=> p_query_embedding) >= p_match_threshold
  order by c.embedding <=> p_query_embedding
  limit p_match_count;
$$;

-- Postgres grants EXECUTE on new functions to PUBLIC by default. Restrict to
-- authenticated (matches retry_knowledge_import's grant shape, the other
-- user-callable function in this schema) — anon has no knowledge_chunks to
-- retrieve anyway, but never leave a default grant unexamined.
revoke execute on function public.match_knowledge_chunks(vector, float, int) from public, anon;
grant execute on function public.match_knowledge_chunks(vector, float, int) to authenticated;
