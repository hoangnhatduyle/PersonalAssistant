-- Knowledge graph view: manual source-to-source links plus the two read
-- functions the graph endpoint composes (node list with a text snippet, and
-- similarity-derived "suggested" edges computed from existing embeddings).

set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- knowledge_links: undirected manual links between two of the caller's own
-- sources. Stored in canonical order (source_a < source_b) so a pair can only
-- ever exist once, regardless of which end the user linked from.
-- ---------------------------------------------------------------------------

create table public.knowledge_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  source_a uuid not null,
  source_b uuid not null,
  created_at timestamptz not null default now(),
  -- Same composite-FK pattern as knowledge_chunks (0007): both endpoints are
  -- structurally tied to this row's user_id, so a link can never span users.
  foreign key (source_a, user_id) references public.knowledge_sources (id, user_id) on delete cascade,
  foreign key (source_b, user_id) references public.knowledge_sources (id, user_id) on delete cascade,
  check (source_a < source_b),
  unique (source_a, source_b)
);

create index knowledge_links_user_id_idx on public.knowledge_links (user_id);
create index knowledge_links_source_b_idx on public.knowledge_links (source_b);

alter table public.knowledge_links enable row level security;

create policy knowledge_links_select on public.knowledge_links
  for select using (auth.uid() = user_id);
create policy knowledge_links_insert on public.knowledge_links
  for insert with check (auth.uid() = user_id);
create policy knowledge_links_delete on public.knowledge_links
  for delete using (auth.uid() = user_id);
-- A link is created or deleted, never edited (matches 0007's explicit-revoke
-- convention rather than relying on the absent UPDATE policy alone).
revoke update on public.knowledge_links from anon, authenticated;

-- ---------------------------------------------------------------------------
-- knowledge_graph_nodes: the caller's sources with a short text snippet for
-- the hover preview. raw_content is deliberately never selected by the public
-- list route (KNOWLEDGE_SOURCE_PUBLIC_COLUMNS), so the truncation happens
-- here rather than shipping full text for every node.
-- SECURITY INVOKER: knowledge_sources_select RLS applies as if issued
-- directly; the explicit user_id predicate is defense-in-depth.
-- ---------------------------------------------------------------------------

create function public.knowledge_graph_nodes(p_snippet_chars int)
returns table (
  id uuid,
  title text,
  source_type public.knowledge_source_type,
  origin_url text,
  status public.knowledge_source_status,
  snippet text
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select
    s.id,
    s.title,
    s.source_type,
    s.origin_url,
    s.status,
    left(s.raw_content, greatest(p_snippet_chars, 0)) as snippet
  from public.knowledge_sources s
  where s.user_id = auth.uid()
  order by s.created_at desc;
$$;

-- ---------------------------------------------------------------------------
-- knowledge_similar_edges: suggested links between Ready sources. Each
-- source is represented by the centroid (mean) of its chunk embeddings; a
-- pair is kept when its cosine similarity clears p_threshold AND it is within
-- the top p_top_k neighbours of at least one of its two endpoints. Uses the
-- <=> operator like match_knowledge_chunks. Pairwise, so O(n^2) in the
-- caller's Ready source count.
-- ---------------------------------------------------------------------------

create function public.knowledge_similar_edges(p_threshold float, p_top_k int)
returns table (
  source_a uuid,
  source_b uuid,
  similarity float
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with centroids as (
    select c.source_id, avg(c.embedding) as centroid
    from public.knowledge_chunks c
    join public.knowledge_sources s on s.id = c.source_id
    where c.user_id = auth.uid()
      and s.user_id = auth.uid()
      and s.status = 'Ready'
    group by c.source_id
  ),
  pairs as (
    select
      a.source_id as source_a,
      b.source_id as source_b,
      1 - (a.centroid <=> b.centroid) as similarity
    from centroids a
    join centroids b on a.source_id < b.source_id
    where 1 - (a.centroid <=> b.centroid) >= p_threshold
  ),
  directed as (
    select source_a as node, source_a, source_b, similarity from pairs
    union all
    select source_b as node, source_a, source_b, similarity from pairs
  ),
  ranked as (
    select
      d.source_a,
      d.source_b,
      d.similarity,
      row_number() over (partition by d.node order by d.similarity desc, d.source_a, d.source_b) as neighbour_rank
    from directed d
  )
  select distinct r.source_a, r.source_b, r.similarity
  from ranked r
  where r.neighbour_rank <= p_top_k;
$$;

revoke execute on function public.knowledge_graph_nodes(int) from public, anon;
grant execute on function public.knowledge_graph_nodes(int) to authenticated;
revoke execute on function public.knowledge_similar_edges(float, int) from public, anon;
grant execute on function public.knowledge_similar_edges(float, int) to authenticated;
