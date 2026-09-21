-- Library (Phase 2): employers + their applications/roles. Same `library_`
-- prefix and conventions as 0038 (soft delete, RLS, guard triggers, active_*
-- views). Contacts link to the existing People table; posts can link to
-- employers; each application keeps an append-only status history that the
-- DB itself writes (it cannot be backfilled later).

create table public.library_employers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  website text check (website is null or (website ~* '^https?://' and char_length(website) <= 2048)),
  careers_url text check (careers_url is null or (careers_url ~* '^https?://' and char_length(careers_url) <= 2048)),
  notes text not null default '',
  archived_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index library_employers_user_id_idx on public.library_employers (user_id);
create index library_employers_user_created_idx on public.library_employers (user_id, created_at desc) where deleted_at is null;
create index library_employers_deleted_at_idx on public.library_employers (deleted_at) where deleted_at is not null;
-- One live employer per name (case-insensitive) per user; soft-deleting frees the name.
create unique index library_employers_user_name_uidx
  on public.library_employers (user_id, lower(name))
  where deleted_at is null;

alter table public.library_employers enable row level security;

-- Soft-delete-only (NC-DATA-005): no DELETE policy.
create policy library_employers_select on public.library_employers
  for select using (auth.uid() = user_id);
create policy library_employers_insert on public.library_employers
  for insert with check (auth.uid() = user_id);
create policy library_employers_update on public.library_employers
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create trigger trg_library_employers_set_updated_at
before update on public.library_employers
for each row execute function public.set_updated_at();

create view public.active_library_employers with (security_invoker = on) as
  select * from public.library_employers where deleted_at is null;

revoke insert, update, delete on public.active_library_employers from anon, authenticated;

-- ---------------------------------------------------------------------------
-- library_applications: one role at an employer, moving through the pipeline.
-- `status` moves any-to-any, but only through POST .../transition (the PATCH
-- schema omits it); status_changed_at drives "days in stage".
-- ---------------------------------------------------------------------------

create table public.library_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  employer_id uuid not null references public.library_employers(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  job_url text check (job_url is null or (job_url ~* '^https?://' and char_length(job_url) <= 2048)),
  -- Canonical form of job_url (src/lib/library/url.ts normalizeJobUrl); set/cleared together with job_url.
  normalized_job_url text,
  location text check (location is null or char_length(location) <= 200),
  work_mode text check (work_mode is null or work_mode in ('remote', 'hybrid', 'onsite')),
  salary_min numeric check (salary_min is null or salary_min >= 0),
  salary_max numeric check (salary_max is null or salary_max >= 0),
  salary_currency text check (salary_currency is null or salary_currency ~ '^[A-Z]{3}$'),
  salary_period text check (salary_period is null or salary_period in ('year', 'month', 'hour')),
  tech_stack text[] not null default '{}',
  date_found date not null default current_date,
  status text not null default 'interested'
    check (status in ('interested', 'applied', 'interviewing', 'offer', 'rejected', 'withdrawn')),
  status_changed_at timestamptz not null default now(),
  notes text not null default '',
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint library_applications_job_url_pair_chk check ((job_url is null) = (normalized_job_url is null)),
  constraint library_applications_salary_range_chk check (salary_min is null or salary_max is null or salary_max >= salary_min)
);

create index library_applications_user_id_idx on public.library_applications (user_id);
create index library_applications_employer_idx on public.library_applications (employer_id) where deleted_at is null;
create index library_applications_user_status_idx on public.library_applications (user_id, status) where deleted_at is null;
create index library_applications_deleted_at_idx on public.library_applications (deleted_at) where deleted_at is not null;
create index library_applications_tech_stack_idx on public.library_applications using gin (tech_stack);
create unique index library_applications_user_job_url_uidx
  on public.library_applications (user_id, normalized_job_url)
  where deleted_at is null and normalized_job_url is not null;

alter table public.library_applications enable row level security;

create policy library_applications_select on public.library_applications
  for select using (auth.uid() = user_id);
create policy library_applications_insert on public.library_applications
  for insert with check (auth.uid() = user_id);
create policy library_applications_update on public.library_applications
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create trigger trg_library_applications_set_updated_at
before update on public.library_applications
for each row execute function public.set_updated_at();

create view public.active_library_applications with (security_invoker = on) as
  select * from public.library_applications where deleted_at is null;

revoke insert, update, delete on public.active_library_applications from anon, authenticated;

-- An application's employer must be a live employer owned by the application's user.
create function public.guard_library_application_ownership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.library_employers where id = NEW.employer_id and user_id = NEW.user_id and deleted_at is null
  ) then
    raise exception 'library_applications.employer_id must reference a library_employers row owned by library_applications.user_id';
  end if;
  return NEW;
end;
$$;

create trigger trg_guard_library_application_ownership
before insert or update of employer_id, user_id on public.library_applications
for each row execute function public.guard_library_application_ownership();

-- status_changed_at follows status (whatever the client sends for it is overridden).
create function public.library_application_touch_status()
returns trigger
language plpgsql
as $$
begin
  if NEW.status is distinct from OLD.status then
    NEW.status_changed_at := now();
  else
    NEW.status_changed_at := OLD.status_changed_at;
  end if;
  return NEW;
end;
$$;

create trigger trg_library_application_touch_status
before update on public.library_applications
for each row execute function public.library_application_touch_status();

-- ---------------------------------------------------------------------------
-- library_application_events: append-only status history. Written only by the
-- trigger below (SECURITY DEFINER); clients get select-only RLS, so history
-- cannot be forged or edited through the API.
-- ---------------------------------------------------------------------------

create table public.library_application_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  application_id uuid not null references public.library_applications(id) on delete cascade,
  -- null on the insert event (an application's first status).
  from_status text check (from_status is null or from_status in ('interested', 'applied', 'interviewing', 'offer', 'rejected', 'withdrawn')),
  to_status text not null check (to_status in ('interested', 'applied', 'interviewing', 'offer', 'rejected', 'withdrawn')),
  created_at timestamptz not null default now()
);

create index library_application_events_application_idx on public.library_application_events (application_id, created_at);
create index library_application_events_user_id_idx on public.library_application_events (user_id);

alter table public.library_application_events enable row level security;

create policy library_application_events_select on public.library_application_events
  for select using (auth.uid() = user_id);

create function public.record_library_application_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    insert into public.library_application_events (user_id, application_id, from_status, to_status)
    values (NEW.user_id, NEW.id, null, NEW.status);
  elsif NEW.status is distinct from OLD.status then
    insert into public.library_application_events (user_id, application_id, from_status, to_status)
    values (NEW.user_id, NEW.id, OLD.status, NEW.status);
  end if;
  return NEW;
end;
$$;

create trigger trg_record_library_application_event_insert
after insert on public.library_applications
for each row execute function public.record_library_application_event();

create trigger trg_record_library_application_event_update
after update of status on public.library_applications
for each row execute function public.record_library_application_event();

-- ---------------------------------------------------------------------------
-- library_interviews: the interview log for an application.
-- ---------------------------------------------------------------------------

create table public.library_interviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  application_id uuid not null references public.library_applications(id) on delete cascade,
  round_label text not null check (char_length(round_label) between 1 and 120),
  kind text not null default 'other'
    check (kind in ('screen', 'technical', 'onsite', 'behavioral', 'take_home', 'other')),
  scheduled_at timestamptz,
  outcome text not null default 'pending' check (outcome in ('pending', 'passed', 'failed', 'cancelled')),
  interviewer_person_id uuid references public.people(id) on delete set null,
  notes text not null default '',
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index library_interviews_user_id_idx on public.library_interviews (user_id);
create index library_interviews_application_idx
  on public.library_interviews (application_id, scheduled_at, created_at) where deleted_at is null;
create index library_interviews_deleted_at_idx on public.library_interviews (deleted_at) where deleted_at is not null;

alter table public.library_interviews enable row level security;

create policy library_interviews_select on public.library_interviews
  for select using (auth.uid() = user_id);
create policy library_interviews_insert on public.library_interviews
  for insert with check (auth.uid() = user_id);
create policy library_interviews_update on public.library_interviews
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create trigger trg_library_interviews_set_updated_at
before update on public.library_interviews
for each row execute function public.set_updated_at();

create view public.active_library_interviews with (security_invoker = on) as
  select * from public.library_interviews where deleted_at is null;

revoke insert, update, delete on public.active_library_interviews from anon, authenticated;

-- An interview's application must be live + owned; an interviewer (optional) must be an owned person.
create function public.guard_library_interview_ownership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.library_applications where id = NEW.application_id and user_id = NEW.user_id and deleted_at is null
  ) then
    raise exception 'library_interviews.application_id must reference a library_applications row owned by library_interviews.user_id';
  end if;
  if NEW.interviewer_person_id is not null and not exists (
    select 1 from public.people where id = NEW.interviewer_person_id and user_id = NEW.user_id and deleted_at is null
  ) then
    raise exception 'library_interviews.interviewer_person_id must reference a people row owned by library_interviews.user_id';
  end if;
  return NEW;
end;
$$;

create trigger trg_guard_library_interview_ownership
before insert or update of application_id, interviewer_person_id, user_id on public.library_interviews
for each row execute function public.guard_library_interview_ownership();

-- ---------------------------------------------------------------------------
-- library_employer_contacts: People an employer is linked to (recruiter,
-- referral, ...). Carries attributes, so it has per-item endpoints rather
-- than a sync RPC. Real deletes, like the other link tables.
-- ---------------------------------------------------------------------------

create table public.library_employer_contacts (
  employer_id uuid not null references public.library_employers(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null default 'other' check (kind in ('recruiter', 'referral', 'hiring_manager', 'other')),
  note text not null default '' check (char_length(note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (employer_id, person_id)
);

create index library_employer_contacts_person_idx on public.library_employer_contacts (person_id);
create index library_employer_contacts_user_id_idx on public.library_employer_contacts (user_id);

alter table public.library_employer_contacts enable row level security;

create policy library_employer_contacts_select on public.library_employer_contacts
  for select using (auth.uid() = user_id);
create policy library_employer_contacts_insert on public.library_employer_contacts
  for insert with check (auth.uid() = user_id);
create policy library_employer_contacts_update on public.library_employer_contacts
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy library_employer_contacts_delete on public.library_employer_contacts
  for delete using (auth.uid() = user_id);

create trigger trg_library_employer_contacts_set_updated_at
before update on public.library_employer_contacts
for each row execute function public.set_updated_at();

create function public.guard_library_employer_contact_ownership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.library_employers where id = NEW.employer_id and user_id = NEW.user_id and deleted_at is null
  ) then
    raise exception 'library_employer_contacts.employer_id must reference a library_employers row owned by library_employer_contacts.user_id';
  end if;
  if not exists (
    select 1 from public.people where id = NEW.person_id and user_id = NEW.user_id and deleted_at is null
  ) then
    raise exception 'library_employer_contacts.person_id must reference a people row owned by library_employer_contacts.user_id';
  end if;
  return NEW;
end;
$$;

create trigger trg_guard_library_employer_contact_ownership
before insert on public.library_employer_contacts
for each row execute function public.guard_library_employer_contact_ownership();

-- ---------------------------------------------------------------------------
-- library_post_employers: additive Phase 2 link from a saved post to an
-- employer. Phase 1's sync functions are untouched.
-- ---------------------------------------------------------------------------

create table public.library_post_employers (
  post_id uuid not null references public.library_posts(id) on delete cascade,
  employer_id uuid not null references public.library_employers(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, employer_id)
);

create index library_post_employers_employer_idx on public.library_post_employers (employer_id);
create index library_post_employers_user_id_idx on public.library_post_employers (user_id);

alter table public.library_post_employers enable row level security;

create policy library_post_employers_select on public.library_post_employers
  for select using (auth.uid() = user_id);
create policy library_post_employers_insert on public.library_post_employers
  for insert with check (auth.uid() = user_id);
create policy library_post_employers_delete on public.library_post_employers
  for delete using (auth.uid() = user_id);

create function public.guard_library_post_employer_ownership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.library_posts where id = NEW.post_id and user_id = NEW.user_id and deleted_at is null
  ) then
    raise exception 'library_post_employers.post_id must reference a library_posts row owned by library_post_employers.user_id';
  end if;
  if not exists (
    select 1 from public.library_employers where id = NEW.employer_id and user_id = NEW.user_id and deleted_at is null
  ) then
    raise exception 'library_post_employers.employer_id must reference a library_employers row owned by library_post_employers.user_id';
  end if;
  return NEW;
end;
$$;

create trigger trg_guard_library_post_employer_ownership
before insert on public.library_post_employers
for each row execute function public.guard_library_post_employer_ownership();

create function public.sync_library_post_employers(p_post_id uuid, p_employer_ids uuid[])
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
    raise exception 'sync_library_post_employers: post % not found', p_post_id;
  end if;

  delete from public.library_post_employers where post_id = p_post_id;

  if p_employer_ids is not null and array_length(p_employer_ids, 1) > 0 then
    insert into public.library_post_employers (post_id, employer_id, user_id)
    select p_post_id, employer_id, v_user_id
    from (select distinct unnest(p_employer_ids) as employer_id) as ids;
  end if;
end;
$$;

revoke execute on function public.sync_library_post_employers(uuid, uuid[]) from public, anon;
grant execute on function public.sync_library_post_employers(uuid, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Library's own employer cascade (soft_delete_person_cascade shape, 0017).
-- Soft-deletes the employer + its applications + their interviews, and
-- hard-deletes its contacts and post links (real unlinks, nothing to
-- preserve). SECURITY INVOKER: RLS keeps every statement on the caller's
-- rows. Does not touch soft_delete_person_cascade / soft_delete_course_cascade.
-- ---------------------------------------------------------------------------

create function public.soft_delete_library_employer_cascade(p_employer_id uuid)
returns table (
  applications_affected int,
  interviews_affected int,
  contacts_removed int,
  post_links_removed int
)
language plpgsql
as $$
declare
  v_now timestamptz := now();
  v_application_ids uuid[];
  v_applications_affected int := 0;
  v_interviews_affected int := 0;
  v_contacts_removed int := 0;
  v_post_links_removed int := 0;
begin
  update public.library_employers
  set deleted_at = v_now
  where id = p_employer_id and deleted_at is null;

  if not found then
    return query select 0, 0, 0, 0;
    return;
  end if;

  select array_agg(id) into v_application_ids
  from public.library_applications
  where employer_id = p_employer_id and deleted_at is null;

  if v_application_ids is not null then
    with gone as (
      update public.library_interviews
      set deleted_at = v_now
      where application_id = any(v_application_ids) and deleted_at is null
      returning id
    )
    select count(*) into v_interviews_affected from gone;

    update public.library_applications
    set deleted_at = v_now
    where id = any(v_application_ids);
    v_applications_affected := array_length(v_application_ids, 1);
  end if;

  with gone as (
    delete from public.library_employer_contacts where employer_id = p_employer_id returning person_id
  )
  select count(*) into v_contacts_removed from gone;

  with gone as (
    delete from public.library_post_employers where employer_id = p_employer_id returning post_id
  )
  select count(*) into v_post_links_removed from gone;

  return query select v_applications_affected, v_interviews_affected, v_contacts_removed, v_post_links_removed;
end;
$$;

revoke execute on function public.soft_delete_library_employer_cascade(uuid) from public, anon;
grant execute on function public.soft_delete_library_employer_cascade(uuid) to authenticated;
