-- Library (Phase 1): saved social-media posts. Everything Library-owned is
-- prefixed `library_` so it stays greppable and removable, and so the AI
-- assistant / voice / search layers can be proven blind to it (see
-- src/lib/library/__tests__/isolation.test.ts).
--
-- Facebook/Instagram block scraping, so a post is the user's own title +
-- notes + tags + uploaded screenshots, with an optional URL kept for
-- reference (and de-duplication via normalized_url).

create table public.library_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  url text check (url is null or (url ~* '^https?://' and char_length(url) <= 2048)),
  -- Canonical form of url (src/lib/library/url.ts normalizePostUrl); set/cleared together with url.
  normalized_url text,
  platform text not null default 'other' check (platform in ('facebook', 'instagram', 'other')),
  author_name text,
  notes text not null default '',
  tags text[] not null default '{}',
  is_favorite boolean not null default false,
  archived_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint library_posts_url_pair_chk check ((url is null) = (normalized_url is null))
);

create index library_posts_user_id_idx on public.library_posts (user_id);
create index library_posts_user_created_idx on public.library_posts (user_id, created_at desc) where deleted_at is null;
create index library_posts_deleted_at_idx on public.library_posts (deleted_at) where deleted_at is not null;
create index library_posts_tags_idx on public.library_posts using gin (tags);
-- A URL may be saved once per user among live posts; soft-deleting frees it again.
create unique index library_posts_user_normalized_url_uidx
  on public.library_posts (user_id, normalized_url)
  where deleted_at is null and normalized_url is not null;

alter table public.library_posts enable row level security;

-- Soft-delete-only (NC-DATA-005): no DELETE policy.
create policy library_posts_select on public.library_posts
  for select using (auth.uid() = user_id);
create policy library_posts_insert on public.library_posts
  for insert with check (auth.uid() = user_id);
create policy library_posts_update on public.library_posts
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create trigger trg_library_posts_set_updated_at
before update on public.library_posts
for each row execute function public.set_updated_at();

create view public.active_library_posts with (security_invoker = on) as
  select * from public.library_posts where deleted_at is null;

revoke insert, update, delete on public.active_library_posts from anon, authenticated;

-- ---------------------------------------------------------------------------
-- library_post_images: screenshots. Bytes live in the private
-- `library-post-images` bucket (0039); a soft-deleted row deliberately keeps
-- its bytes (Postgres can't call Storage, and this app never purges
-- soft-deleted data anywhere yet).
-- ---------------------------------------------------------------------------

create table public.library_post_images (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid not null references public.library_posts(id) on delete cascade,
  storage_path text not null unique,
  thumb_path text not null,
  mime_type text not null,
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  size_bytes integer not null check (size_bytes >= 0),
  position integer not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index library_post_images_user_id_idx on public.library_post_images (user_id);
create index library_post_images_post_idx
  on public.library_post_images (post_id, position, created_at) where deleted_at is null;
create index library_post_images_deleted_at_idx on public.library_post_images (deleted_at) where deleted_at is not null;

alter table public.library_post_images enable row level security;

create policy library_post_images_select on public.library_post_images
  for select using (auth.uid() = user_id);
create policy library_post_images_insert on public.library_post_images
  for insert with check (auth.uid() = user_id);
create policy library_post_images_update on public.library_post_images
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create trigger trg_library_post_images_set_updated_at
before update on public.library_post_images
for each row execute function public.set_updated_at();

create view public.active_library_post_images with (security_invoker = on) as
  select * from public.library_post_images where deleted_at is null;

revoke insert, update, delete on public.active_library_post_images from anon, authenticated;

-- An image's post must be a live post owned by the image's user, and a post
-- holds at most 10 live images (mirrors MAX_IMAGES_PER_POST in
-- src/lib/library/constants.ts).
create function public.guard_library_post_image_ownership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.library_posts where id = NEW.post_id and user_id = NEW.user_id and deleted_at is null
  ) then
    raise exception 'library_post_images.post_id must reference a library_posts row owned by library_post_images.user_id';
  end if;
  if TG_OP = 'INSERT' and (
    select count(*) from public.library_post_images where post_id = NEW.post_id and deleted_at is null
  ) >= 10 then
    raise exception 'a library post can hold at most 10 images';
  end if;
  return NEW;
end;
$$;

create trigger trg_guard_library_post_image_ownership
before insert or update of post_id, user_id on public.library_post_images
for each row execute function public.guard_library_post_image_ownership();

-- ---------------------------------------------------------------------------
-- Link tables (task_labels shape, 0031): real deletes, no history worth
-- keeping when a post is unlinked from a person/course.
-- ---------------------------------------------------------------------------

create table public.library_post_people (
  post_id uuid not null references public.library_posts(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, person_id)
);

create index library_post_people_person_idx on public.library_post_people (person_id);
create index library_post_people_user_id_idx on public.library_post_people (user_id);

alter table public.library_post_people enable row level security;

create policy library_post_people_select on public.library_post_people
  for select using (auth.uid() = user_id);
create policy library_post_people_insert on public.library_post_people
  for insert with check (auth.uid() = user_id);
create policy library_post_people_delete on public.library_post_people
  for delete using (auth.uid() = user_id);

create function public.guard_library_post_person_ownership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.library_posts where id = NEW.post_id and user_id = NEW.user_id and deleted_at is null
  ) then
    raise exception 'library_post_people.post_id must reference a library_posts row owned by library_post_people.user_id';
  end if;
  if not exists (
    select 1 from public.people where id = NEW.person_id and user_id = NEW.user_id and deleted_at is null
  ) then
    raise exception 'library_post_people.person_id must reference a people row owned by library_post_people.user_id';
  end if;
  return NEW;
end;
$$;

create trigger trg_guard_library_post_person_ownership
before insert on public.library_post_people
for each row execute function public.guard_library_post_person_ownership();

create table public.library_post_courses (
  post_id uuid not null references public.library_posts(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, course_id)
);

create index library_post_courses_course_idx on public.library_post_courses (course_id);
create index library_post_courses_user_id_idx on public.library_post_courses (user_id);

alter table public.library_post_courses enable row level security;

create policy library_post_courses_select on public.library_post_courses
  for select using (auth.uid() = user_id);
create policy library_post_courses_insert on public.library_post_courses
  for insert with check (auth.uid() = user_id);
create policy library_post_courses_delete on public.library_post_courses
  for delete using (auth.uid() = user_id);

create function public.guard_library_post_course_ownership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.library_posts where id = NEW.post_id and user_id = NEW.user_id and deleted_at is null
  ) then
    raise exception 'library_post_courses.post_id must reference a library_posts row owned by library_post_courses.user_id';
  end if;
  if not exists (
    select 1 from public.courses where id = NEW.course_id and user_id = NEW.user_id and deleted_at is null
  ) then
    raise exception 'library_post_courses.course_id must reference a courses row owned by library_post_courses.user_id';
  end if;
  return NEW;
end;
$$;

create trigger trg_guard_library_post_course_ownership
before insert on public.library_post_courses
for each row execute function public.guard_library_post_course_ownership();

-- ---------------------------------------------------------------------------
-- Atomic set-replacement RPCs (sync_task_labels shape, 0031). SECURITY
-- INVOKER: every statement stays scoped by the link tables' own RLS.
-- ---------------------------------------------------------------------------

create function public.sync_library_post_people(p_post_id uuid, p_person_ids uuid[])
returns void
language plpgsql
as $$
declare
  v_user_id uuid;
begin
  select user_id into v_user_id
  from public.library_posts
  where id = p_post_id and deleted_at is null;

  if v_user_id is null then
    raise exception 'sync_library_post_people: post % not found', p_post_id;
  end if;

  delete from public.library_post_people where post_id = p_post_id;

  if p_person_ids is not null and array_length(p_person_ids, 1) > 0 then
    insert into public.library_post_people (post_id, person_id, user_id)
    select p_post_id, person_id, v_user_id
    from (select distinct unnest(p_person_ids) as person_id) as ids;
  end if;
end;
$$;

revoke execute on function public.sync_library_post_people(uuid, uuid[]) from public, anon;
grant execute on function public.sync_library_post_people(uuid, uuid[]) to authenticated;

create function public.sync_library_post_courses(p_post_id uuid, p_course_ids uuid[])
returns void
language plpgsql
as $$
declare
  v_user_id uuid;
begin
  select user_id into v_user_id
  from public.library_posts
  where id = p_post_id and deleted_at is null;

  if v_user_id is null then
    raise exception 'sync_library_post_courses: post % not found', p_post_id;
  end if;

  delete from public.library_post_courses where post_id = p_post_id;

  if p_course_ids is not null and array_length(p_course_ids, 1) > 0 then
    insert into public.library_post_courses (post_id, course_id, user_id)
    select p_post_id, course_id, v_user_id
    from (select distinct unnest(p_course_ids) as course_id) as ids;
  end if;
end;
$$;

revoke execute on function public.sync_library_post_courses(uuid, uuid[]) from public, anon;
grant execute on function public.sync_library_post_courses(uuid, uuid[]) to authenticated;

-- Tag chip counts for the caller's live posts.
create function public.library_post_tag_counts()
returns table (tag text, n bigint)
language sql
stable
as $$
  select t.tag, count(*) as n
  from public.library_posts p
  cross join lateral unnest(p.tags) as t(tag)
  where p.user_id = auth.uid() and p.deleted_at is null
  group by t.tag
  order by count(*) desc, t.tag asc;
$$;

revoke execute on function public.library_post_tag_counts() from public, anon;
grant execute on function public.library_post_tag_counts() to authenticated;
